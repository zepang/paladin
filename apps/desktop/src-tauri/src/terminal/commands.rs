/// 终端 Tauri commands — 前端通过 invoke 调用的入口
///
/// 包含 spawn_terminal、write_to_terminal、resize_terminal、close_terminal 四个命令

use crate::terminal::TerminalManager;
use tauri::ipc::Channel;
use tauri::State;

/// 创建新终端并开始通过 Channel 流式推送输出
///
/// 后端 spawn shell 进程，独立线程读取 PTY 输出并通过 Channel 推送到前端
#[tauri::command]
pub fn spawn_terminal(
    channel: Channel<Vec<u8>>,
    shell: Option<String>,
    cwd: Option<String>,
    state: State<TerminalManager>,
) -> Result<String, String> {
    state.spawn_terminal(channel, shell, cwd)
}

/// 向前端指定的终端写入输入数据
#[tauri::command]
pub fn write_to_terminal(
    id: String,
    data: String,
    state: State<TerminalManager>,
) -> Result<(), String> {
    state.write_to_terminal(&id, &data)
}

/// 调整终端窗口大小（cols × rows）
#[tauri::command]
pub fn resize_terminal(
    id: String,
    cols: u16,
    rows: u16,
    state: State<TerminalManager>,
) -> Result<(), String> {
    state.resize_terminal(&id, cols, rows)
}

/// 关闭指定终端
#[tauri::command]
pub fn close_terminal(id: String, state: State<TerminalManager>) -> Result<(), String> {
    state.close_terminal(&id)
}
