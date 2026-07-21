import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockInvoke = vi.fn();
vi.mock('@tauri-apps/api/core', () => ({ invoke: (...args: unknown[]) => mockInvoke(...args) }));

import { useGoServiceStore } from '@/stores/goService';

const action = (operation: string, config = {}) => ({
  operation,
  config: {
    configured: true,
    provenance: 'local-user',
    fingerprint: 'cfg_12AB',
    fieldDiagnostics: {},
    readiness: 'untested',
    pendingApply: operation.includes('pending-restart'),
    ...config,
  },
  process: {
    owner: 'supervisor',
    state: 'running',
    health: 'healthy',
    pendingApply: false,
    allowedActions: { restart: true, stop: true, redetect: true },
  },
});

describe('Go 服务 store 的写入专用 RED 合同', () => {
  beforeEach(() => {
    mockInvoke.mockReset();
    useGoServiceStore.getState().resetForTest();
  });

  it('D-02 只保存掩码 DTO 与操作状态，绝不保存表单秘密', async () => {
    mockInvoke.mockResolvedValueOnce(action('saved-pending-restart'));
    await useGoServiceStore.getState().saveConfiguration({
      databaseUrl: 'postgres://phase12-ui-db-sentinel',
      redisUrl: 'redis://phase12-ui-redis-sentinel',
      jwtSecret: 'phase12-ui-jwt-sentinel',
    });
    const state = useGoServiceStore.getState();
    expect(JSON.stringify(state)).not.toContain('phase12-ui-db-sentinel');
    expect(state.config?.fingerprint).toBe('cfg_12AB');
  });

  it('D-03 保存成功与 readiness 测试失败彼此独立，测试草稿不落盘', async () => {
    mockInvoke.mockResolvedValueOnce(action('saved-pending-restart'));
    mockInvoke.mockResolvedValueOnce({
      valid: false,
      fieldDiagnostics: { redisUrl: 'missing-or-invalid' },
    });
    const store = useGoServiceStore.getState();
    await store.saveConfiguration({
      databaseUrl: 'postgres://save',
      redisUrl: 'redis://save',
      jwtSecret: 'phase12-save-jwt',
    });
    await store.testReadiness({
      databaseUrl: 'postgres://draft',
      redisUrl: 'redis://draft',
      jwtSecret: 'phase12-draft-jwt',
    });
    expect(useGoServiceStore.getState().config?.configured).toBe(true);
    expect(JSON.stringify(useGoServiceStore.getState())).not.toContain('phase12-draft-jwt');
  });

  it('D-06/D-08 将导入、测试、清除维持为不同操作', async () => {
    mockInvoke.mockResolvedValueOnce(action('imported-pending-restart'));
    mockInvoke.mockResolvedValueOnce(action('cleared-pending-restart', { configured: false }));
    await useGoServiceStore.getState().importFromEnvironment();
    await useGoServiceStore.getState().clearConfiguration();
    expect(mockInvoke).toHaveBeenNthCalledWith(1, 'import_go_service_environment');
    expect(mockInvoke).toHaveBeenNthCalledWith(2, 'clear_go_service_configuration');
  });

  it('D-03 将 retry 与 owner-gated restart 明确映射为不同命令与结果', async () => {
    mockInvoke
      .mockResolvedValueOnce(action('retry-current-process'))
      .mockResolvedValueOnce(action('restart-unavailable'));
    await useGoServiceStore.getState().retryReadiness();
    await useGoServiceStore.getState().restartService();
    expect(mockInvoke).toHaveBeenNthCalledWith(1, 'retry_go_service_readiness');
    expect(mockInvoke).toHaveBeenNthCalledWith(2, 'restart_go_service');
    expect(useGoServiceStore.getState().lastAction?.operation).toBe('restart-unavailable');
  });

  it('接收 Rust 序列化的 camelCase 保存响应，保留 supervisor 重启权限', async () => {
    // Mirrors `GoServiceActionResult` JSON produced by Rust serde; do not replace
    // this with a hand-built TypeScript object or snake_case compatibility shim.
    const rustSerializedSaveResponse = JSON.parse(`{
      "operation":"saved-pending-restart",
      "config":{"configured":true,"readiness":"untested","provenance":"local-user","fingerprint":"cfg_contract","fieldDiagnostics":{"databaseUrl":null,"redisUrl":null,"jwtSecret":null},"pendingApply":true},
      "process":{"state":"running","owner":"supervisor","health":"healthy","lastError":null,"stderrTail":null,"lastRestartAt":null,"diagnosticCategory":null,"pendingApply":true,"allowedActions":{"restart":true,"stop":true,"redetect":true}}
    }`);
    mockInvoke.mockResolvedValueOnce(rustSerializedSaveResponse);

    await useGoServiceStore.getState().saveConfiguration({
      databaseUrl: 'postgres://store-contract',
      redisUrl: 'redis://store-contract',
      jwtSecret: 'store-contract-secret',
    });

    const state = useGoServiceStore.getState();
    expect(state.process?.owner).toBe('supervisor');
    expect(state.process?.allowedActions.restart).toBe(true);
    expect(state.config?.pendingApply).toBe(true);
    expect(JSON.stringify(state)).not.toContain('store-contract-secret');
  });

  it('已保存配置检查只调用无输入的写入专用命令', async () => {
    mockInvoke.mockResolvedValueOnce({ valid: true, fieldDiagnostics: {} });

    await useGoServiceStore.getState().testSavedConfiguration();

    expect(mockInvoke).toHaveBeenCalledWith('test_saved_go_service_configuration');
    expect(JSON.stringify(useGoServiceStore.getState())).not.toContain('jwt');
  });
});
