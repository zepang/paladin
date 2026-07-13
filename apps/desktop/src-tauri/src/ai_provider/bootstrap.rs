use super::storage::{AiProviderConfigManager, Result};
use serde::{Deserialize, Serialize};

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
        Ok(BootstrapImport {
            source: BootstrapSource::NoUsableEnvironment,
        })
    }
}
