use super::storage::{AiProviderConfigManager, BootstrapStatus, Result};
use super::types::{ConfigProvenance, ProviderInput, ProviderType};
use serde::{Deserialize, Serialize};
use std::env;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum BootstrapSource {
    PaladinAiEnv,
    LegacyDeepSeekEnv,
    AlreadyImported,
    SkippedBecauseLocalConfigExists,
    NoUsableEnvironment,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
pub struct BootstrapImport {
    pub source: BootstrapSource,
}

impl AiProviderConfigManager {
    pub async fn bootstrap_from_environment(&self) -> Result<BootstrapImport> {
        match self.bootstrap_status().await? {
            BootstrapStatus::LocalConfigExists => {
                return Ok(BootstrapImport {
                    source: BootstrapSource::SkippedBecauseLocalConfigExists,
                });
            }
            BootstrapStatus::AlreadyImported => {
                return Ok(BootstrapImport {
                    source: BootstrapSource::AlreadyImported,
                });
            }
            BootstrapStatus::Clean => {}
        }

        if let Some(input) = paladin_ai_input() {
            self.seed_provider_from_bootstrap(input, ConfigProvenance::PaladinAiEnv)
                .await?;
            return Ok(BootstrapImport {
                source: BootstrapSource::PaladinAiEnv,
            });
        }

        Ok(BootstrapImport {
            source: BootstrapSource::NoUsableEnvironment,
        })
    }
}

fn paladin_ai_input() -> Option<ProviderInput> {
    let provider_type = env_value("PALADIN_AI_PROVIDER")
        .as_deref()
        .and_then(ProviderType::from_env)?;
    let api_key = env_value("PALADIN_AI_API_KEY");
    if provider_type.requires_api_key() && api_key.is_none() {
        return None;
    }

    Some(ProviderInput {
        id: "paladin-ai-env".to_string(),
        provider_type,
        display_name: "PALADIN_AI provider".to_string(),
        base_url: env_value("PALADIN_AI_BASE_URL")
            .unwrap_or_else(|| provider_type.default_base_url().to_string()),
        model_id: env_value("PALADIN_AI_MODEL")
            .unwrap_or_else(|| provider_type.default_model_id().to_string()),
        api_key,
        priority: 0,
        active: true,
    })
}

fn env_value(name: &str) -> Option<String> {
    env::var(name)
        .ok()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
}
