use std::path::PathBuf;
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Manager, WindowEvent,
};

mod ai_provider;
mod file_commands;
mod go_config;
mod process;
mod terminal;
use crate::ai_provider::{
    delete_ai_provider, get_ai_provider_config, refresh_agent_ai_provider, save_ai_provider,
    set_active_ai_provider, test_ai_provider, AiProviderConfigManager,
};
use crate::go_config::{
    clear_go_service_configuration, get_go_service_configuration, import_go_service_environment,
    restart_go_service, retry_go_service_readiness, save_go_service_configuration,
    test_go_service_configuration, GoConfigManager, GoEnvironment,
};
use crate::process::commands::{
    get_process_status, get_runtime_config, redetect_agent, redetect_server, restart_agent,
    restart_server, stop_agent, stop_server,
};
use crate::process::config::{
    resolve_packaged_executable, resolve_process_config_path, ProcessConfig, ProcessNameKey,
};
use crate::process::ProcessSupervisor;
use crate::terminal::TerminalManager;

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

fn shutdown_and_exit(app: AppHandle) {
    tauri::async_runtime::spawn(async move {
        if let Some(supervisor) = app
            .try_state::<ProcessSupervisor>()
            .map(|state| state.inner().clone())
        {
            supervisor.graceful_shutdown_all().await;
        }
        app.exit(0);
    });
}

fn shutdown_supervisor_and_exit(app: AppHandle, supervisor: ProcessSupervisor) {
    tauri::async_runtime::spawn(async move {
        supervisor.graceful_shutdown_all().await;
        app.exit(0);
    });
}

fn install_process_signal_handlers(app: AppHandle, supervisor: ProcessSupervisor) {
    let app_for_sigint = app.clone();
    let supervisor_for_sigint = supervisor.clone();
    tauri::async_runtime::spawn(async move {
        if tokio::signal::ctrl_c().await.is_ok() {
            shutdown_supervisor_and_exit(app_for_sigint, supervisor_for_sigint);
        }
    });

    #[cfg(unix)]
    {
        let app_for_sigterm = app.clone();
        let supervisor_for_sigterm = supervisor.clone();
        tauri::async_runtime::spawn(async move {
            let Ok(mut signal) =
                tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate())
            else {
                return;
            };
            signal.recv().await;
            shutdown_supervisor_and_exit(app_for_sigterm, supervisor_for_sigterm);
        });
    }
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
            redetect_agent,
            restart_server,
            stop_server,
            redetect_server,
            get_process_status,
            get_runtime_config,
            get_ai_provider_config,
            save_ai_provider,
            delete_ai_provider,
            set_active_ai_provider,
            test_ai_provider,
            refresh_agent_ai_provider,
            get_go_service_configuration,
            save_go_service_configuration,
            import_go_service_environment,
            clear_go_service_configuration,
            test_go_service_configuration,
            retry_go_service_readiness,
            restart_go_service,
        ])
        .setup(|app| {
            // 管理 TerminalManager 实例
            app.manage(TerminalManager::new(app.handle().clone()));

            let ai_provider_dir = app
                .path()
                .app_data_dir()
                .unwrap_or_else(|_| PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("app-data"));
            let ai_provider_manager = tauri::async_runtime::block_on(
                AiProviderConfigManager::new_for_app_data(ai_provider_dir),
            )?;
            let _ =
                tauri::async_runtime::block_on(ai_provider_manager.bootstrap_from_environment());
            app.manage(ai_provider_manager);

            let go_config_dir = app
                .path()
                .app_data_dir()
                .unwrap_or_else(|_| PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("app-data"));
            let go_config_manager =
                tauri::async_runtime::block_on(GoConfigManager::new_for_app_data(go_config_dir))?;
            let go_environment = GoEnvironment::from_process_env();
            let _ = tauri::async_runtime::block_on(
                go_config_manager.bootstrap_from_environment(&go_environment),
            );
            app.manage(go_config_manager.clone());

            // Dev 保留仓库 processes.json；release 只从已安装资源读取 packaged config。
            let manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
            let packaged = !cfg!(debug_assertions);
            let resource_dir = app.path().resource_dir().ok();
            let config_path =
                resolve_process_config_path(packaged, &manifest_dir, resource_dir.as_deref());
            // log_dir: 优先 Tauri app_log_dir,失败降级到 src-tauri/logs
            let log_dir = app
                .path()
                .app_log_dir()
                .unwrap_or_else(|_| PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("logs"));
            // 创建 log_dir (已存在则 no-op) — SPEC Edge R10 失败时 capture_lines 仍 emit
            let _ = std::fs::create_dir_all(&log_dir);

            let loaded_config = config_path.and_then(ProcessConfig::load_from_path);
            let loaded_config = loaded_config.and_then(|mut config| {
                if packaged {
                    let executable_dir = std::env::current_exe()
                        .ok()
                        .and_then(|path| path.parent().map(PathBuf::from))
                        .or_else(|| resource_dir.clone())
                        .ok_or_else(|| {
                            crate::process::config::ConfigError::InvalidSchema(
                                "packaged executable directory is unavailable".to_string(),
                            )
                        })?;
                    let target = tauri::utils::platform::target_triple().map_err(|error| {
                        crate::process::config::ConfigError::InvalidSchema(format!(
                            "cannot determine packaged target triple: {error}"
                        ))
                    })?;
                    for name in [ProcessNameKey::Agent, ProcessNameKey::Server] {
                        let entry = config.processes.get_mut(&name).ok_or_else(|| {
                            crate::process::config::ConfigError::InvalidSchema(format!(
                                "packaged config missing {name:?}"
                            ))
                        })?;
                        let logical_name = entry.cmd.first().cloned().ok_or_else(|| {
                            crate::process::config::ConfigError::InvalidSchema(format!(
                                "packaged config {name:?} cmd is empty"
                            ))
                        })?;
                        entry.cmd[0] = resolve_packaged_executable(
                            &executable_dir,
                            &logical_name,
                            &target,
                            cfg!(windows),
                        )?
                        .to_string_lossy()
                        .into_owned();
                    }
                }
                Ok(config)
            });
            let (supervisor, should_start) = match loaded_config {
                Ok(config) => (
                    ProcessSupervisor::new(
                        app.handle().clone(),
                        config,
                        log_dir,
                        go_config_manager.clone(),
                    ),
                    true,
                ),
                Err(e) => {
                    let message = format!("运行时配置无效: 无法加载已选择的进程资源: {e}");
                    (
                        ProcessSupervisor::from_config_error(
                            app.handle().clone(),
                            log_dir,
                            message,
                        ),
                        false,
                    )
                }
            };
            // Clone 一份给后台 start task;两份共享 Arc<ProcessSlot>,操作同一 slot
            let supervisor_for_task = supervisor.clone();
            app.manage(supervisor);
            install_process_signal_handlers(app.handle().clone(), supervisor_for_task.clone());

            // 后台 spawn — start() 是 async,setup 闭包不是 async
            // SPEC D-08: Server 先 + 5s readyz,再 Agent
            if should_start {
                tauri::async_runtime::spawn(async move {
                    if let Err(e) = supervisor_for_task.start().await {
                        eprintln!("[paladin] 进程监督器启动失败: {e}");
                    }
                });
            }

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
                            shutdown_and_exit(app.clone());
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
        // Close means quit; use the tray Hide item for backgrounding without stopping services.
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                shutdown_and_exit(window.app_handle().clone());
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
