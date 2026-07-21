use super::{
    GoConfigInput, GoConfigManager, GoConfigProvenance, GoConfigReadiness, GoFieldDiagnostic,
    GoServiceActionResult, GoServiceOperation, MaskedGoServiceConfig, TestGoServiceResult,
};
use crate::process::supervisor::{
    ProcessAllowedActions, ProcessHealth, ProcessInfoDTO, ProcessOwner, ProcessState,
};

fn complete_input() -> GoConfigInput {
    GoConfigInput {
        database_url: "postgres://phase12-command-db-sentinel".into(),
        redis_url: "redis://phase12-command-redis-sentinel".into(),
        jwt_secret: "phase12-command-jwt-sentinel".into(),
    }
}

#[tokio::test]
async fn write_only_command_inputs_never_become_masked_readback() {
    let dir = tempfile::tempdir().unwrap();
    let manager = GoConfigManager::new_for_app_data(dir.path()).await.unwrap();
    manager.save(complete_input()).await.unwrap();

    let serialized = serde_json::to_string(&manager.load_masked_config().await.unwrap()).unwrap();
    for secret in [
        "phase12-command-db-sentinel",
        "phase12-command-redis-sentinel",
        "phase12-command-jwt-sentinel",
    ] {
        assert!(!serialized.contains(secret));
    }
    // Field names are permitted for fixed diagnostics; secret values are not.
    assert!(!serialized.contains("length"));
    assert!(!serialized.contains("prefix"));
    assert!(!serialized.contains("suffix"));
}

#[tokio::test]
async fn test_draft_does_not_persist_or_mutate_saved_snapshot() {
    let dir = tempfile::tempdir().unwrap();
    let manager = GoConfigManager::new_for_app_data(dir.path()).await.unwrap();
    manager.save(complete_input()).await.unwrap();
    let diagnostics = manager
        .validate_draft(GoConfigInput {
            database_url: String::new(),
            redis_url: String::new(),
            jwt_secret: String::new(),
        })
        .await;
    assert!(diagnostics.database_url.is_some());
    assert!(manager.load_masked_config().await.unwrap().configured);
}

#[tokio::test]
async fn saved_configuration_can_be_checked_without_serializing_or_reentering_secrets() {
    let dir = tempfile::tempdir().unwrap();
    let manager = GoConfigManager::new_for_app_data(dir.path()).await.unwrap();
    manager.save(complete_input()).await.unwrap();

    let diagnostics = manager.validate_saved_configuration().await.unwrap();

    assert_eq!(diagnostics, Default::default());
    let serialized = serde_json::to_string(&manager.load_masked_config().await.unwrap()).unwrap();
    assert!(!serialized.contains("phase12-command-db-sentinel"));
    assert!(!serialized.contains("phase12-command-redis-sentinel"));
    assert!(!serialized.contains("phase12-command-jwt-sentinel"));
}

#[test]
fn d03_operations_are_structured_and_not_error_text() {
    assert_eq!(
        serde_json::to_string(&GoServiceOperation::SavedPendingRestart).unwrap(),
        "\"saved-pending-restart\""
    );
    assert_eq!(
        serde_json::to_string(&GoServiceOperation::RetryCurrentProcess).unwrap(),
        "\"retry-current-process\""
    );
    assert_eq!(
        serde_json::to_string(&GoServiceOperation::RestartUnavailable).unwrap(),
        "\"restart-unavailable\""
    );
}

#[test]
fn action_response_uses_the_frontend_camel_case_contract_for_supervisor_restart() {
    // This serializes the exact result type returned by Tauri Go-service commands.
    // It contains no configuration secret values.
    let response = GoServiceActionResult {
        operation: GoServiceOperation::SavedPendingRestart,
        config: MaskedGoServiceConfig {
            configured: true,
            readiness: GoConfigReadiness::Untested,
            provenance: GoConfigProvenance::LocalUser,
            fingerprint: "cfg_contract".into(),
            field_diagnostics: GoFieldDiagnostic::default(),
            pending_apply: true,
        },
        process: ProcessInfoDTO {
            state: ProcessState::Running,
            owner: ProcessOwner::Supervisor,
            health: ProcessHealth::Healthy,
            last_error: None,
            stderr_tail: None,
            last_restart_at: None,
            diagnostic_category: None,
            pending_apply: true,
            allowed_actions: ProcessAllowedActions {
                restart: true,
                stop: true,
                redetect: true,
            },
        },
    };

    let json = serde_json::to_value(response).expect("serialize Tauri action response");
    assert_eq!(json["process"]["owner"], "supervisor");
    assert_eq!(json["process"]["allowedActions"]["restart"], true);
    assert_eq!(json["process"]["pendingApply"], true);
    assert_eq!(
        json["config"]["fieldDiagnostics"],
        serde_json::json!({
            "databaseUrl": null,
            "redisUrl": null,
            "jwtSecret": null,
        })
    );
    assert!(json["process"].get("allowed_actions").is_none());
    assert!(json["process"].get("pending_apply").is_none());
    assert!(json["config"].get("field_diagnostics").is_none());

    let test_result = serde_json::to_value(TestGoServiceResult {
        valid: true,
        field_diagnostics: GoFieldDiagnostic::default(),
    })
    .expect("serialize Tauri test response");
    assert!(test_result.get("fieldDiagnostics").is_some());
    assert!(test_result.get("field_diagnostics").is_none());
}
