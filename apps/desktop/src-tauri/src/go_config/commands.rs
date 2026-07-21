use super::{GoConfigInput, GoConfigManager, GoEnvironment, MaskedGoServiceConfig};
use crate::process::supervisor::{ProcessInfoDTO, ProcessName, ProcessSupervisor};
use serde::Serialize;
use tauri::State;

/// Explicit D-03 outcomes. Frontend code must not infer lifecycle behavior from
/// an error string or a generic successful response.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum GoServiceOperation {
    SavedPendingRestart,
    ImportedPendingRestart,
    ClearedPendingRestart,
    RetryCurrentProcess,
    RestartedManagedProcess,
    RestartUnavailable,
}

#[derive(Debug, Clone, Serialize)]
pub struct GoServiceActionResult {
    pub operation: GoServiceOperation,
    pub config: MaskedGoServiceConfig,
    pub process: ProcessInfoDTO,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TestGoServiceResult {
    pub valid: bool,
    pub field_diagnostics: super::GoFieldDiagnostic,
}

async fn current_process(supervisor: &ProcessSupervisor) -> ProcessInfoDTO {
    supervisor.status().await.server
}

async fn action_result(
    operation: GoServiceOperation,
    manager: &GoConfigManager,
    supervisor: &ProcessSupervisor,
) -> Result<GoServiceActionResult, String> {
    let mut config = manager
        .load_masked_config()
        .await
        .map_err(|error| error.to_string())?;
    let process = current_process(supervisor).await;
    // A write changes future managed spawns only. It never implicitly affects an
    // already-running child.
    config.pending_apply = matches!(
        operation,
        GoServiceOperation::SavedPendingRestart
            | GoServiceOperation::ImportedPendingRestart
            | GoServiceOperation::ClearedPendingRestart
    );
    Ok(GoServiceActionResult {
        operation,
        config,
        process,
    })
}

#[tauri::command]
pub async fn get_go_service_configuration(
    manager: State<'_, GoConfigManager>,
    supervisor: State<'_, ProcessSupervisor>,
) -> Result<GoServiceActionResult, String> {
    action_result(
        GoServiceOperation::RetryCurrentProcess,
        manager.inner(),
        supervisor.inner(),
    )
    .await
}

#[tauri::command]
pub async fn save_go_service_configuration(
    manager: State<'_, GoConfigManager>,
    supervisor: State<'_, ProcessSupervisor>,
    input: GoConfigInput,
) -> Result<GoServiceActionResult, String> {
    manager
        .save(input)
        .await
        .map_err(|error| error.to_string())?;
    action_result(
        GoServiceOperation::SavedPendingRestart,
        manager.inner(),
        supervisor.inner(),
    )
    .await
}

#[tauri::command]
pub async fn import_go_service_environment(
    manager: State<'_, GoConfigManager>,
    supervisor: State<'_, ProcessSupervisor>,
) -> Result<GoServiceActionResult, String> {
    let environment = GoEnvironment::from_process_env();
    manager
        .save_environment_import(&environment)
        .await
        .map_err(|error| error.to_string())?;
    action_result(
        GoServiceOperation::ImportedPendingRestart,
        manager.inner(),
        supervisor.inner(),
    )
    .await
}

#[tauri::command]
pub async fn clear_go_service_configuration(
    manager: State<'_, GoConfigManager>,
    supervisor: State<'_, ProcessSupervisor>,
) -> Result<GoServiceActionResult, String> {
    manager.clear().await.map_err(|error| error.to_string())?;
    action_result(
        GoServiceOperation::ClearedPendingRestart,
        manager.inner(),
        supervisor.inner(),
    )
    .await
}

#[tauri::command]
pub async fn test_go_service_configuration(
    manager: State<'_, GoConfigManager>,
    input: GoConfigInput,
) -> Result<TestGoServiceResult, String> {
    let field_diagnostics = manager.validate_draft(input).await;
    Ok(TestGoServiceResult {
        valid: field_diagnostics == super::GoFieldDiagnostic::default(),
        field_diagnostics,
    })
}

#[tauri::command]
pub async fn test_saved_go_service_configuration(
    manager: State<'_, GoConfigManager>,
) -> Result<TestGoServiceResult, String> {
    let field_diagnostics = manager
        .validate_saved_configuration()
        .await
        .map_err(|error| error.to_string())?;
    Ok(TestGoServiceResult {
        valid: field_diagnostics == super::GoFieldDiagnostic::default(),
        field_diagnostics,
    })
}

#[tauri::command]
pub async fn retry_go_service_readiness(
    manager: State<'_, GoConfigManager>,
    supervisor: State<'_, ProcessSupervisor>,
) -> Result<GoServiceActionResult, String> {
    action_result(
        GoServiceOperation::RetryCurrentProcess,
        manager.inner(),
        supervisor.inner(),
    )
    .await
}

#[tauri::command]
pub async fn restart_go_service(
    manager: State<'_, GoConfigManager>,
    supervisor: State<'_, ProcessSupervisor>,
) -> Result<GoServiceActionResult, String> {
    let process = current_process(supervisor.inner()).await;
    if !process.allowed_actions.restart {
        return action_result(
            GoServiceOperation::RestartUnavailable,
            manager.inner(),
            supervisor.inner(),
        )
        .await;
    }
    supervisor.restart_one(ProcessName::Server).await?;
    action_result(
        GoServiceOperation::RestartedManagedProcess,
        manager.inner(),
        supervisor.inner(),
    )
    .await
}
