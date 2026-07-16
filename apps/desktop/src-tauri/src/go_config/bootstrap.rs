use super::storage::{GoConfigError, GoConfigManager, Result};
use super::types::{GoConfigInput, GoRuntimeSnapshot, GoRuntimeSource, MaskedGoServiceConfig};
use std::collections::HashMap;

pub const SESSION_OVERRIDE_MARKER: &str = "PALADIN_GO_SESSION_OVERRIDE";

#[derive(Debug, Clone, Default)]
pub struct GoEnvironment {
    values: HashMap<String, String>,
}
impl GoEnvironment {
    pub fn from_pairs(values: HashMap<String, String>) -> Self {
        Self { values }
    }
    pub fn from_process_env() -> Self {
        Self {
            values: std::env::vars().collect(),
        }
    }
    fn value(&self, key: &str) -> String {
        self.values.get(key).cloned().unwrap_or_default()
    }
}
impl From<GoEnvironment> for GoConfigInput {
    fn from(value: GoEnvironment) -> Self {
        Self {
            database_url: value.value("PALADIN_DATABASE_URL"),
            redis_url: value.value("PALADIN_REDIS_URL"),
            jwt_secret: value.value("PALADIN_JWT_SECRET"),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct GoBootstrapResult {
    pub source: GoRuntimeSource,
    pub field_diagnostics: super::types::GoFieldDiagnostic,
}

impl GoConfigManager {
    pub async fn bootstrap_from_environment(
        &self,
        environment: &GoEnvironment,
    ) -> Result<GoBootstrapResult> {
        let (configured, clear_blocks_auto_import) = self.bootstrap_state().await?;
        if configured {
            return Ok(GoBootstrapResult {
                source: GoRuntimeSource::Persisted,
                field_diagnostics: Default::default(),
            });
        }
        if clear_blocks_auto_import {
            return Ok(GoBootstrapResult {
                source: GoRuntimeSource::SkippedAfterClear,
                field_diagnostics: Default::default(),
            });
        }
        let diagnostics = self.diagnostics_for_environment(environment).await?;
        if diagnostics != Default::default() {
            return Ok(GoBootstrapResult {
                source: GoRuntimeSource::NoConfiguration,
                field_diagnostics: diagnostics,
            });
        }
        self.save_environment_import(environment).await?;
        Ok(GoBootstrapResult {
            source: GoRuntimeSource::Persisted,
            field_diagnostics: Default::default(),
        })
    }

    pub async fn import_from_environment(
        &self,
        environment: &GoEnvironment,
    ) -> Result<MaskedGoServiceConfig> {
        self.save_environment_import(environment).await
    }

    pub async fn runtime_snapshot_for_process(
        &self,
        _parent: &GoEnvironment,
    ) -> Result<GoRuntimeSnapshot> {
        self.runtime_snapshot()
            .await?
            .ok_or_else(|| GoConfigError::Invalid("no complete persisted Go configuration".into()))
    }

    pub async fn runtime_snapshot_for_marked_session(
        &self,
        environment: &GoEnvironment,
        marker: &str,
    ) -> Result<GoRuntimeSnapshot> {
        if marker != SESSION_OVERRIDE_MARKER {
            return self.runtime_snapshot_for_process(environment).await;
        }
        let input = GoConfigInput::from(environment.clone());
        if input.database_url.trim().is_empty()
            || input.redis_url.trim().is_empty()
            || input.jwt_secret.trim().is_empty()
        {
            return self.runtime_snapshot_for_process(environment).await;
        }
        // Validate by using the same local-only rules without persisting the input.
        if !input.database_url.trim().starts_with("postgres")
            || !input.redis_url.trim().starts_with("redis")
        {
            return self.runtime_snapshot_for_process(environment).await;
        }
        Ok(GoRuntimeSnapshot {
            database_url: input.database_url.trim().into(),
            redis_url: input.redis_url.trim().into(),
            jwt_secret: input.jwt_secret.trim().into(),
            source: GoRuntimeSource::SessionOverride,
        })
    }
}
