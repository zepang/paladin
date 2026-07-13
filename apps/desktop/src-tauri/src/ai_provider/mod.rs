#![allow(dead_code, unused_imports)]

mod bootstrap;
mod storage;
mod types;

use crate::process::ProcessSupervisor;
pub use bootstrap::{BootstrapImport, BootstrapSource};
pub use storage::AiProviderConfigManager;
pub use types::{
    AiProviderReadiness, AiProviderRuntimeSnapshot, ConfigProvenance, MaskedProviderConfig,
    MaskedProviderEntry, ProviderInput, ProviderSecretState, ProviderType, SaveProviderInput,
};
use serde::{Deserialize, Serialize};
use tauri::State;

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
pub struct TestAiProviderResult {
    pub readiness: AiProviderReadiness,
    pub configured: bool,
    pub message: Option<String>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
struct AgentProviderSnapshotPayload {
    provider_id: Option<String>,
    provider_type: Option<ProviderType>,
    base_url: Option<String>,
    model_id: Option<String>,
    api_key: Option<String>,
    readiness: AiProviderReadiness,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
struct AgentProviderValidationEnvelope {
    validation: AgentProviderValidation,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
struct AgentProviderValidation {
    readiness: AiProviderReadiness,
    configured: bool,
    message: Option<String>,
}

#[tauri::command]
pub async fn get_ai_provider_config(
    manager: State<'_, AiProviderConfigManager>,
) -> Result<MaskedProviderConfig, String> {
    get_ai_provider_config_with_manager(manager.inner()).await
}

#[tauri::command]
pub async fn save_ai_provider(
    manager: State<'_, AiProviderConfigManager>,
    supervisor: State<'_, ProcessSupervisor>,
    input: SaveProviderInput,
) -> Result<MaskedProviderEntry, String> {
    let saved = save_ai_provider_with_manager(manager.inner(), input).await?;
    let agent_url = supervisor.runtime_config().agent_url;
    refresh_agent_ai_provider_with_manager(manager.inner(), &agent_url).await?;
    Ok(saved)
}

#[tauri::command]
pub async fn delete_ai_provider(
    manager: State<'_, AiProviderConfigManager>,
    supervisor: State<'_, ProcessSupervisor>,
    provider_id: String,
) -> Result<MaskedProviderConfig, String> {
    let config = delete_ai_provider_with_manager(manager.inner(), provider_id).await?;
    let agent_url = supervisor.runtime_config().agent_url;
    refresh_agent_ai_provider_with_manager(manager.inner(), &agent_url).await?;
    Ok(config)
}

#[tauri::command]
pub async fn set_active_ai_provider(
    manager: State<'_, AiProviderConfigManager>,
    supervisor: State<'_, ProcessSupervisor>,
    provider_id: String,
) -> Result<MaskedProviderConfig, String> {
    let agent_url = supervisor.runtime_config().agent_url;
    set_active_ai_provider_with_manager(manager.inner(), Some(agent_url), provider_id).await
}

#[tauri::command]
pub async fn test_ai_provider(
    supervisor: State<'_, ProcessSupervisor>,
    input: SaveProviderInput,
) -> Result<TestAiProviderResult, String> {
    let agent_url = supervisor.runtime_config().agent_url;
    test_ai_provider_with_agent(&agent_url, input).await
}

#[tauri::command]
pub async fn refresh_agent_ai_provider(
    manager: State<'_, AiProviderConfigManager>,
    supervisor: State<'_, ProcessSupervisor>,
) -> Result<MaskedProviderConfig, String> {
    let agent_url = supervisor.runtime_config().agent_url;
    refresh_agent_ai_provider_with_manager(manager.inner(), &agent_url).await
}

pub(crate) async fn get_ai_provider_config_with_manager(
    manager: &AiProviderConfigManager,
) -> Result<MaskedProviderConfig, String> {
    manager
        .bootstrap_from_environment()
        .await
        .map_err(|error| error.to_string())?;
    manager
        .load_masked_config()
        .await
        .map_err(|error| error.to_string())
}

pub(crate) async fn save_ai_provider_with_manager(
    manager: &AiProviderConfigManager,
    input: SaveProviderInput,
) -> Result<MaskedProviderEntry, String> {
    manager
        .save_provider(input)
        .await
        .map_err(|error| error.to_string())
}

pub(crate) async fn delete_ai_provider_with_manager(
    manager: &AiProviderConfigManager,
    provider_id: String,
) -> Result<MaskedProviderConfig, String> {
    manager
        .delete_provider(&provider_id)
        .await
        .map_err(|error| error.to_string())?;
    manager
        .load_masked_config()
        .await
        .map_err(|error| error.to_string())
}

pub(crate) async fn set_active_ai_provider_with_manager(
    manager: &AiProviderConfigManager,
    agent_url: Option<String>,
    provider_id: String,
) -> Result<MaskedProviderConfig, String> {
    let config = manager
        .set_active_provider(&provider_id)
        .await
        .map_err(|error| error.to_string())?;
    if let Some(agent_url) = agent_url {
        refresh_agent_ai_provider_with_manager(manager, &agent_url).await?;
    }
    Ok(config)
}

pub(crate) async fn refresh_agent_ai_provider_with_manager(
    manager: &AiProviderConfigManager,
    agent_url: &str,
) -> Result<MaskedProviderConfig, String> {
    let snapshot = manager
        .runtime_snapshot()
        .await
        .map_err(|error| error.to_string())?;
    post_agent_json(
        agent_url,
        "/ai-provider/runtime",
        &AgentProviderSnapshotPayload {
            provider_id: snapshot.provider_id,
            provider_type: snapshot.provider_type,
            base_url: snapshot.base_url,
            model_id: snapshot.model_id,
            api_key: snapshot.api_key,
            readiness: snapshot.readiness,
        },
    )
    .await?;
    manager
        .load_masked_config()
        .await
        .map_err(|error| error.to_string())
}

pub(crate) async fn test_ai_provider_with_agent(
    agent_url: &str,
    input: SaveProviderInput,
) -> Result<TestAiProviderResult, String> {
    let input = normalize_command_input(input)?;
    let response = post_agent_json(
        agent_url,
        "/ai-provider/validate",
        &AgentProviderSnapshotPayload {
            provider_id: Some(input.id),
            provider_type: Some(input.provider_type),
            base_url: Some(input.base_url),
            model_id: Some(input.model_id),
            api_key: input.api_key,
            readiness: AiProviderReadiness::Untested,
        },
    )
    .await?;
    let envelope: AgentProviderValidationEnvelope =
        serde_json::from_str(&response).map_err(|error| error.to_string())?;
    Ok(TestAiProviderResult {
        readiness: envelope.validation.readiness,
        configured: envelope.validation.configured,
        message: envelope.validation.message,
    })
}

async fn post_agent_json<T: Serialize>(
    agent_url: &str,
    path: &str,
    payload: &T,
) -> Result<String, String> {
    let url = format!("{}{}", agent_url.trim_end_matches('/'), path);
    let body = serde_json::to_vec(payload).map_err(|error| error.to_string())?;
    let response = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(5))
        .build()
        .map_err(|error| error.to_string())?
        .post(url)
        .header("content-type", "application/json")
        .body(body)
        .send()
        .await
        .map_err(|error| error.to_string())?;
    let status = response.status();
    let text = response.text().await.map_err(|error| error.to_string())?;
    if !status.is_success() {
        return Err(format!("Agent AI provider request failed with {status}: {text}"));
    }
    Ok(text)
}

fn normalize_command_input(input: SaveProviderInput) -> Result<SaveProviderInput, String> {
    let id = input.id.trim().to_string();
    let display_name = input.display_name.trim().to_string();
    let base_url = input.base_url.trim().to_string();
    let model_id = input.model_id.trim().to_string();
    let api_key = input
        .api_key
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty());

    if id.is_empty() {
        return Err("provider id is required".to_string());
    }
    if display_name.is_empty() {
        return Err("display name is required".to_string());
    }
    if base_url.is_empty() {
        return Err("base url is required".to_string());
    }
    if model_id.is_empty() {
        return Err("model id is required".to_string());
    }

    Ok(SaveProviderInput {
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

#[cfg(test)]
mod bootstrap_tests;

#[cfg(test)]
mod commands_tests;

#[cfg(test)]
mod storage_tests;
