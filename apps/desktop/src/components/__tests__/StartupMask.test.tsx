import { cleanup, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { StartupMask } from '../StartupMask';

describe('StartupMask packaged diagnostics', () => {
  afterEach(() => cleanup());

  it('uses installed-app copy for packaged config failures without source-path guidance', () => {
    render(
      <StartupMask
        agentState="stopped"
        owner="supervisor"
        health="failed"
        error="运行时配置无效: src-tauri/processes.json parse failed"
        stderrTail="config schema mismatch"
        onRestart={vi.fn()}
      />,
    );

    expect(screen.getByText('配置错误')).toBeInTheDocument();
    expect(screen.getByText('内置运行时配置无效')).toBeInTheDocument();
    expect(screen.getByText(/Paladin 无法读取有效的内置启动配置/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /重启 Agent/ })).toBeInTheDocument();
    expect(screen.queryByText(/src-tauri/)).not.toBeInTheDocument();
    expect(screen.queryByText(/processes\.json/)).not.toBeInTheDocument();
    expect(screen.queryByText(/uv|go|pnpm|cargo/)).not.toBeInTheDocument();
  });

  it('does not render a blocking mask when the Agent is already running', () => {
    const { container } = render(
      <StartupMask
        agentState="running"
        owner="supervisor"
        health="degraded"
        error="Go readiness degraded"
        stderrTail={null}
        onRestart={vi.fn()}
      />,
    );

    expect(container).toBeEmptyDOMElement();
  });
});
