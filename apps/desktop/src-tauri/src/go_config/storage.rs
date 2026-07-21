use super::bootstrap::GoEnvironment;
use super::types::{
    GoConfigInput, GoConfigProvenance, GoConfigReadiness, GoFieldDiagnostic, GoRuntimeSnapshot,
    GoRuntimeSource, MaskedGoServiceConfig,
};
use serde::{Deserialize, Serialize};
use std::fmt::{Display, Formatter};
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};
use tokio::sync::Mutex;

const METADATA_FILE: &str = "go-service.json";
const SECRETS_FILE: &str = "go-service-secrets.json";
const OPAQUE_FINGERPRINT: &str = "cfg_local";

#[derive(Debug)]
pub enum GoConfigError {
    Io(std::io::Error),
    Parse(serde_json::Error),
    Invalid(String),
}
impl Display for GoConfigError {
    fn fmt(&self, f: &mut Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Io(e) => write!(f, "go configuration storage error: {e}"),
            Self::Parse(e) => write!(f, "go configuration storage parse error: {e}"),
            Self::Invalid(e) => write!(f, "invalid go configuration: {e}"),
        }
    }
}
impl std::error::Error for GoConfigError {}
impl From<std::io::Error> for GoConfigError {
    fn from(value: std::io::Error) -> Self {
        Self::Io(value)
    }
}
impl From<serde_json::Error> for GoConfigError {
    fn from(value: serde_json::Error) -> Self {
        Self::Parse(value)
    }
}
pub type Result<T> = std::result::Result<T, GoConfigError>;

#[derive(Debug, Clone)]
pub struct GoConfigManager {
    app_data_dir: PathBuf,
    write_lock: Arc<Mutex<()>>,
}

#[derive(Debug, Clone, Default, Deserialize, Serialize)]
struct StoredMetadata {
    configured: bool,
    provenance: Option<GoConfigProvenance>,
    clear_blocks_auto_import: bool,
}
#[derive(Debug, Clone, Default, Deserialize, Serialize)]
struct StoredSecrets {
    database_url: String,
    redis_url: String,
    jwt_secret: String,
}

impl GoConfigManager {
    pub async fn new_for_app_data(app_data_dir: impl AsRef<Path>) -> Result<Self> {
        let app_data_dir = app_data_dir.as_ref().to_path_buf();
        std::fs::create_dir_all(&app_data_dir)?;
        Ok(Self {
            app_data_dir,
            write_lock: Arc::new(Mutex::new(())),
        })
    }

    pub async fn save(&self, input: GoConfigInput) -> Result<MaskedGoServiceConfig> {
        let _guard = self.write_lock.lock().await;
        let secrets = normalize_input(input)?;
        let metadata = StoredMetadata {
            configured: true,
            provenance: Some(GoConfigProvenance::LocalUser),
            clear_blocks_auto_import: false,
        };
        self.write_pair(&metadata, &secrets)?;
        Ok(masked(&metadata, GoFieldDiagnostic::default()))
    }

    pub async fn load_masked_config(&self) -> Result<MaskedGoServiceConfig> {
        let _guard = self.write_lock.lock().await;
        let metadata = self.read_metadata()?;
        Ok(masked(&metadata, diagnostics_for(&metadata, None)))
    }

    pub async fn clear(&self) -> Result<()> {
        let _guard = self.write_lock.lock().await;
        let metadata = StoredMetadata {
            configured: false,
            provenance: None,
            clear_blocks_auto_import: true,
        };
        self.write_pair(&metadata, &StoredSecrets::default())
    }

    /// Validate a write-only draft without retaining it. This is intentionally
    /// narrower than `save`: command callers receive only fixed field states.
    pub async fn validate_draft(&self, input: GoConfigInput) -> GoFieldDiagnostic {
        validate_input(&input).err().unwrap_or_default()
    }

    /// Validate the already persisted write-only configuration without exposing
    /// any secret value to a command response or the frontend.
    pub async fn validate_saved_configuration(&self) -> Result<GoFieldDiagnostic> {
        let _guard = self.write_lock.lock().await;
        let metadata = self.read_metadata()?;
        if !metadata.configured {
            return Ok(GoFieldDiagnostic {
                database_url: Some("missing".into()),
                redis_url: Some("missing".into()),
                jwt_secret: Some("missing".into()),
            });
        }
        let secrets = self.read_secrets()?;
        Ok(validate_input(&GoConfigInput {
            database_url: secrets.database_url,
            redis_url: secrets.redis_url,
            jwt_secret: secrets.jwt_secret,
        })
        .err()
        .unwrap_or_default())
    }

    pub(crate) async fn save_environment_import(
        &self,
        environment: &GoEnvironment,
    ) -> Result<MaskedGoServiceConfig> {
        let _guard = self.write_lock.lock().await;
        let secrets = normalize_input(GoConfigInput::from(environment.clone()))?;
        let metadata = StoredMetadata {
            configured: true,
            provenance: Some(GoConfigProvenance::EnvironmentImport),
            clear_blocks_auto_import: false,
        };
        self.write_pair(&metadata, &secrets)?;
        Ok(masked(&metadata, GoFieldDiagnostic::default()))
    }

    pub(crate) async fn bootstrap_state(&self) -> Result<(bool, bool)> {
        let _guard = self.write_lock.lock().await;
        let metadata = self.read_metadata()?;
        Ok((metadata.configured, metadata.clear_blocks_auto_import))
    }

    pub(crate) async fn runtime_snapshot(&self) -> Result<Option<GoRuntimeSnapshot>> {
        let _guard = self.write_lock.lock().await;
        let metadata = self.read_metadata()?;
        if !metadata.configured {
            return Ok(None);
        }
        let secrets = self.read_secrets()?;
        if !is_complete(&secrets) {
            return Ok(None);
        }
        Ok(Some(GoRuntimeSnapshot {
            database_url: secrets.database_url,
            redis_url: secrets.redis_url,
            jwt_secret: secrets.jwt_secret,
            source: GoRuntimeSource::Persisted,
        }))
    }

    pub(crate) async fn diagnostics_for_environment(
        &self,
        environment: &GoEnvironment,
    ) -> Result<GoFieldDiagnostic> {
        let _guard = self.write_lock.lock().await;
        Ok(diagnostics_for(&self.read_metadata()?, Some(environment)))
    }

    fn metadata_path(&self) -> PathBuf {
        self.app_data_dir.join(METADATA_FILE)
    }
    fn secrets_path(&self) -> PathBuf {
        self.app_data_dir.join(SECRETS_FILE)
    }
    fn read_metadata(&self) -> Result<StoredMetadata> {
        read_json_or_default(&self.metadata_path())
    }
    fn read_secrets(&self) -> Result<StoredSecrets> {
        read_json_or_default(&self.secrets_path())
    }
    fn write_pair(&self, metadata: &StoredMetadata, secrets: &StoredSecrets) -> Result<()> {
        // The manager lock makes this paired replacement indivisible to all manager readers.
        write_json_atomically(&self.secrets_path(), secrets)?;
        write_json_atomically(&self.metadata_path(), metadata)
    }
}

fn masked(
    metadata: &StoredMetadata,
    field_diagnostics: GoFieldDiagnostic,
) -> MaskedGoServiceConfig {
    MaskedGoServiceConfig {
        configured: metadata.configured,
        readiness: if metadata.configured {
            GoConfigReadiness::Untested
        } else {
            GoConfigReadiness::Unconfigured
        },
        provenance: metadata
            .provenance
            .unwrap_or(GoConfigProvenance::Unconfigured),
        fingerprint: if metadata.configured {
            OPAQUE_FINGERPRINT.to_string()
        } else {
            String::new()
        },
        field_diagnostics,
        pending_apply: false,
    }
}
fn diagnostics_for(
    metadata: &StoredMetadata,
    environment: Option<&GoEnvironment>,
) -> GoFieldDiagnostic {
    if metadata.configured {
        return GoFieldDiagnostic::default();
    }
    let Some(environment) = environment else {
        return GoFieldDiagnostic {
            database_url: Some("missing".into()),
            redis_url: Some("missing".into()),
            jwt_secret: Some("missing".into()),
        };
    };
    match validate_input(&GoConfigInput::from(environment.clone())) {
        Ok(()) => GoFieldDiagnostic::default(),
        Err(diagnostics) => diagnostics,
    }
}
fn normalize_input(input: GoConfigInput) -> Result<StoredSecrets> {
    validate_input(&input)
        .map(|_| StoredSecrets {
            database_url: input.database_url.trim().to_string(),
            redis_url: input.redis_url.trim().to_string(),
            jwt_secret: input.jwt_secret.trim().to_string(),
        })
        .map_err(|_| {
            GoConfigError::Invalid(
                "database URL, Redis URL, and JWT secret must all be locally valid".into(),
            )
        })
}
fn validate_input(input: &GoConfigInput) -> std::result::Result<(), GoFieldDiagnostic> {
    let bad_database = !input.database_url.trim().starts_with("postgres://")
        && !input.database_url.trim().starts_with("postgresql://");
    let bad_redis = !input.redis_url.trim().starts_with("redis://")
        && !input.redis_url.trim().starts_with("rediss://");
    let bad_jwt = input.jwt_secret.trim().is_empty();
    let diagnostics = GoFieldDiagnostic {
        database_url: bad_database.then(|| "missing-or-invalid".into()),
        redis_url: bad_redis.then(|| "missing-or-invalid".into()),
        jwt_secret: bad_jwt.then(|| "missing-or-invalid".into()),
    };
    if diagnostics == GoFieldDiagnostic::default() {
        Ok(())
    } else {
        Err(diagnostics)
    }
}
fn is_complete(secrets: &StoredSecrets) -> bool {
    validate_input(&GoConfigInput {
        database_url: secrets.database_url.clone(),
        redis_url: secrets.redis_url.clone(),
        jwt_secret: secrets.jwt_secret.clone(),
    })
    .is_ok()
}
fn read_json_or_default<T: for<'de> Deserialize<'de> + Default>(path: &Path) -> Result<T> {
    if !path.exists() {
        return Ok(T::default());
    }
    let bytes = std::fs::read(path)?;
    if bytes.is_empty() {
        return Ok(T::default());
    }
    Ok(serde_json::from_slice(&bytes)?)
}
fn write_json_atomically<T: Serialize>(path: &Path, value: &T) -> Result<()> {
    let parent = path
        .parent()
        .ok_or_else(|| GoConfigError::Invalid("app-data path has no parent".into()))?;
    std::fs::create_dir_all(parent)?;
    let nonce = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or_default();
    let tmp = parent.join(format!(
        ".{}.{}.tmp",
        path.file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("go-service"),
        nonce
    ));
    std::fs::write(&tmp, serde_json::to_vec_pretty(value)?)?;
    std::fs::rename(tmp, path)?;
    Ok(())
}
