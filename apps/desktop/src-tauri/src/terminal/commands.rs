/// 终端 Tauri commands — 前端通过 invoke 调用的入口

use crate::terminal::TerminalManager;
use tauri::ipc::Channel;
use tauri::State;

#[tauri::command]
pub fn spawn_terminal(
    id: String,
    channel: Channel<Vec<u8>>,
    shell: Option<String>,
    cwd: Option<String>,
    state: State<TerminalManager>,
) -> Result<(), String> {
    state.spawn_terminal(id, channel, shell, cwd)
}

#[tauri::command]
pub fn write_to_terminal(
    id: String,
    data: String,
    state: State<TerminalManager>,
) -> Result<(), String> {
    state.write_to_terminal(&id, &data)
}

#[tauri::command]
pub fn resize_terminal(
    id: String,
    cols: u16,
    rows: u16,
    state: State<TerminalManager>,
) -> Result<(), String> {
    state.resize_terminal(&id, cols, rows)
}

#[tauri::command]
pub fn close_terminal(id: String, state: State<TerminalManager>) -> Result<(), String> {
    state.close_terminal(&id)
}

#[tauri::command]
pub fn restart_terminal(
    id: String,
    channel: Channel<Vec<u8>>,
    state: State<TerminalManager>,
) -> Result<(), String> {
    state.restart_terminal(id, channel)
}
