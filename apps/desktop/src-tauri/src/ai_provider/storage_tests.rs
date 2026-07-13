//! Phase 11 RED tests for desktop-owned AI provider app-data storage.

use std::fs;
use std::sync::Arc;

use tempfile::tempdir;

use super::{AiProviderConfigManager, AiProviderReadiness, ProviderInput, ProviderType};

fn deepseek_input(id: &str, key: &str) -> ProviderInput {
    ProviderInput {
        id: id.to_string(),
        provider_type: ProviderType::DeepSeek,
        display_name: "DeepSeek 主账号".to_string(),
        base_url: " https://api.deepseek.example/v1 ".to_string(),
        model_id: " deepseek-chat ".to_string(),
        api_key: Some(key.to_string()),
        priority: 10,
        active: true,
    }
}

#[tokio::test]
async fn saving_same_provider_twice_updates_in_place_and_keeps_active_selection() {
    let dir = tempdir().expect("temp app data dir");
    let manager = AiProviderConfigManager::new_for_app_data(dir.path())
        .await
        .unwrap();

    let first = manager
        .save_provider(deepseek_input("deepseek-main", "sk-first-secret"))
        .await
        .unwrap();
    let mut replacement = deepseek_input("deepseek-main", "sk-replaced-secret");
    replacement.display_name = "DeepSeek 中文名".to_string();
    replacement.priority = 5;
    let second = manager.save_provider(replacement).await.unwrap();
    let config = manager.load_masked_config().await.unwrap();

    assert_eq!(first.id, "deepseek-main");
    assert_eq!(second.id, "deepseek-main");
    assert_eq!(config.providers.len(), 1);
    assert_eq!(config.active_provider_id.as_deref(), Some("deepseek-main"));
    assert_eq!(config.providers[0].display_name, "DeepSeek 中文名");
    assert_eq!(
        config.providers[0].base_url,
        "https://api.deepseek.example/v1"
    );
    assert_eq!(config.providers[0].model_id, "deepseek-chat");
    assert_eq!(config.providers[0].provider_type, ProviderType::DeepSeek);
    assert_eq!(config.providers[0].priority, 5);
    assert!(config.providers[0].active);
    assert_eq!(config.providers[0].readiness, AiProviderReadiness::Untested);
    assert!(config.providers[0].has_api_key);
    assert!(config.providers[0].api_key_fingerprint.starts_with("pk_"));
}

#[tokio::test]
async fn overlapping_saves_do_not_corrupt_json_duplicate_ids_or_dangle_active_provider() {
    let dir = tempdir().expect("temp app data dir");
    let manager = Arc::new(
        AiProviderConfigManager::new_for_app_data(dir.path())
            .await
            .unwrap(),
    );

    let first = manager.clone();
    let second = manager.clone();
    let (first_result, second_result) = tokio::join!(
        first.save_provider(deepseek_input("same-id", "sk-first")),
        second.save_provider(deepseek_input("same-id", "sk-second")),
    );
    first_result.unwrap();
    second_result.unwrap();

    let raw = fs::read_to_string(dir.path().join("ai-providers.json")).unwrap();
    serde_json::from_str::<serde_json::Value>(&raw)
        .expect("persisted provider config is valid JSON");
    let config = manager.load_masked_config().await.unwrap();
    let same_id_count = config
        .providers
        .iter()
        .filter(|provider| provider.id == "same-id")
        .count();

    assert_eq!(same_id_count, 1);
    assert_eq!(config.active_provider_id.as_deref(), Some("same-id"));
    assert!(config
        .providers
        .iter()
        .any(|provider| Some(provider.id.as_str()) == config.active_provider_id.as_deref()));
}

#[tokio::test]
async fn masked_readback_excludes_raw_key_and_key_length_from_non_secret_metadata() {
    let dir = tempdir().expect("temp app data dir");
    let manager = AiProviderConfigManager::new_for_app_data(dir.path())
        .await
        .unwrap();
    let raw_key = "sk-special-密钥-value-123456789";

    manager
        .save_provider(deepseek_input("deepseek-secret", raw_key))
        .await
        .unwrap();

    let config = manager.load_masked_config().await.unwrap();
    let provider = config
        .providers
        .iter()
        .find(|provider| provider.id == "deepseek-secret")
        .expect("provider exists");
    let rendered = serde_json::to_string(&config).unwrap();
    let metadata_path = dir.path().join("ai-providers.json");
    let metadata = fs::read_to_string(metadata_path).unwrap();

    assert!(provider.has_api_key);
    assert_eq!(provider.api_key_fingerprint.len(), 7);
    assert!(provider.api_key_fingerprint.starts_with("pk_"));
    assert!(!rendered.contains(raw_key));
    assert!(!rendered.contains(&raw_key.len().to_string()));
    assert!(!metadata.contains(raw_key));
}

#[tokio::test]
async fn deleting_active_provider_falls_back_to_unconfigured_without_dangling_active_id() {
    let dir = tempdir().expect("temp app data dir");
    let manager = AiProviderConfigManager::new_for_app_data(dir.path())
        .await
        .unwrap();
    manager
        .save_provider(deepseek_input("active-provider", "sk-active"))
        .await
        .unwrap();

    manager.delete_provider("active-provider").await.unwrap();
    let config = manager.load_masked_config().await.unwrap();

    assert!(config.providers.is_empty());
    assert_eq!(config.active_provider_id, None);
    assert_eq!(config.readiness, AiProviderReadiness::Unconfigured);
}
