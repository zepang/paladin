use std::collections::{HashMap, VecDeque};
use std::env;
use std::ffi::OsString;
use std::io::{Read, Write};
use std::net::TcpListener;
use std::path::PathBuf;
use std::thread;
use std::time::Duration;

use crate::process::config::{EndpointConfig, HealthConfig, ProcessEntry, RuntimeMode};
use crate::process::log_rotate::{RotatingLineWriter, RotationPolicy};
use crate::process::supervisor::{
    augmented_spawn_path, process_log_line, resolve_dev_runtime_path, should_shutdown_on_drop,
    spawn_path_for_mode, DevRuntimePath, LogChunk, LogStream, ProcessHealth, ProcessInfoDTO,
    ProcessName, ProcessOwner, ProcessState,
};
use tempfile::tempdir;

#[test]
fn test_process_log_line_redacts_before_event_tail_and_disk() {
    let dir = tempdir().expect("temp dir");
    let path = dir.path().join("agent.log");
    let mut writer = RotatingLineWriter::new(&path, RotationPolicy::new(1024, 5));
    let mut tail = VecDeque::new();
    let mut events: Vec<LogChunk> = Vec::new();

    process_log_line(
        ProcessName::Agent,
        LogStream::Stderr,
        "DEEPSEEK_API_KEY=sk-sensitive",
        &mut writer,
        &mut tail,
        |chunk| events.push(chunk.clone()),
    );

    assert_eq!(events.len(), 1);
    assert!(!events[0].line.contains("sk-sensitive"));
    assert_eq!(tail.back(), Some(&events[0].line));
    let disk = std::fs::read_to_string(path).expect("persisted log");
    assert!(!disk.contains("sk-sensitive"));
    assert!(disk.contains("[REDACTED]"));
}

#[test]
fn test_process_log_line_keeps_emitting_after_persistence_failure() {
    let dir = tempdir().expect("temp dir");
    let missing_parent = dir.path().join("missing");
    let path = missing_parent.join("server.log");
    let mut writer = RotatingLineWriter::new(&path, RotationPolicy::new(4, 5));
    let mut tail = VecDeque::new();
    let mut events: Vec<LogChunk> = Vec::new();

    process_log_line(
        ProcessName::Server,
        LogStream::Stdout,
        "one",
        &mut writer,
        &mut tail,
        |c| events.push(c.clone()),
    );
    std::fs::create_dir(&missing_parent).expect("restore persistence");
    process_log_line(
        ProcessName::Server,
        LogStream::Stdout,
        "two",
        &mut writer,
        &mut tail,
        |c| events.push(c.clone()),
    );

    assert_eq!(
        events.iter().map(|e| e.line.as_str()).collect::<Vec<_>>(),
        ["one", "two"]
    );
    assert!(tail.is_empty(), "stdout must not enter stderr tail");
    assert_eq!(std::fs::read_to_string(path).unwrap(), "[stdout] two\n");
}

#[test]
fn test_augmented_spawn_path_adds_common_dev_tool_dirs() {
    let path = augmented_spawn_path(Some(OsString::from("/usr/bin:/bin")));
    let parts: Vec<PathBuf> = env::split_paths(&path).collect();

    assert!(
        parts.contains(&PathBuf::from("/usr/local/go/bin")),
        "spawn PATH should include the common Go install directory"
    );

    let home = env::var_os("HOME").expect("HOME set in dev test environment");
    let local_bin = PathBuf::from(home).join(".local/bin");
    assert!(
        parts.contains(&local_bin),
        "spawn PATH should include the common uv install directory"
    );
}

#[test]
fn test_spawn_path_for_mode_is_dev_only() {
    assert!(
        spawn_path_for_mode(RuntimeMode::Dev, Some(OsString::from("/usr/bin"))).is_some(),
        "dev mode may augment PATH for local uv/go tools"
    );
    assert!(
        spawn_path_for_mode(RuntimeMode::Packaged, Some(OsString::from("/usr/bin"))).is_none(),
        "packaged mode must not apply login-shell/dev PATH augmentation"
    );
}

#[test]
fn test_process_info_dto_serializes_owner_and_health() {
    let dto = ProcessInfoDTO {
        state: ProcessState::Conflict,
        owner: ProcessOwner::None,
        health: ProcessHealth::Failed,
        last_error: Some("port conflict".into()),
        stderr_tail: None,
        last_restart_at: None,
    };
    let json = serde_json::to_value(dto).expect("serialize dto");
    assert_eq!(json["state"], "conflict");
    assert_eq!(json["owner"], "none");
    assert_eq!(json["health"], "failed");
}

#[test]
fn test_drop_shutdown_only_for_final_shared_owner() {
    assert!(
        !should_shutdown_on_drop(2, 2),
        "dropping a temporary supervisor clone must not stop shared sidecars"
    );
    assert!(
        !should_shutdown_on_drop(1, 2),
        "mixed strong counts still mean another supervisor clone exists"
    );
    assert!(
        should_shutdown_on_drop(1, 1),
        "the final supervisor owner may run best-effort shutdown"
    );
}

#[tokio::test]
async fn test_dev_preflight_attaches_healthy_external_agent() {
    let port = spawn_fake_http_server(vec![("/health", 200)]);
    let entry = test_entry(port, None);

    let path = resolve_dev_runtime_path(crate::process::supervisor::ProcessName::Agent, &entry)
        .await
        .expect("preflight resolves");

    assert_eq!(
        path,
        DevRuntimePath::Attach {
            state: ProcessState::Running,
            health: ProcessHealth::Healthy,
        }
    );
}

#[tokio::test]
async fn test_dev_preflight_attaches_degraded_external_server() {
    let port = spawn_fake_http_server(vec![("/healthz", 200), ("/readyz", 503)]);
    let entry = test_entry(
        port,
        Some(EndpointConfig {
            path: "/readyz".into(),
            expect_status: 200,
        }),
    );

    let path = resolve_dev_runtime_path(crate::process::supervisor::ProcessName::Server, &entry)
        .await
        .expect("preflight resolves");

    assert_eq!(
        path,
        DevRuntimePath::Attach {
            state: ProcessState::Degraded,
            health: ProcessHealth::Degraded,
        }
    );
}

#[tokio::test]
async fn test_dev_preflight_reports_conflict_for_occupied_unhealthy_port() {
    let port = spawn_fake_http_server(vec![("/health", 500); 40]);
    let entry = test_entry(port, None);

    let path = resolve_dev_runtime_path(crate::process::supervisor::ProcessName::Agent, &entry)
        .await
        .expect("preflight resolves");

    match path {
        DevRuntimePath::Conflict(message) => {
            assert!(message.contains(&port.to_string()));
            assert!(message.contains("/health"));
        }
        other => panic!("expected conflict, got {other:?}"),
    }
}

fn test_entry(port: u16, readiness: Option<EndpointConfig>) -> ProcessEntry {
    ProcessEntry {
        cmd: vec!["paladin-test-sidecar".into()],
        cwd: None,
        env: HashMap::new(),
        port,
        health: HealthConfig {
            liveness: EndpointConfig {
                path: if readiness.is_some() {
                    "/healthz".into()
                } else {
                    "/health".into()
                },
                expect_status: 200,
            },
            readiness,
        },
        startup_grace_secs: 5,
    }
}

fn spawn_fake_http_server(routes: Vec<(&'static str, u16)>) -> u16 {
    let listener = TcpListener::bind(("127.0.0.1", 0)).expect("bind fake server");
    let port = listener.local_addr().expect("local addr").port();
    thread::spawn(move || {
        for _ in 0..routes.len() {
            let Ok((mut stream, _addr)) = listener.accept() else {
                return;
            };
            let mut buf = [0_u8; 1024];
            let n = stream.read(&mut buf).unwrap_or(0);
            let request = String::from_utf8_lossy(&buf[..n]);
            let status = routes
                .iter()
                .find_map(|(path, status)| request.contains(path).then_some(*status))
                .unwrap_or(404);
            let reason = if status == 200 { "OK" } else { "ERROR" };
            let response = format!("HTTP/1.1 {status} {reason}\r\nContent-Length: 0\r\n\r\n");
            let _ = stream.write_all(response.as_bytes());
        }
        thread::sleep(Duration::from_millis(1000));
    });
    port
}
