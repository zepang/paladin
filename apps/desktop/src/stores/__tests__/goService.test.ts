import { beforeEach, describe, expect, it, vi } from 'vitest';

const invoke = vi.fn();
vi.mock('@tauri-apps/api/core', () => ({ invoke }));

import { useGoServiceStore } from '@/stores/goService';

describe('Go 服务 store 的写入专用 RED 合同', () => {
  beforeEach(() => {
    invoke.mockReset();
    useGoServiceStore.getState().resetForTest();
  });

  it('D-02 只保存掩码 DTO 与操作状态，绝不保存表单秘密', async () => {
    invoke.mockResolvedValueOnce({
      configured: true,
      provenance: 'local-user',
      fingerprint: 'cfg_12AB',
      fieldDiagnostics: {},
      readiness: 'untested',
    });
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
    invoke.mockResolvedValueOnce({ configured: true, readiness: 'untested', fingerprint: 'cfg_12AB' });
    invoke.mockResolvedValueOnce({ readiness: 'dependency-degraded', category: 'redis-down' });
    const store = useGoServiceStore.getState();
    await store.saveConfiguration({ databaseUrl: 'postgres://save', redisUrl: 'redis://save', jwtSecret: 'phase12-save-jwt' });
    await store.testReadiness({ databaseUrl: 'postgres://draft', redisUrl: 'redis://draft', jwtSecret: 'phase12-draft-jwt' });
    expect(useGoServiceStore.getState().config?.configured).toBe(true);
    expect(JSON.stringify(useGoServiceStore.getState())).not.toContain('phase12-draft-jwt');
  });

  it('D-06/D-08 将导入、测试、清除维持为不同操作', async () => {
    await useGoServiceStore.getState().importFromEnvironment();
    await useGoServiceStore.getState().clearConfiguration();
    expect(invoke).toHaveBeenNthCalledWith(1, 'import_go_service_environment');
    expect(invoke).toHaveBeenNthCalledWith(2, 'clear_go_service_configuration');
  });
});
