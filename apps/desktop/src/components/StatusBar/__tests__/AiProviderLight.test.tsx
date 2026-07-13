import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockInvoke = vi.fn().mockResolvedValue(undefined);
vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: unknown[]) => mockInvoke(...args),
}));

import { AiProviderLight } from '@/components/StatusBar/AiProviderLight';
import { StatusBar } from '@/components/StatusBar';
import { useAiProviderStore } from '@/stores/aiProvider';
import { useProcessStore } from '@/stores/process';
import { useTerminalStore } from '@/stores/terminal';

describe('AiProviderLight Phase 11 status separation', () => {
  beforeEach(() => {
    mockInvoke.mockClear();
    useTerminalStore.setState({ isOpen: false, activePanel: 'terminal' });
    useProcessStore.setState({
      agent: {
        state: 'running',
        owner: 'supervisor',
        health: 'healthy',
        last_error: null,
        stderr_tail: null,
        last_restart_at: null,
      },
      server: {
        state: 'running',
        owner: 'supervisor',
        health: 'healthy',
        last_error: null,
        stderr_tail: null,
        last_restart_at: null,
      },
    });
    useAiProviderStore.getState().resetForTest();
  });

  afterEach(() => cleanup());

  it.each([
    ['unconfigured', 'AI · 未配置'],
    ['untested', 'AI · 未测试'],
    ['available', 'AI · 可用'],
    ['invalid', 'AI · 无效'],
  ] as const)('renders %s readiness as %s independently', (readiness, label) => {
    useAiProviderStore.setState({
      readiness,
      activeProvider: readiness === 'unconfigured' ? null : {
        id: 'deepseek-main',
        provider_type: 'deepseek',
        display_name: 'DeepSeek',
        base_url: 'https://api.deepseek.com/v1',
        model_id: 'deepseek-chat',
        priority: 1,
        active: true,
        readiness,
        has_api_key: true,
        api_key_fingerprint: 'pk_7F3A',
      },
    });

    render(<AiProviderLight />);

    expect(screen.getByRole('button', { name: new RegExp(label) })).toBeInTheDocument();
  });

  it('opens provider settings from the status popover without touching process controls', () => {
    useAiProviderStore.setState({
      readiness: 'available',
      activeProvider: {
        id: 'deepseek-main',
        provider_type: 'deepseek',
        display_name: 'DeepSeek',
        base_url: 'https://api.deepseek.com/v1',
        model_id: 'deepseek-chat',
        priority: 1,
        active: true,
        readiness: 'available',
        has_api_key: true,
        api_key_fingerprint: 'pk_7F3A',
      },
    });

    render(<AiProviderLight />);
    fireEvent.click(screen.getByRole('button', { name: /AI · 可用/ }));
    fireEvent.click(screen.getByRole('button', { name: '打开设置' }));

    expect(useTerminalStore.getState().isOpen).toBe(true);
    expect(useTerminalStore.getState().activePanel).toBe('ai-provider');
    expect(mockInvoke).not.toHaveBeenCalledWith('restart_agent');
    expect(mockInvoke).not.toHaveBeenCalledWith('redetect_server');
  });

  it('shows missing AI provider separately from degraded Go readiness', () => {
    useAiProviderStore.setState({ readiness: 'unconfigured', activeProvider: null });
    useProcessStore.getState().setStatus('server', {
      state: 'degraded',
      owner: 'supervisor',
      health: 'degraded',
      last_error: '启动 5s 内 /readyz 未就绪',
    });

    render(<StatusBar />);

    expect(screen.getByRole('button', { name: /AI · 未配置/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Go · 托管 · 降级/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Go · 未配置/ })).not.toBeInTheDocument();
  });
});
