use super::{GoConfigInput, GoConfigManager, GoServiceOperation};

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
