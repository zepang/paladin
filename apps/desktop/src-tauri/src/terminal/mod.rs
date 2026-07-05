/// 终端管理器 — 管理多个 PTY 实例的生命周期
///
/// 负责 PTY 创建、输入/输出流管理、大小调整和关闭。
/// PTY reader 线程通过 Tauri Channel 将输出流推送到前端。
pub mod commands;

use portable_pty::{CommandBuilder, MasterPty, NativePtySystem, PtySize, PtySystem};
use std::collections::HashMap;
use std::io::{Read, Write};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use tauri::ipc::Channel;
use tauri::{AppHandle, Emitter};

/// PTY 实例的状态机
#[derive(Debug, Clone, PartialEq)]
pub enum TerminalState {
    #[allow(dead_code)]
    Created,
    Running,
    ShuttingDown,
    #[allow(dead_code)]
    Closed,
}

/// 单个终端实例 — 封装 PTY master、writer 和状态
pub struct TerminalInstance {
    #[allow(dead_code)]
    pub id: String,
    pub shell_name: String,
    pub cwd: String,
    pub state: TerminalState,
    pub writer: Option<Box<dyn Write + Send>>,
    shutdown_flag: Arc<AtomicBool>,
    master: Option<Box<dyn MasterPty + Send>>,
}

impl TerminalInstance {
    #[allow(dead_code)]
    fn new(id: String, shell_name: String, cwd: String) -> Self {
        Self {
            id,
            shell_name,
            cwd,
            state: TerminalState::Created,
            writer: None,
            shutdown_flag: Arc::new(AtomicBool::new(false)),
            master: None,
        }
    }
}

/// 检测当前平台的默认 shell
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
pub struct TerminalManager {
    pub terminals: Mutex<HashMap<String, TerminalInstance>>,
    app_handle: AppHandle,
}

impl TerminalManager {
    pub fn new(app_handle: AppHandle) -> Self {
        Self {
            terminals: Mutex::new(HashMap::new()),
            app_handle,
        }
    }

    /// 创建新终端，spawn shell 并通过 Channel 流式推送输出
    /// 前端提供的 id 与 Tab id 一致
    pub fn spawn_terminal(
        &self,
        id: String,
        channel: Channel<Vec<u8>>,
        shell: Option<String>,
        cwd: Option<String>,
    ) -> Result<(), String> {
        {
            let terminals = self.terminals.lock().unwrap();
            if terminals.contains_key(&id) {
                return Err(format!("终端 {} 已存在", id));
            }
        }

        let shell_path = shell.unwrap_or_else(|| get_default_shell().to_string());
        let work_dir = cwd.unwrap_or_else(|| {
            std::env::current_dir()
                .map(|p| p.to_string_lossy().to_string())
                .unwrap_or_else(|_| ".".to_string())
        });

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

        let mut cmd = CommandBuilder::new(&shell_path);
        cmd.cwd(&work_dir);

        let _child = pair
            .slave
            .spawn_command(cmd)
            .map_err(|e| format!("启动 shell 失败: {}", e))?;

        drop(pair.slave);

        let master = pair.master;
        let mut reader = master
            .try_clone_reader()
            .map_err(|e| format!("创建 PTY reader 失败: {}", e))?;
        let writer = master
            .take_writer()
            .map_err(|e| format!("获取 PTY writer 失败: {}", e))?;

        let shutdown_flag = Arc::new(AtomicBool::new(false));
        let flag_clone = shutdown_flag.clone();
        let id_clone = id.clone();
        let app_clone = self.app_handle.clone();

        std::thread::spawn(move || {
            let mut buf = [0u8; 4096];

            loop {
                if flag_clone.load(Ordering::Relaxed) {
                    break;
                }

                match reader.read(&mut buf) {
                    Ok(0) => {
                        let _ = app_clone.emit("pty-eof", &id_clone);
                        break;
                    }
                    Ok(n) => {
                        if channel.send(buf[..n].to_vec()).is_err() {
                            break;
                        }
                    }
                    Err(_) => {
                        let _ = app_clone.emit("pty-error", &id_clone);
                        break;
                    }
                }
            }
        });

        let instance = TerminalInstance {
            id: id.clone(),
            shell_name: shell_path,
            cwd: work_dir,
            state: TerminalState::Running,
            writer: Some(Box::new(writer)),
            shutdown_flag,
            master: Some(master),
        };

        {
            let mut terminals = self.terminals.lock().unwrap();
            terminals.insert(id, instance);
        }

        Ok(())
    }

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

    pub fn resize_terminal(&self, id: &str, cols: u16, rows: u16) -> Result<(), String> {
        let terminals = self.terminals.lock().unwrap();
        let instance = terminals
            .get(id)
            .ok_or_else(|| format!("终端 {} 不存在", id))?;

        if let Some(ref master) = instance.master {
            master
                .resize(PtySize {
                    rows,
                    cols,
                    pixel_width: 0,
                    pixel_height: 0,
                })
                .map_err(|e| format!("调整终端大小失败: {}", e))?;
        }
        Ok(())
    }

    pub fn close_terminal(&self, id: &str) -> Result<(), String> {
        let mut terminals = self.terminals.lock().unwrap();
        let instance = terminals
            .get_mut(id)
            .ok_or_else(|| format!("终端 {} 不存在", id))?;

        instance.shutdown_flag.store(true, Ordering::Relaxed);
        instance.state = TerminalState::ShuttingDown;

        if let Some(ref mut writer) = instance.writer {
            let _ = writer.write_all(b"exit\n");
        }

        terminals.remove(id);
        Ok(())
    }

    pub fn restart_terminal(
        &self,
        id: String,
        channel: Channel<Vec<u8>>,
    ) -> Result<(), String> {
        let (shell, cwd) = {
            let terminals = self.terminals.lock().unwrap();
            if let Some(instance) = terminals.get(&id) {
                (
                    Some(instance.shell_name.clone()),
                    Some(instance.cwd.clone()),
                )
            } else {
                (None, None)
            }
        };

        let _ = self.close_terminal(&id);
        self.spawn_terminal(id, channel, shell, cwd)
    }

    #[allow(dead_code)]
    pub fn active_count(&self) -> usize {
        let terminals = self.terminals.lock().unwrap();
        terminals.len()
    }

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
