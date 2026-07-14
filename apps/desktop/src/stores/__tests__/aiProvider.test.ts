import { act } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockInvoke = vi.fn();
vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: unknown[]) => mockInvoke(...args),
}));

import { useAiProviderStore } from '@/stores/aiProvider';

describe('useAiProviderStore Phase 11 readiness contracts', () => {
  beforeEach(() => {
    mockInvoke.mockReset();
    useAiProviderStore.getState().resetForTest();
  });

  it('loads unconfigured readiness separately from Agent and Go process state', async () => {
    mockInvoke.mockResolvedValueOnce({
      readiness: 'unconfigured',
      active_provider_id: null,
      providers: [],
    });

    await act(async () => {
      await useAiProviderStore.getState().refresh();
    });

    expect(mockInvoke).toHaveBeenCalledWith('get_ai_provider_config');
    expect(useAiProviderStore.getState().readiness).toBe('unconfigured');
    expect(useAiProviderStore.getState().statusLabel).toBe('AI · 未配置');
    expect(useAiProviderStore.getState().providers).toEqual([]);
  });

  it('saves provider DTOs without testing the connection implicitly', async () => {
    mockInvoke.mockResolvedValueOnce({
      id: 'deepseek-main',
      provider_type: 'deepseek',
      display_name: 'DeepSeek',
      base_url: 'https://api.deepseek.com/v1',
      model_id: 'deepseek-chat',
      priority: 1,
      active: true,
      readiness: 'untested',
      has_api_key: true,
      api_key_fingerprint: 'pk_7F3A',
    });

    await act(async () => {
      await useAiProviderStore.getState().saveProvider({
        id: 'deepseek-main',
        provider_type: 'deepseek',
        display_name: 'DeepSeek',
        base_url: 'https://api.deepseek.com/v1',
        model_id: 'deepseek-chat',
        priority: 1,
        active: true,
        api_key: 'sk-never-render-this',
      });
    });

    expect(mockInvoke).toHaveBeenCalledTimes(1);
    expect(mockInvoke).toHaveBeenCalledWith('save_ai_provider', {
      input: expect.objectContaining({
        id: 'deepseek-main',
        provider_type: 'deepseek',
        base_url: 'https://api.deepseek.com/v1',
        model_id: 'deepseek-chat',
        api_key: 'sk-never-render-this',
      }),
    });
    const savedProvider = useAiProviderStore.getState().providers[0];
    expect(savedProvider?.readiness).toBe('untested');
    expect(savedProvider?.api_key_fingerprint).toBe('pk_7F3A');
  });

  it('keeps masked readback metadata but never stores raw key text in UI state', async () => {
    mockInvoke.mockResolvedValueOnce({
      readiness: 'available',
      active_provider_id: 'custom',
      providers: [
        {
          id: 'custom',
          provider_type: 'openai-compatible',
          display_name: 'Custom',
          base_url: 'https://custom.example/v1',
          model_id: 'unicode-模型',
          priority: 3,
          active: true,
          readiness: 'available',
          has_api_key: true,
          api_key_fingerprint: 'pk_AB12',
        },
      ],
    });

    await act(async () => {
      await useAiProviderStore.getState().refresh();
    });

    const stateText = JSON.stringify(useAiProviderStore.getState());
    expect(stateText).toContain('pk_AB12');
    expect(stateText).not.toContain('sk-raw-secret');
    expect(useAiProviderStore.getState().providers[0]).not.toHaveProperty('api_key');
  });

  it('tests a candidate provider without saving or switching it', async () => {
    mockInvoke.mockResolvedValueOnce({
      readiness: 'invalid',
      configured: false,
      message: '连接测试失败，请检查配置后重试',
    });

    await act(async () => {
      await useAiProviderStore.getState().testProvider({
        id: 'custom',
        provider_type: 'openai-compatible',
        display_name: 'Custom',
        base_url: 'https://custom.example/v1',
        model_id: 'gpt-compatible',
        priority: 2,
        active: false,
        api_key: 'sk-test-only-secret',
      });
    });

    expect(mockInvoke).toHaveBeenCalledTimes(1);
    expect(mockInvoke).toHaveBeenCalledWith('test_ai_provider', {
      input: expect.objectContaining({
        id: 'custom',
        provider_type: 'openai-compatible',
        api_key: 'sk-test-only-secret',
      }),
    });
    expect(useAiProviderStore.getState().lastTestResult).toEqual({
      readiness: 'invalid',
      configured: false,
      message: '连接测试失败，请检查配置后重试',
    });
    expect(JSON.stringify(useAiProviderStore.getState())).not.toContain('sk-test-only-secret');
  });

  it('updates saved active provider readiness after a successful connection test', async () => {
    mockInvoke
      .mockResolvedValueOnce({
        readiness: 'untested',
        active_provider_id: 'deepseek-main',
        providers: [
          {
            id: 'deepseek-main',
            provider_type: 'deepseek',
            display_name: 'DeepSeek',
            base_url: 'https://api.deepseek.com/v1',
            model_id: 'deepseek-chat',
            priority: 1,
            active: true,
            readiness: 'untested',
            has_api_key: true,
            api_key_fingerprint: 'pk_7F3A',
          },
        ],
      })
      .mockResolvedValueOnce({
        readiness: 'available',
        configured: true,
        message: '连接可用',
      });

    await act(async () => {
      await useAiProviderStore.getState().refresh();
      await useAiProviderStore.getState().testProvider({
        id: 'deepseek-main',
        provider_type: 'deepseek',
        display_name: 'DeepSeek',
        base_url: 'https://api.deepseek.com/v1',
        model_id: 'deepseek-chat',
        priority: 1,
        active: true,
        api_key: null,
      });
    });

    expect(useAiProviderStore.getState().activeProvider?.readiness).toBe('available');
    expect(useAiProviderStore.getState().readiness).toBe('available');
    expect(useAiProviderStore.getState().statusLabel).toBe('AI · 可用');
  });

  it('keeps active provider metadata when readiness is untested or invalid', async () => {
    mockInvoke
      .mockResolvedValueOnce({
        readiness: 'untested',
        active_provider_id: 'local',
        providers: [
          {
            id: 'local',
            provider_type: 'lm-studio',
            display_name: 'LM Studio',
            base_url: 'http://localhost:1234/v1',
            model_id: 'local-model',
            priority: 1,
            active: true,
            readiness: 'untested',
            has_api_key: false,
            api_key_fingerprint: '',
          },
        ],
      })
      .mockResolvedValueOnce({
        readiness: 'invalid',
        active_provider_id: 'local',
        providers: [
          {
            id: 'local',
            provider_type: 'lm-studio',
            display_name: 'LM Studio',
            base_url: 'http://localhost:1234/v1',
            model_id: 'local-model',
            priority: 1,
            active: true,
            readiness: 'invalid',
            has_api_key: false,
            api_key_fingerprint: '',
          },
        ],
      });

    await act(async () => {
      await useAiProviderStore.getState().setActiveProvider('local');
    });
    expect(useAiProviderStore.getState().activeProvider?.readiness).toBe('untested');
    expect(useAiProviderStore.getState().statusLabel).toBe('AI · 未测试');

    await act(async () => {
      await useAiProviderStore.getState().refreshAgentRuntime();
    });
    expect(useAiProviderStore.getState().activeProvider?.readiness).toBe('invalid');
    expect(useAiProviderStore.getState().statusLabel).toBe('AI · 无效');
  });
});
