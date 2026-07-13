use std::io::{Read, Write};
use std::net::TcpListener;
use std::sync::mpsc;
use std::thread;

use serde_json::Value;
use tempfile::tempdir;

use super::{
    delete_ai_provider_with_manager, get_ai_provider_config_with_manager,
    refresh_agent_ai_provider_with_manager, save_ai_provider_with_manager,
    set_active_ai_provider_with_manager, test_ai_provider_with_agent, AiProviderConfigManager,
    AiProviderReadiness, ProviderInput, ProviderType,
};

fn deepseek_input(id: &str, key: &str, active: bool) -> ProviderInput {
    ProviderInput {
        id: id.to_string(),
        provider_type: ProviderType::DeepSeek,
        display_name: "DeepSeek 主账号".to_string(),
        base_url: "https://api.deepseek.example/v1".to_string(),
        model_id: "deepseek-chat".to_string(),
        api_key: Some(key.to_string()),
        priority: 10,
        active,
    }
}

#[tokio::test]
async fn save_and_read_commands_return_masked_config_without_raw_key() {
    let dir = tempdir().expect("temp app data dir");
    let manager = AiProviderConfigManager::new_for_app_data(dir.path())
        .await
        .unwrap();
    let raw_key = "sk-command-secret-value";

    let saved = save_ai_provider_with_manager(&manager, deepseek_input("deepseek-main", raw_key, true))
        .await
        .unwrap();
    let config = get_ai_provider_config_with_manager(&manager)
        .await
        .unwrap();
    let rendered = serde_json::to_string(&config).unwrap();

    assert_eq!(saved.id, "deepseek-main");
    assert!(saved.has_api_key);
    assert!(saved.api_key_fingerprint.starts_with("pk_"));
    assert_eq!(config.active_provider_id.as_deref(), Some("deepseek-main"));
    assert!(!rendered.contains(raw_key));
}

#[tokio::test]
async fn delete_active_provider_returns_unconfigured_masked_state() {
    let dir = tempdir().expect("temp app data dir");
    let manager = AiProviderConfigManager::new_for_app_data(dir.path())
        .await
        .unwrap();

    save_ai_provider_with_manager(&manager, deepseek_input("deepseek-main", "sk-delete", true))
        .await
        .unwrap();
    let config = delete_ai_provider_with_manager(&manager, "deepseek-main".to_string())
        .await
        .unwrap();

    assert!(config.providers.is_empty());
    assert_eq!(config.active_provider_id, None);
    assert_eq!(config.readiness, AiProviderReadiness::Unconfigured);
}

#[tokio::test]
async fn set_active_and_refresh_posts_runtime_snapshot_without_returning_raw_key() {
    let dir = tempdir().expect("temp app data dir");
    let manager = AiProviderConfigManager::new_for_app_data(dir.path())
        .await
        .unwrap();
    let raw_key = "sk-refresh-secret";
    let (agent_url, received) = spawn_provider_server(
        "/ai-provider/runtime",
        200,
        r#"{"ai_provider":{"readiness":"available"}}"#,
        2,
    );

    save_ai_provider_with_manager(&manager, deepseek_input("first", "sk-first", true))
        .await
        .unwrap();
    save_ai_provider_with_manager(&manager, deepseek_input("second", raw_key, false))
        .await
        .unwrap();

    let selected = set_active_ai_provider_with_manager(
        &manager,
        Some(agent_url.clone()),
        "second".to_string(),
    )
    .await
    .unwrap();
    let refreshed = refresh_agent_ai_provider_with_manager(&manager, &agent_url)
        .await
        .unwrap();
    let selected_json = serde_json::to_string(&selected).unwrap();
    let refreshed_json = serde_json::to_string(&refreshed).unwrap();
    let body = received.recv().expect("runtime POST body received");

    assert_eq!(selected.active_provider_id.as_deref(), Some("second"));
    assert_eq!(refreshed.active_provider_id.as_deref(), Some("second"));
    assert!(!selected_json.contains(raw_key));
    assert!(!refreshed_json.contains(raw_key));
    assert_eq!(body["provider_id"], "second");
    assert_eq!(body["provider_type"], "deepseek");
    assert_eq!(body["api_key"], raw_key);
}

#[tokio::test]
async fn test_provider_validates_supplied_input_without_saving_or_switching() {
    let dir = tempdir().expect("temp app data dir");
    let manager = AiProviderConfigManager::new_for_app_data(dir.path())
        .await
        .unwrap();
    let (agent_url, received) = spawn_provider_server(
        "/ai-provider/validate",
        200,
        r#"{"validation":{"readiness":"available","configured":true,"message":null}}"#,
        1,
    );

    let result = test_ai_provider_with_agent(
        &agent_url,
        deepseek_input("candidate", "sk-candidate", true),
    )
    .await
    .unwrap();
    let config = manager.load_masked_config().await.unwrap();
    let body = received.recv().expect("validate POST body received");

    assert_eq!(result.readiness, AiProviderReadiness::Available);
    assert!(result.configured);
    assert!(config.providers.is_empty());
    assert_eq!(body["provider_id"], "candidate");
    assert_eq!(body["api_key"], "sk-candidate");
}

fn spawn_provider_server(
    expected_path: &'static str,
    status: u16,
    response_body: &'static str,
    request_count: usize,
) -> (String, mpsc::Receiver<Value>) {
    let listener = TcpListener::bind(("127.0.0.1", 0)).expect("bind fake provider server");
    let port = listener.local_addr().unwrap().port();
    let (tx, rx) = mpsc::channel();
    thread::spawn(move || {
        for _ in 0..request_count {
            let Ok((mut stream, _)) = listener.accept() else {
                return;
            };
            let mut request = [0_u8; 8192];
            let bytes_read = stream.read(&mut request).unwrap_or(0);
            let text = String::from_utf8_lossy(&request[..bytes_read]);
            assert!(text.starts_with(&format!("POST {expected_path} HTTP/1.1")));
            let body = text
                .split("\r\n\r\n")
                .nth(1)
                .and_then(|body| serde_json::from_str::<Value>(body).ok())
                .expect("request body is JSON");
            tx.send(body).unwrap();
            let response = format!(
                "HTTP/1.1 {status} OK\r\ncontent-type: application/json\r\ncontent-length: {}\r\n\r\n{}",
                response_body.len(),
                response_body
            );
            stream.write_all(response.as_bytes()).unwrap();
        }
    });
    (format!("http://127.0.0.1:{port}"), rx)
}
