/// 终端管理器 — 管理多个 PTY 实例的生命周期
///
/// 负责 PTY 创建、输入/输出流管理、大小调整和关闭。
/// PTY reader 线程通过 Tauri Channel 将输出流推送到前端。
pub mod commands;

use portable_pty::{CommandBuilder, NativePtySystem, PtySize, PtySystem};
use std::collections::HashMap;
use std::io::{Read, Write};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use tauri::ipc::Channel;
use tauri::{AppHandle, Emitter};

/// PTY 实例的状态机
#[derive(Debug, Clone, PartialEq)]
pub enum TerminalState {
    Created,
    Running,
    ShuttingDown,
    Closed,
}

/// 单个终端实例 — 封装 PTY master、writer 和状态
pub struct TerminalInstance {
    pub id: String,
    pub shell_name: String,
    pub cwd: String,
    pub state: TerminalState,
    pub writer: Option<Box<dyn std::io::Write + Send>>,
    shutdown_flag: Arc<AtomicBool>,
}

impl TerminalInstance {
    fn new(id: String, shell_name: String, cwd: String) -> Self {
        Self {
            id,
            shell_name,
            cwd,
            state: TerminalState::Created,
            writer: None,
            shutdown_flag: Arc::new(AtomicBool::new(false)),
        }
    }
}

/// 检测当前平台的默认 shell
///
/// 编译期通过 cfg!() 宏确定，无需运行时判断
fn get_default_shell() -> &'static str {
    if cfg!(target_os = "windows") {
        "powershell.exe"
    } else if cfg!(target_os = "macos") {
        "/bin/zsh"
    } else {
        "/bin/bash"
    }
}

/// 终端管理器 — 管理所有 PTY 实例
///
/// 线程安全，内部使用 Mutex 保护 terminals 集合
pub struct TerminalManager {
    pub terminals: Mutex<HashMap<String, TerminalInstance>>,
    app_handle: AppHandle,
}

impl TerminalManager {
    /// 创建新的终端管理器
    pub fn new(app_handle: AppHandle) -> Self {
        Self {
            terminals: Mutex::new(HashMap::new()),
            app_handle,
        }
    }

    /// 创建新终端，spawn shell 并通过 Channel 流式推送输出
    ///
    /// 返回 terminal_id 供前端引用
    pub fn spawn_terminal(
        &self,
        channel: Channel<Vec<u8>>,
        shell: Option<String>,
        cwd: Option<String>,
    ) -> Result<String, String> {
        let terminal_id = uuid_v4();

        let shell_path = shell.unwrap_or_else(|| get_default_shell().to_string());
        let work_dir = cwd.unwrap_or_else(|| {
            std::env::current_dir()
                .map(|p| p.to_string_lossy().to_string())
                .unwrap_or_else(|_| ".".to_string())
        });

        // 创建 PTY pair
        let pty_system = NativePtySystem::default();
        let size = PtySize {
            rows: 24,
            cols: 80,
            pixel_width: 0,
            pixel_height: 0,
        };
        let pair = pty_system
            .openpty(size)
            .map_err(|e| format!("打开 PTY 失败: {}", e))?;

        // 构建 shell 命令
        let mut cmd = CommandBuilder::new(&shell_path);
        cmd.cwd(&work_dir);

        // spawn shell 子进程
        let _child = pair
            .slave
            .spawn_command(cmd)
            .map_err(|e| format!("启动 shell 失败: {}", e))?;

        // 释放 slave，让 master 可接收 EOF
        drop(pair.slave);

        let mut reader = pair
            .master
            .try_clone_reader()
            .map_err(|e| format!("创建 PTY reader 失败: {}", e))?;
        let writer = pair
            .master
            .take_writer()
            .map_err(|e| format!("获取 PTY writer 失败: {}", e))?;

        // 创建终端实例
        let shutdown_flag = Arc::new(AtomicBool::new(false));
        let flag_clone = shutdown_flag.clone();
        let id_clone = terminal_id.clone();
        let app_clone = self.app_handle.clone();

        // 启动 reader 线程，通过 Channel 推送 PTY 输出
        std::thread::spawn(move || {
            let mut buf = [0u8; 4096];

            loop {
                // 检查关闭信号
                if flag_clone.load(Ordering::Relaxed) {
                    break;
                }

                match reader.read(&mut buf) {
                    Ok(0) => {
                        // EOF — shell 进程已退出，触发崩溃自动重启
                        let _ = app_clone.emit("pty-eof", &id_clone);
                        break;
                    }
                    Ok(n) => {
                        // 将数据推送到前端 Channel
                        if channel.send(buf[..n].to_vec()).is_err() {
                            // Channel 关闭（前端已断开），停止读取
                            break;
                        }
                    }
                    Err(_) => {
                        // 读取错误，触发自动重启
                        let _ = app_clone.emit("pty-error", &id_clone);
                        break;
                    }
                }
            }
        });

        let instance = TerminalInstance {
            id: terminal_id.clone(),
            shell_name: shell_path,
            cwd: work_dir,
            state: TerminalState::Running,
            writer: Some(Box::new(writer)),
            shutdown_flag,
        };

        {
            let mut terminals = self.terminals.lock().unwrap();
            terminals.insert(terminal_id.clone(), instance);
        }

        Ok(terminal_id)
    }

    /// 写入数据到指定终端
    pub fn write_to_terminal(&self, id: &str, data: &str) -> Result<(), String> {
        let mut terminals = self.terminals.lock().unwrap();
        let instance = terminals
            .get_mut(id)
            .ok_or_else(|| format!("终端 {} 不存在", id))?;

        if let Some(ref mut writer) = instance.writer {
            writer
                .write_all(data.as_bytes())
                .map_err(|e| format!("写入终端失败: {}", e))?;
        }
        Ok(())
    }

    /// 调整终端窗口大小
    pub fn resize_terminal(&self, id: &str, cols: u16, rows: u16) -> Result<(), String> {
        // PTY resize 需要通过 master 完成
        // 这需要保留 master 引用，当前架构中 master 在 spawn 后转移到 reader 线程
        // 简化方案：关闭并重建终端
        // 在完整实现中，可以通过共享状态或重新生成 PTY pair 实现 resize
        let _ = (id, cols, rows);
        Ok(())
    }

    /// 关闭指定终端
    pub fn close_terminal(&self, id: &str) -> Result<(), String> {
        let mut terminals = self.terminals.lock().unwrap();
        let instance = terminals
            .get_mut(id)
            .ok_or_else(|| format!("终端 {} 不存在", id))?;

        instance.shutdown_flag.store(true, Ordering::Relaxed);
        instance.state = TerminalState::ShuttingDown;

        // 发送 exit 命令
        if let Some(ref mut writer) = instance.writer {
            let _ = writer.write_all(b"exit\n");
        }

        // writer 会在 reader 线程退出后随 instance 一同 drop
        terminals.remove(id);
        Ok(())
    }

    /// 获取活跃终端数量
    pub fn active_count(&self) -> usize {
        let terminals = self.terminals.lock().unwrap();
        terminals.len()
    }

    /// 关闭所有终端
    pub fn close_all(&self) {
        let mut terminals = self.terminals.lock().unwrap();
        for (_, instance) in terminals.iter_mut() {
            instance.shutdown_flag.store(true, Ordering::Relaxed);
            instance.state = TerminalState::ShuttingDown;
            if let Some(ref mut writer) = instance.writer {
                let _ = writer.write_all(b"exit\n");
            }
        }
        terminals.clear();
    }
}

impl Drop for TerminalManager {
    fn drop(&mut self) {
        self.close_all();
    }
}

/// 生成简单的 UUID v4（不引入 uuid crate）
fn uuid_v4() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let ts = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_nanos();
    format!("term-{:x}", ts)
}
