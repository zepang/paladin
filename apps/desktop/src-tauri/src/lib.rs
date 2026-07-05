use std::path::PathBuf;
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Manager, WindowEvent,
};

mod terminal;
mod file_commands;
mod process;
use crate::process::commands::{
    get_process_status, get_runtime_config, restart_agent, restart_server, stop_agent,
    stop_server,
};
use crate::process::config::ProcessConfig;
use crate::process::ProcessSupervisor;
use crate::terminal::TerminalManager;

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            greet,
            terminal::commands::spawn_terminal,
            terminal::commands::write_to_terminal,
            terminal::commands::resize_terminal,
            terminal::commands::close_terminal,
            terminal::commands::restart_terminal,
            file_commands::read_text_file,
            // plan 07.3-06 Task 7: 6 个进程监督命令
            restart_agent,
            stop_agent,
            restart_server,
            stop_server,
            get_process_status,
            get_runtime_config,
        ])
        .setup(|app| {
            // 管理 TerminalManager 实例
            app.manage(TerminalManager::new(app.handle().clone()));

            // plan 07.3-06: 加载 processes.json + 实例化 ProcessSupervisor
            // SPEC D-07: 单一 Rust 真相源 — cmd/port/health 全来自此配置
            let config_path = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("processes.json");
            let config = match ProcessConfig::load_from_path(&config_path) {
                Ok(c) => c,
                Err(e) => {
                    return Err(Box::new(std::io::Error::other(
                        format!(
                            "加载 processes.json 失败 ({config_path:?}): {e:?} — 请检查 src-tauri/processes.json 是否存在且 schema 合法"
                        ),
                    )));
                }
            };

            // log_dir: 优先 Tauri app_log_dir,失败降级到 src-tauri/logs
            let log_dir = app
                .path()
                .app_log_dir()
                .unwrap_or_else(|_| PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("logs"));
            // 创建 log_dir (已存在则 no-op) — SPEC Edge R10 失败时 capture_lines 仍 emit
            let _ = std::fs::create_dir_all(&log_dir);

            let supervisor = ProcessSupervisor::new(app.handle().clone(), config, log_dir);
            // Clone 一份给后台 start task;两份共享 Arc<ProcessSlot>,操作同一 slot
            let supervisor_for_task = supervisor.clone();
            app.manage(supervisor);

            // 后台 spawn — start() 是 async,setup 闭包不是 async
            // SPEC D-08: Server 先 + 5s readyz,再 Agent
            tauri::async_runtime::spawn(async move {
                if let Err(e) = supervisor_for_task.start().await {
                    eprintln!("[paladin] 进程监督器启动失败: {e}");
                }
            });

            // System tray with Show/Hide/Quit menu
            let show = MenuItem::with_id(app, "show", "Show", true, None::<&str>)?;
            let hide = MenuItem::with_id(app, "hide", "Hide", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show, &hide, &quit])?;

            let _tray = TrayIconBuilder::with_id("main-tray")
                .icon(app.default_window_icon().unwrap().clone())
                .menu(&menu)
                .on_menu_event(|app, event| {
                    let Some(window) = app.get_webview_window("main") else {
                        return;
                    };
                    match event.id().as_ref() {
                        "show" => {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                        "hide" => {
                            let _ = window.hide();
                        }
                        "quit" => {
                            app.exit(0);
                        }
                        _ => {}
                    }
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        let app = tray.app_handle();
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                })
                .build(app)?;

            Ok(())
        })
        // Close to tray: hide on close instead of exiting
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                let _ = window.hide();
                api.prevent_close();
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
