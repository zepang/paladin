/// 进程监督器骨架 — 字段与具体行为在 plan 07.3-06 填充。
///
/// plan 07.3-01 仅声明 `ProcessState` 状态机枚举与 `ProcessSupervisor` 空结构体；
/// spawn / probe / restart / backoff / shutdown / log 捕获均不在此 plan 实现。
use serde::{Deserialize, Serialize};

/// 进程运行状态机 — SPEC R7 / Acceptance 锁定的 5 状态，serde lowercase 序列化到前端。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ProcessState {
    /// 首探完成前 / spawn 后 5s 窗口内
    Starting,
    /// /health 或 /healthz 返回 200
    Running,
    /// Go /readyz 非 200 (PG/Redis 挂)，仅报降级不重启
    Degraded,
    /// 探针 3 连败，重启中
    Unhealthy,
    /// 启动失败 / 退避耗尽 / 手动 stop
    Stopped,
}

/// 运行时进程名 — 与配置层 `ProcessNameKey` 解耦的运行时枚举。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ProcessName {
    Agent,
    Server,
}

/// 进程监督器 — 空骨架，字段与方法在 plan 07.3-06 填充。
#[allow(dead_code)]
pub struct ProcessSupervisor {
    // 字段在 plan 07.3-06 填充 (agent/server ManagedProcess、config、app_handle、log_dir 等)
}

#[allow(dead_code)]
impl ProcessSupervisor {
    /// 占位构造器 — 具体参数 (app_handle / config / log_dir) 在 plan 07.3-06 填充。
    pub fn new() -> Self {
        Self {}
    }
}

impl Default for ProcessSupervisor {
    fn default() -> Self {
        Self::new()
    }
}
