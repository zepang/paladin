//! D-02/D-04：Go 服务配置必须是 app-data 的完整、写入专用记录。

use std::fs;
use std::sync::Arc;

use tempfile::tempdir;

use super::{GoConfigInput, GoConfigManager, GoConfigReadiness};

fn complete_input() -> GoConfigInput {
    GoConfigInput {
        database_url: "postgres://phase12-db-sentinel@db.example/paladin".into(),
        redis_url: "redis://:phase12-redis-sentinel@redis.example:6379/0".into(),
        jwt_secret: "phase12-jwt-sentinel-not-for-readback".into(),
    }
}

#[tokio::test]
async fn d02_complete_save_returns_only_masked_metadata_and_fixed_fingerprint() {
    let dir = tempdir().unwrap();
    let manager = GoConfigManager::new_for_app_data(dir.path()).await.unwrap();
    let saved = manager.save(complete_input()).await.unwrap();
    let rendered = serde_json::to_string(&saved).unwrap();

    assert!(saved.configured);
    assert_eq!(saved.readiness, GoConfigReadiness::Untested);
    assert!(saved.fingerprint.starts_with("cfg_"));
    for sentinel in ["phase12-db-sentinel", "phase12-redis-sentinel", "phase12-jwt-sentinel"] {
        assert!(!rendered.contains(sentinel), "D-02 must never serialize write input");
    }
}

#[tokio::test]
async fn d02_overlapping_complete_saves_remain_atomic_and_masked() {
    let dir = tempdir().unwrap();
    let manager = Arc::new(GoConfigManager::new_for_app_data(dir.path()).await.unwrap());
    let first = manager.clone();
    let second = manager.clone();
    let (a, b) = tokio::join!(first.save(complete_input()), second.save(complete_input()));
    a.unwrap();
    b.unwrap();

    let metadata = fs::read_to_string(dir.path().join("go-service.json")).unwrap();
    serde_json::from_str::<serde_json::Value>(&metadata).unwrap();
    assert!(!metadata.contains("phase12-db-sentinel"));
    assert!(manager.load_masked_config().await.unwrap().configured);
}

#[tokio::test]
async fn d02_masked_readback_and_errors_exclude_all_three_secret_sentinels() {
    let dir = tempdir().unwrap();
    let manager = GoConfigManager::new_for_app_data(dir.path()).await.unwrap();
    manager.save(complete_input()).await.unwrap();
    let masked = manager.load_masked_config().await.unwrap();
    let serialized = serde_json::to_string(&masked).unwrap();
    let error = manager.save(GoConfigInput::default()).await.unwrap_err().to_string();

    for sentinel in ["phase12-db-sentinel", "phase12-redis-sentinel", "phase12-jwt-sentinel"] {
        assert!(!serialized.contains(sentinel));
        assert!(!error.contains(sentinel));
    }
}

#[tokio::test]
async fn d05_d06_partial_or_invalid_save_never_creates_a_partial_record() {
    let dir = tempdir().unwrap();
    let manager = GoConfigManager::new_for_app_data(dir.path()).await.unwrap();
    let result = manager.save(GoConfigInput { database_url: "postgres://only-one".into(), ..Default::default() }).await;

    assert!(result.is_err());
    let masked = manager.load_masked_config().await.unwrap();
    assert!(!masked.configured);
    assert!(masked.field_diagnostics.redis_url.is_some());
    assert!(masked.field_diagnostics.jwt_secret.is_some());
}
