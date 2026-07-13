//! Phase 11 RED tests for AI provider environment bootstrap.

use std::env;

use tempfile::tempdir;

use super::{
    AiProviderConfigManager, AiProviderReadiness, BootstrapSource, ProviderInput, ProviderType,
};

fn clear_provider_env() {
    for key in [
        "PALADIN_AI_PROVIDER",
        "PALADIN_AI_BASE_URL",
        "PALADIN_AI_API_KEY",
        "PALADIN_AI_MODEL",
        "DEEPSEEK_API_KEY",
        "OPENAI_API_KEY",
    ] {
        env::remove_var(key);
    }
}

fn explicit_local_provider() -> ProviderInput {
    ProviderInput {
        id: "local-choice".to_string(),
        provider_type: ProviderType::OpenAiCompatible,
        display_name: "用户保存的 provider".to_string(),
        base_url: "https://saved.example/v1".to_string(),
        model_id: "saved-model".to_string(),
        api_key: Some("sk-user-saved".to_string()),
        priority: 1,
        active: true,
    }
}

#[tokio::test]
async fn paladin_ai_env_seeds_clean_app_data_and_preserves_exact_values_after_trim() {
    clear_provider_env();
    env::set_var("PALADIN_AI_PROVIDER", "openai-compatible");
    env::set_var("PALADIN_AI_BASE_URL", " https://网关.example/v1 ");
    env::set_var("PALADIN_AI_API_KEY", " sk-env-secret-with-symbols-密钥 ");
    env::set_var("PALADIN_AI_MODEL", " gpt-compatible-4 ");

    let dir = tempdir().expect("temp app data dir");
    let manager = AiProviderConfigManager::new_for_app_data(dir.path()).await.unwrap();
    let import = manager.bootstrap_from_environment().await.unwrap();
    let config = manager.load_masked_config().await.unwrap();

    assert_eq!(import.source, BootstrapSource::PaladinAiEnv);
    assert_eq!(config.providers.len(), 1);
    assert_eq!(config.active_provider_id.as_deref(), Some("paladin-ai-env"));
    assert_eq!(config.providers[0].provider_type, ProviderType::OpenAiCompatible);
    assert_eq!(config.providers[0].base_url, "https://网关.example/v1");
    assert_eq!(config.providers[0].model_id, "gpt-compatible-4");
    assert_eq!(config.providers[0].readiness, AiProviderReadiness::Untested);
    assert!(config.providers[0].has_api_key);
    assert!(!serde_json::to_string(&config).unwrap().contains("sk-env-secret"));

    clear_provider_env();
}

#[tokio::test]
async fn legacy_deepseek_api_key_seeds_deepseek_default_without_duplicate_imports() {
    clear_provider_env();
    env::set_var("DEEPSEEK_API_KEY", "sk-legacy-deepseek");
    let dir = tempdir().expect("temp app data dir");
    let manager = AiProviderConfigManager::new_for_app_data(dir.path()).await.unwrap();

    let first = manager.bootstrap_from_environment().await.unwrap();
    let second = manager.bootstrap_from_environment().await.unwrap();
    let config = manager.load_masked_config().await.unwrap();

    assert_eq!(first.source, BootstrapSource::LegacyDeepSeekEnv);
    assert_eq!(second.source, BootstrapSource::AlreadyImported);
    assert_eq!(config.providers.len(), 1);
    assert_eq!(config.providers[0].id, "deepseek-env");
    assert_eq!(config.providers[0].provider_type, ProviderType::DeepSeek);
    assert_eq!(config.providers[0].base_url, "https://api.deepseek.com/v1");
    assert_eq!(config.providers[0].model_id, "deepseek-chat");

    clear_provider_env();
}

#[tokio::test]
async fn empty_env_values_are_ignored_and_do_not_create_blank_secret_providers() {
    clear_provider_env();
    env::set_var("PALADIN_AI_PROVIDER", "   ");
    env::set_var("PALADIN_AI_BASE_URL", "");
    env::set_var("PALADIN_AI_API_KEY", "   ");
    env::set_var("PALADIN_AI_MODEL", "");
    env::set_var("DEEPSEEK_API_KEY", "");
    let dir = tempdir().expect("temp app data dir");
    let manager = AiProviderConfigManager::new_for_app_data(dir.path()).await.unwrap();

    let import = manager.bootstrap_from_environment().await.unwrap();
    let config = manager.load_masked_config().await.unwrap();

    assert_eq!(import.source, BootstrapSource::NoUsableEnvironment);
    assert!(config.providers.is_empty());
    assert_eq!(config.readiness, AiProviderReadiness::Unconfigured);

    clear_provider_env();
}

#[tokio::test]
async fn saved_local_config_wins_over_later_env_bootstrap() {
    clear_provider_env();
    env::set_var("PALADIN_AI_PROVIDER", "deepseek");
    env::set_var("PALADIN_AI_API_KEY", "sk-env-should-not-win");
    env::set_var("PALADIN_AI_MODEL", "deepseek-chat");
    let dir = tempdir().expect("temp app data dir");
    let manager = AiProviderConfigManager::new_for_app_data(dir.path()).await.unwrap();

    manager.save_provider(explicit_local_provider()).await.unwrap();
    let import = manager.bootstrap_from_environment().await.unwrap();
    let config = manager.load_masked_config().await.unwrap();

    assert_eq!(import.source, BootstrapSource::SkippedBecauseLocalConfigExists);
    assert_eq!(config.providers.len(), 1);
    assert_eq!(config.active_provider_id.as_deref(), Some("local-choice"));
    assert_eq!(config.providers[0].display_name, "用户保存的 provider");
    assert_eq!(config.providers[0].base_url, "https://saved.example/v1");
    assert!(!serde_json::to_string(&config).unwrap().contains("sk-env-should-not-win"));

    clear_provider_env();
}
