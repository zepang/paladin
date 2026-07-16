//! D-05/D-06/D-07/D-08：环境导入与 session override 的 RED 合同。

use std::collections::HashMap;

use tempfile::tempdir;

use super::{GoConfigInput, GoConfigManager, GoConfigProvenance, GoEnvironment, GoRuntimeSource};

fn complete_environment() -> GoEnvironment {
    GoEnvironment::from_pairs(HashMap::from([
        (
            "PALADIN_DATABASE_URL".into(),
            "postgres://phase12-bootstrap-db".into(),
        ),
        (
            "PALADIN_REDIS_URL".into(),
            "redis://phase12-bootstrap-redis".into(),
        ),
        ("PALADIN_JWT_SECRET".into(), "phase12-bootstrap-jwt".into()),
    ]))
}

#[tokio::test]
async fn d05_explicit_import_accepts_only_complete_environment_and_masks_result() {
    let dir = tempdir().unwrap();
    let manager = GoConfigManager::new_for_app_data(dir.path()).await.unwrap();
    let imported = manager
        .import_from_environment(&complete_environment())
        .await
        .unwrap();
    assert_eq!(imported.provenance, GoConfigProvenance::EnvironmentImport);
    assert!(!serde_json::to_string(&imported)
        .unwrap()
        .contains("phase12-bootstrap-jwt"));
}

#[tokio::test]
async fn d06_partial_environment_is_diagnosed_without_persistence() {
    let dir = tempdir().unwrap();
    let manager = GoConfigManager::new_for_app_data(dir.path()).await.unwrap();
    let partial = GoEnvironment::from_pairs(HashMap::from([(
        "PALADIN_DATABASE_URL".into(),
        "postgres://only".into(),
    )]));
    let result = manager.bootstrap_from_environment(&partial).await.unwrap();
    assert!(result.field_diagnostics.redis_url.is_some());
    assert!(!manager.load_masked_config().await.unwrap().configured);
}

#[tokio::test]
async fn d08_clear_marks_local_handling_and_normal_bootstrap_never_resurrects_values() {
    let dir = tempdir().unwrap();
    let manager = GoConfigManager::new_for_app_data(dir.path()).await.unwrap();
    manager
        .save(GoConfigInput::from(complete_environment()))
        .await
        .unwrap();
    manager.clear().await.unwrap();
    let bootstrap = manager
        .bootstrap_from_environment(&complete_environment())
        .await
        .unwrap();
    assert_eq!(bootstrap.source, GoRuntimeSource::SkippedAfterClear);
    assert!(!manager.load_masked_config().await.unwrap().configured);
}

#[tokio::test]
async fn d07_ordinary_parent_environment_cannot_override_saved_config_but_marked_session_can() {
    let dir = tempdir().unwrap();
    let manager = GoConfigManager::new_for_app_data(dir.path()).await.unwrap();
    manager
        .save(GoConfigInput::from(complete_environment()))
        .await
        .unwrap();
    let parent = GoEnvironment::from_pairs(HashMap::from([
        (
            "PALADIN_DATABASE_URL".into(),
            "postgres://phase12-parent-db".into(),
        ),
        (
            "PALADIN_REDIS_URL".into(),
            "redis://phase12-parent-redis".into(),
        ),
        ("PALADIN_JWT_SECRET".into(), "phase12-parent-jwt".into()),
    ]));
    let normal = manager.runtime_snapshot_for_process(&parent).await.unwrap();
    assert_eq!(normal.source, GoRuntimeSource::Persisted);
    let override_snapshot = manager
        .runtime_snapshot_for_marked_session(&parent, "PALADIN_GO_SESSION_OVERRIDE")
        .await
        .unwrap();
    assert_eq!(override_snapshot.source, GoRuntimeSource::SessionOverride);
    assert!(!manager
        .load_masked_config()
        .await
        .unwrap()
        .fingerprint
        .contains("parent-jwt"));
}
