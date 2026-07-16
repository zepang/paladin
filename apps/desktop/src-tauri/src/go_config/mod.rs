//! Phase 12 Go 服务配置的 Rust-only authority.

mod bootstrap;
mod storage;
mod types;

pub use bootstrap::{GoBootstrapResult, GoEnvironment};
pub use storage::GoConfigManager;
pub(crate) use types::GoRuntimeSnapshot;
pub use types::{
    GoConfigInput, GoConfigProvenance, GoConfigReadiness, GoFieldDiagnostic, MaskedGoServiceConfig,
    GoRuntimeSource, SaveGoServiceInput,
};

#[cfg(test)]
mod bootstrap_tests;
#[cfg(test)]
mod storage_tests;
