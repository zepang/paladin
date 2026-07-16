//! Phase 12 Go 服务配置的 Rust-only authority.
#![allow(dead_code, unused_imports)]

mod bootstrap;
mod commands;
mod storage;
mod types;

pub use bootstrap::{GoBootstrapResult, GoEnvironment};
pub use commands::{
    clear_go_service_configuration, get_go_service_configuration, import_go_service_environment,
    restart_go_service, retry_go_service_readiness, save_go_service_configuration,
    test_go_service_configuration, GoServiceActionResult, GoServiceOperation, TestGoServiceResult,
};
pub use storage::GoConfigManager;
pub(crate) use types::GoRuntimeSnapshot;
pub use types::{
    GoConfigInput, GoConfigProvenance, GoConfigReadiness, GoFieldDiagnostic, GoRuntimeSource,
    MaskedGoServiceConfig, SaveGoServiceInput,
};

#[cfg(test)]
mod bootstrap_tests;
#[cfg(test)]
mod commands_tests;
#[cfg(test)]
mod storage_tests;
