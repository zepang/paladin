use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Default, Deserialize)]
pub struct GoConfigInput {
    pub database_url: String,
    pub redis_url: String,
    pub jwt_secret: String,
}

pub type SaveGoServiceInput = GoConfigInput;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum GoConfigReadiness {
    Unconfigured,
    Untested,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum GoConfigProvenance {
    Unconfigured,
    LocalUser,
    EnvironmentImport,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum GoRuntimeSource {
    Persisted,
    SessionOverride,
    SkippedAfterClear,
    NoConfiguration,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Deserialize, Serialize)]
pub struct GoFieldDiagnostic {
    pub database_url: Option<String>,
    pub redis_url: Option<String>,
    pub jwt_secret: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
pub struct MaskedGoServiceConfig {
    pub configured: bool,
    pub readiness: GoConfigReadiness,
    pub provenance: GoConfigProvenance,
    pub fingerprint: String,
    pub field_diagnostics: GoFieldDiagnostic,
    pub pending_apply: bool,
}

/// A complete selected set that must stay inside Rust.  Deliberately omits serde
/// traits so it can never become a Tauri command response by accident.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct GoRuntimeSnapshot {
    pub(crate) database_url: String,
    pub(crate) redis_url: String,
    pub(crate) jwt_secret: String,
    pub(crate) source: GoRuntimeSource,
}

impl GoRuntimeSnapshot {
    #[cfg(test)]
    pub(crate) fn persisted_for_test(
        database_url: &str,
        redis_url: &str,
        jwt_secret: &str,
    ) -> Self {
        Self {
            database_url: database_url.to_string(),
            redis_url: redis_url.to_string(),
            jwt_secret: jwt_secret.to_string(),
            source: GoRuntimeSource::Persisted,
        }
    }
}
