import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockInvoke = vi.fn().mockResolvedValue(undefined);
vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: unknown[]) => mockInvoke(...args),
}));

import { useProcessStore } from '@/stores/process';
import { useTerminalStore } from '@/stores/terminal';

import { ProcessLight } from '../ProcessLight';

describe('ProcessLight packaged process semantics', () => {
  beforeEach(() => {
    mockInvoke.mockClear();
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
  });

  afterEach(() => cleanup());

  it('explains Go degraded as non-blocking for Agent usage', () => {
    useProcessStore.getState().setStatus('server', {
      state: 'degraded',
      owner: 'supervisor',
      health: 'degraded',
      last_error: '启动 5s 内 /readyz 未就绪',
    });

    render(<ProcessLight name="server" label="Go" />);
    fireEvent.click(screen.getByRole('button', { name: /Go · 托管 · 降级/ }));

    expect(screen.getByText('状态: 降级 · 所有权: 托管 · 健康: 降级')).toBeInTheDocument();
    expect(screen.getByText(/Go 服务已启动，但依赖未完全就绪；Agent 仍可继续使用。/)).toBeInTheDocument();
    expect(screen.queryByText(/Paladin 无法使用/)).not.toBeInTheDocument();
  });

  it('protects external owner actions while keeping redetect and logs available', () => {
    useProcessStore.getState().setStatus('agent', {
      state: 'running',
      owner: 'external',
      health: 'healthy',
      last_error: null,
      stderr_tail: null,
    });
    const openPanel = vi.spyOn(useTerminalStore.getState(), 'openPanel');

    render(<ProcessLight name="agent" label="Agent" />);
    fireEvent.click(screen.getByRole('button', { name: /Agent · 外部 · 运行中/ }));

    expect(screen.getByRole('button', { name: '重启' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '停止' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '重新检测' })).not.toBeDisabled();
    expect(screen.getByRole('button', { name: '查看日志' })).not.toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: '重新检测' }));
    expect(mockInvoke).toHaveBeenCalledWith('redetect_agent');

    fireEvent.click(screen.getByRole('button', { name: '查看日志' }));
    expect(openPanel).toHaveBeenCalled();
  });
});
