use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum ProviderType {
    DeepSeek,
    OpenAiCompatible,
    LmStudio,
}

impl ProviderType {
    pub(crate) fn from_env(value: &str) -> Option<Self> {
        match value.trim().to_ascii_lowercase().as_str() {
            "deepseek" => Some(Self::DeepSeek),
            "openai" | "openai-compatible" | "openai_compatible" | "compatible" => {
                Some(Self::OpenAiCompatible)
            }
            "lm-studio" | "lmstudio" | "lm_studio" | "local" => Some(Self::LmStudio),
            _ => None,
        }
    }

    pub(crate) fn requires_api_key(self) -> bool {
        matches!(self, Self::DeepSeek | Self::OpenAiCompatible)
    }

    pub(crate) fn default_base_url(self) -> &'static str {
        match self {
            Self::DeepSeek => "https://api.deepseek.com/v1",
            Self::OpenAiCompatible => "https://api.openai.com/v1",
            Self::LmStudio => "http://localhost:1234/v1",
        }
    }

    pub(crate) fn default_model_id(self) -> &'static str {
        match self {
            Self::DeepSeek => "deepseek-chat",
            Self::OpenAiCompatible => "gpt-4o-mini",
            Self::LmStudio => "local-model",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum AiProviderReadiness {
    Unconfigured,
    Untested,
    Available,
    Invalid,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum ConfigProvenance {
    LocalUser,
    PaladinAiEnv,
    LegacyDeepSeekEnv,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
pub struct ProviderInput {
    pub id: String,
    pub provider_type: ProviderType,
    pub display_name: String,
    pub base_url: String,
    pub model_id: String,
    pub api_key: Option<String>,
    pub priority: i32,
    pub active: bool,
}

pub type SaveProviderInput = ProviderInput;

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
pub struct MaskedProviderEntry {
    pub id: String,
    pub provider_type: ProviderType,
    pub display_name: String,
    pub base_url: String,
    pub model_id: String,
    pub priority: i32,
    pub active: bool,
    pub readiness: AiProviderReadiness,
    pub has_api_key: bool,
    pub api_key_fingerprint: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
pub struct MaskedProviderConfig {
    pub providers: Vec<MaskedProviderEntry>,
    pub active_provider_id: Option<String>,
    pub readiness: AiProviderReadiness,
    pub provenance: Option<ConfigProvenance>,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
pub struct ProviderSecretState {
    pub has_api_key: bool,
    pub api_key_fingerprint: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
pub struct AiProviderRuntimeSnapshot {
    pub provider_id: Option<String>,
    pub provider_type: Option<ProviderType>,
    pub base_url: Option<String>,
    pub model_id: Option<String>,
    pub api_key: Option<String>,
    pub readiness: AiProviderReadiness,
}
