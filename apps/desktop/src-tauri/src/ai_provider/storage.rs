use super::types::{
    AiProviderReadiness, AiProviderRuntimeSnapshot, ConfigProvenance, MaskedProviderConfig,
    MaskedProviderEntry, ProviderInput, ProviderSecretState, ProviderType,
};
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, HashSet};
use std::fmt::{Display, Formatter};
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};
use tokio::sync::Mutex;

const METADATA_FILE: &str = "ai-providers.json";
const SECRETS_FILE: &str = "ai-provider-secrets.json";

#[derive(Debug)]
pub enum AiProviderConfigError {
    Io(std::io::Error),
    Parse(serde_json::Error),
    Invalid(String),
}

impl Display for AiProviderConfigError {
    fn fmt(&self, f: &mut Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Io(error) => write!(f, "io error: {error}"),
            Self::Parse(error) => write!(f, "parse error: {error}"),
            Self::Invalid(message) => write!(f, "invalid provider config: {message}"),
        }
    }
}

impl std::error::Error for AiProviderConfigError {}

impl From<std::io::Error> for AiProviderConfigError {
    fn from(error: std::io::Error) -> Self {
        Self::Io(error)
    }
}

impl From<serde_json::Error> for AiProviderConfigError {
    fn from(error: serde_json::Error) -> Self {
        Self::Parse(error)
    }
}

pub type Result<T> = std::result::Result<T, AiProviderConfigError>;

#[derive(Debug, Clone)]
pub struct AiProviderConfigManager {
    app_data_dir: PathBuf,
    write_lock: Arc<Mutex<()>>,
}

#[derive(Debug, Clone, Default, Deserialize, Serialize)]
pub(crate) struct StoredProviderConfig {
    providers: Vec<StoredProvider>,
    active_provider_id: Option<String>,
    provenance: Option<ConfigProvenance>,
    user_saved: bool,
    bootstrap_imported: bool,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
struct StoredProvider {
    id: String,
    provider_type: ProviderType,
    display_name: String,
    base_url: String,
    model_id: String,
    priority: i32,
    readiness: AiProviderReadiness,
}

#[derive(Debug, Clone, Default, Deserialize, Serialize)]
struct StoredSecrets {
    api_keys: BTreeMap<String, String>,
}

impl AiProviderConfigManager {
    pub async fn new_for_app_data(app_data_dir: impl AsRef<Path>) -> Result<Self> {
        let app_data_dir = app_data_dir.as_ref().to_path_buf();
        std::fs::create_dir_all(&app_data_dir)?;
        Ok(Self {
            app_data_dir,
            write_lock: Arc::new(Mutex::new(())),
        })
    }

    pub async fn save_provider(&self, input: ProviderInput) -> Result<MaskedProviderEntry> {
        let _guard = self.write_lock.lock().await;
        let mut config = self.read_metadata()?;
        let mut secrets = self.read_secrets()?;
        let existing_secret = secrets.api_keys.contains_key(input.id.trim());
        let provider = normalize_input(input, existing_secret)?;

        if let Some(api_key) = provider.api_key.as_ref() {
            secrets
                .api_keys
                .insert(provider.id.clone(), api_key.trim().to_string());
        }

        let stored = StoredProvider {
            id: provider.id.clone(),
            provider_type: provider.provider_type,
            display_name: provider.display_name.clone(),
            base_url: provider.base_url.clone(),
            model_id: provider.model_id.clone(),
            priority: provider.priority,
            readiness: AiProviderReadiness::Untested,
        };
        upsert_provider(&mut config.providers, stored);
        config.user_saved = true;
        config.bootstrap_imported = false;
        config.provenance = Some(ConfigProvenance::LocalUser);

        if provider.active || config.active_provider_id.is_none() {
            config.active_provider_id = Some(provider.id.clone());
        }
        sanitize_active_provider(&mut config);
        sort_providers(&mut config.providers);

        self.write_metadata(&config)?;
        self.write_secrets(&secrets)?;
        self.mask_one(&provider.id, &config, &secrets)
    }

    pub async fn delete_provider(&self, provider_id: &str) -> Result<()> {
        let _guard = self.write_lock.lock().await;
        let mut config = self.read_metadata()?;
        let mut secrets = self.read_secrets()?;
        config
            .providers
            .retain(|provider| provider.id != provider_id);
        secrets.api_keys.remove(provider_id);
        if config.active_provider_id.as_deref() == Some(provider_id) {
            config.active_provider_id = None;
        }
        sanitize_active_provider(&mut config);
        self.write_metadata(&config)?;
        self.write_secrets(&secrets)?;
        Ok(())
    }

    pub async fn set_active_provider(&self, provider_id: &str) -> Result<MaskedProviderConfig> {
        let _guard = self.write_lock.lock().await;
        let mut config = self.read_metadata()?;
        if !config
            .providers
            .iter()
            .any(|provider| provider.id == provider_id)
        {
            return Err(AiProviderConfigError::Invalid(format!(
                "unknown provider id {provider_id}"
            )));
        }
        config.active_provider_id = Some(provider_id.to_string());
        config.user_saved = true;
        config.provenance = Some(ConfigProvenance::LocalUser);
        self.write_metadata(&config)?;
        let secrets = self.read_secrets()?;
        Ok(mask_config(config, secrets))
    }

    pub async fn load_masked_config(&self) -> Result<MaskedProviderConfig> {
        let _guard = self.write_lock.lock().await;
        let mut config = self.read_metadata()?;
        sanitize_active_provider(&mut config);
        let secrets = self.read_secrets()?;
        Ok(mask_config(config, secrets))
    }

    pub async fn runtime_snapshot(&self) -> Result<AiProviderRuntimeSnapshot> {
        let _guard = self.write_lock.lock().await;
        let mut config = self.read_metadata()?;
        sanitize_active_provider(&mut config);
        let secrets = self.read_secrets()?;
        let Some(active_id) = config.active_provider_id.as_deref() else {
            return Ok(AiProviderRuntimeSnapshot {
                provider_id: None,
                provider_type: None,
                base_url: None,
                model_id: None,
                api_key: None,
                readiness: AiProviderReadiness::Unconfigured,
            });
        };
        let Some(provider) = config
            .providers
            .iter()
            .find(|provider| provider.id == active_id)
        else {
            return Ok(AiProviderRuntimeSnapshot {
                provider_id: None,
                provider_type: None,
                base_url: None,
                model_id: None,
                api_key: None,
                readiness: AiProviderReadiness::Unconfigured,
            });
        };
        let api_key = secrets.api_keys.get(&provider.id).cloned();
        Ok(AiProviderRuntimeSnapshot {
            provider_id: Some(provider.id.clone()),
            provider_type: Some(provider.provider_type),
            base_url: Some(provider.base_url.clone()),
            model_id: Some(provider.model_id.clone()),
            api_key,
            readiness: provider.readiness,
        })
    }

    pub async fn input_with_stored_secret(&self, input: ProviderInput) -> Result<ProviderInput> {
        let _guard = self.write_lock.lock().await;
        let secrets = self.read_secrets()?;
        let existing_secret = secrets.api_keys.contains_key(input.id.trim());
        let mut provider = normalize_input(input, existing_secret)?;
        if provider.api_key.is_none() {
            provider.api_key = secrets.api_keys.get(&provider.id).cloned();
        }
        Ok(provider)
    }

    pub async fn update_provider_readiness(
        &self,
        provider_id: &str,
        readiness: AiProviderReadiness,
    ) -> Result<MaskedProviderConfig> {
        let _guard = self.write_lock.lock().await;
        let mut config = self.read_metadata()?;
        let mut updated = false;
        for provider in &mut config.providers {
            if provider.id == provider_id {
                provider.readiness = readiness;
                updated = true;
                break;
            }
        }
        if !updated {
            return Err(AiProviderConfigError::Invalid(format!(
                "unknown provider id {provider_id}"
            )));
        }
        self.write_metadata(&config)?;
        let secrets = self.read_secrets()?;
        Ok(mask_config(config, secrets))
    }

    pub(crate) async fn seed_provider_from_bootstrap(
        &self,
        input: ProviderInput,
        provenance: ConfigProvenance,
    ) -> Result<()> {
        let _guard = self.write_lock.lock().await;
        let mut config = self.read_metadata()?;
        if config.user_saved || !config.providers.is_empty() {
            return Ok(());
        }
        let provider = normalize_input(input, false)?;
        let mut secrets = self.read_secrets()?;
        if let Some(api_key) = provider.api_key.as_ref() {
            secrets
                .api_keys
                .insert(provider.id.clone(), api_key.trim().to_string());
        }
        config.providers.push(StoredProvider {
            id: provider.id.clone(),
            provider_type: provider.provider_type,
            display_name: provider.display_name,
            base_url: provider.base_url,
            model_id: provider.model_id,
            priority: provider.priority,
            readiness: AiProviderReadiness::Untested,
        });
        config.active_provider_id = Some(provider.id);
        config.provenance = Some(provenance);
        config.bootstrap_imported = true;
        sanitize_active_provider(&mut config);
        sort_providers(&mut config.providers);
        self.write_metadata(&config)?;
        self.write_secrets(&secrets)?;
        Ok(())
    }

    pub(crate) async fn bootstrap_status(&self) -> Result<BootstrapStatus> {
        let _guard = self.write_lock.lock().await;
        let config = self.read_metadata()?;
        Ok(if config.user_saved {
            BootstrapStatus::LocalConfigExists
        } else if config.bootstrap_imported || !config.providers.is_empty() {
            BootstrapStatus::AlreadyImported
        } else {
            BootstrapStatus::Clean
        })
    }

    fn metadata_path(&self) -> PathBuf {
        self.app_data_dir.join(METADATA_FILE)
    }

    fn secrets_path(&self) -> PathBuf {
        self.app_data_dir.join(SECRETS_FILE)
    }

    fn read_metadata(&self) -> Result<StoredProviderConfig> {
        read_json_or_default(&self.metadata_path())
    }

    fn read_secrets(&self) -> Result<StoredSecrets> {
        read_json_or_default(&self.secrets_path())
    }

    fn write_metadata(&self, config: &StoredProviderConfig) -> Result<()> {
        write_json_atomically(&self.metadata_path(), config)
    }

    fn write_secrets(&self, secrets: &StoredSecrets) -> Result<()> {
        write_json_atomically(&self.secrets_path(), secrets)
    }

    fn mask_one(
        &self,
        provider_id: &str,
        config: &StoredProviderConfig,
        secrets: &StoredSecrets,
    ) -> Result<MaskedProviderEntry> {
        config
            .providers
            .iter()
            .find(|provider| provider.id == provider_id)
            .map(|provider| mask_provider(provider, config.active_provider_id.as_deref(), secrets))
            .ok_or_else(|| {
                AiProviderConfigError::Invalid(format!("unknown provider id {provider_id}"))
            })
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum BootstrapStatus {
    Clean,
    AlreadyImported,
    LocalConfigExists,
}

fn read_json_or_default<T>(path: &Path) -> Result<T>
where
    T: for<'de> Deserialize<'de> + Default,
{
    if !path.exists() {
        return Ok(T::default());
    }
    let bytes = std::fs::read(path)?;
    if bytes.is_empty() {
        return Ok(T::default());
    }
    Ok(serde_json::from_slice(&bytes)?)
}

fn write_json_atomically<T>(path: &Path, value: &T) -> Result<()>
where
    T: Serialize,
{
    let parent = path.parent().ok_or_else(|| {
        AiProviderConfigError::Invalid(format!("path has no parent: {}", path.display()))
    })?;
    std::fs::create_dir_all(parent)?;
    let nonce = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_nanos())
        .unwrap_or(0);
    let tmp_path = parent.join(format!(
        ".{}.{}.tmp",
        path.file_name()
            .and_then(|name| name.to_str())
            .unwrap_or("ai-provider"),
        nonce
    ));
    let bytes = serde_json::to_vec_pretty(value)?;
    std::fs::write(&tmp_path, bytes)?;
    std::fs::rename(&tmp_path, path)?;
    Ok(())
}

fn normalize_input(input: ProviderInput, existing_secret: bool) -> Result<ProviderInput> {
    let id = input.id.trim().to_string();
    let display_name = input.display_name.trim().to_string();
    let base_url = input.base_url.trim().to_string();
    let model_id = input.model_id.trim().to_string();
    let api_key = input
        .api_key
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty());

    if id.is_empty() {
        return Err(AiProviderConfigError::Invalid(
            "provider id is required".to_string(),
        ));
    }
    if display_name.is_empty() {
        return Err(AiProviderConfigError::Invalid(
            "display name is required".to_string(),
        ));
    }
    if base_url.is_empty() {
        return Err(AiProviderConfigError::Invalid(
            "base url is required".to_string(),
        ));
    }
    if model_id.is_empty() {
        return Err(AiProviderConfigError::Invalid(
            "model id is required".to_string(),
        ));
    }
    if input.provider_type.requires_api_key() && api_key.is_none() && !existing_secret {
        return Err(AiProviderConfigError::Invalid(
            "api key is required for cloud providers".to_string(),
        ));
    }

    Ok(ProviderInput {
        id,
        provider_type: input.provider_type,
        display_name,
        base_url,
        model_id,
        api_key,
        priority: input.priority,
        active: input.active,
    })
}

fn upsert_provider(providers: &mut Vec<StoredProvider>, provider: StoredProvider) {
    if let Some(existing) = providers
        .iter_mut()
        .find(|existing| existing.id == provider.id)
    {
        *existing = provider;
    } else {
        providers.push(provider);
    }
}

fn sanitize_active_provider(config: &mut StoredProviderConfig) {
    let mut ids = HashSet::new();
    config
        .providers
        .retain(|provider| ids.insert(provider.id.clone()));
    if let Some(active_id) = config.active_provider_id.as_deref() {
        if !config
            .providers
            .iter()
            .any(|provider| provider.id == active_id)
        {
            config.active_provider_id = None;
        }
    }
    if config.providers.is_empty() {
        config.active_provider_id = None;
    }
}

fn sort_providers(providers: &mut [StoredProvider]) {
    providers.sort_by(|left, right| {
        left.priority
            .cmp(&right.priority)
            .then_with(|| left.display_name.cmp(&right.display_name))
            .then_with(|| left.id.cmp(&right.id))
    });
}

fn mask_config(mut config: StoredProviderConfig, secrets: StoredSecrets) -> MaskedProviderConfig {
    sanitize_active_provider(&mut config);
    sort_providers(&mut config.providers);
    let readiness = if config.active_provider_id.is_some() {
        config
            .active_provider_id
            .as_deref()
            .and_then(|active_id| {
                config
                    .providers
                    .iter()
                    .find(|provider| provider.id == active_id)
                    .map(|provider| provider.readiness)
            })
            .unwrap_or(AiProviderReadiness::Untested)
    } else {
        AiProviderReadiness::Unconfigured
    };
    let providers = config
        .providers
        .iter()
        .map(|provider| mask_provider(provider, config.active_provider_id.as_deref(), &secrets))
        .collect();
    MaskedProviderConfig {
        providers,
        active_provider_id: config.active_provider_id,
        readiness,
        provenance: config.provenance,
    }
}

fn mask_provider(
    provider: &StoredProvider,
    active_provider_id: Option<&str>,
    secrets: &StoredSecrets,
) -> MaskedProviderEntry {
    let secret = secrets.api_keys.get(&provider.id);
    let secret_state = secret_state(secret.map(String::as_str));
    MaskedProviderEntry {
        id: provider.id.clone(),
        provider_type: provider.provider_type,
        display_name: provider.display_name.clone(),
        base_url: provider.base_url.clone(),
        model_id: provider.model_id.clone(),
        priority: provider.priority,
        active: active_provider_id == Some(provider.id.as_str()),
        readiness: provider.readiness,
        has_api_key: secret_state.has_api_key,
        api_key_fingerprint: secret_state.api_key_fingerprint,
    }
}

fn secret_state(secret: Option<&str>) -> ProviderSecretState {
    match secret {
        Some(value) if !value.is_empty() => ProviderSecretState {
            has_api_key: true,
            api_key_fingerprint: fingerprint(value),
        },
        _ => ProviderSecretState {
            has_api_key: false,
            api_key_fingerprint: String::new(),
        },
    }
}

fn fingerprint(value: &str) -> String {
    let mut hash: u32 = 0x811c9dc5;
    for byte in value.as_bytes() {
        hash ^= u32::from(*byte);
        hash = hash.wrapping_mul(0x01000193);
    }
    format!("pk_{:04X}", hash & 0xffff)
}
