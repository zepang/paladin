import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));

import { GoServiceLight } from '../GoServiceLight';
import { AiProviderLight } from '../AiProviderLight';

describe('Go 服务状态灯 RED 合同', () => {
  it('D-03 独立显示 Go 与 AI 灯，并给出不阻断 Agent 的降级说明', () => {
    render(<><AiProviderLight /><GoServiceLight status="dependency-degraded" /></>);
    expect(screen.getByRole('button', { name: /AI ·/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Go · 依赖降级' }));
    expect(screen.getByText('Go 服务已启动，但依赖未完全就绪；Agent 仍可继续使用。')).toBeInTheDocument();
  });

  it.each([
    ['unconfigured', 'Go · 未配置 · 降级'],
    ['incomplete', 'Go · 配置不完整 · 降级'],
    ['session-override', 'Go · 会话覆盖 · 未保存'],
    ['ready', 'Go · 已就绪'],
    ['port-conflict', 'Go · 端口冲突'],
    ['sidecar-failed', 'Go · Sidecar 启动失败'],
  ] as const)('显示所需状态文案 %s', (status, label) => {
    render(<GoServiceLight status={status} />);
    expect(screen.getByRole('button', { name: label })).toBeInTheDocument();
  });

  it('外部 Go owner 禁止重启但保留重新检测', () => {
    render(<GoServiceLight status="ready" owner="external" />);
    fireEvent.click(screen.getByRole('button', { name: 'Go · 已就绪' }));
    expect(screen.getByRole('button', { name: '重启' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '重新检测' })).not.toBeDisabled();
  });
});
