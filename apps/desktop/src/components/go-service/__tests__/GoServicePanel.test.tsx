import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it, vi } from 'vitest';

const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock('@tauri-apps/api/core', () => ({ invoke }));

import { useGoServiceStore } from '@/stores/goService';
import { GoServicePanel } from '../GoServicePanel';

describe('Go 服务面板 RED 合同', () => {
  const action = (operation: string, owner: 'supervisor' | 'external' | 'none' = 'none') => ({
    operation,
    config: {
      configured: operation !== 'cleared-pending-restart',
      readiness: 'untested',
      provenance: 'local-user',
      fingerprint: 'cfg_local',
      fieldDiagnostics: {},
      pendingApply: operation.includes('pending'),
    },
    process: {
      owner,
      state: 'running',
      health: 'unknown',
      pendingApply: operation.includes('pending'),
      allowedActions: { restart: owner === 'supervisor', stop: false, redetect: true },
    },
  });

  it('托管 Go 服务保存完整配置后自动重启以应用并检测新配置', async () => {
    invoke
      .mockResolvedValueOnce(action('retry-current-process', 'supervisor'))
      .mockResolvedValueOnce(action('saved-pending-restart', 'supervisor'))
      .mockResolvedValueOnce(action('restarted-managed-process', 'supervisor'));
    render(<GoServicePanel />);
    await waitFor(() => expect(screen.getByRole('button', { name: /测试/ })).not.toBeDisabled());
    fireEvent.change(screen.getByLabelText('数据库 URL'), {
      target: { value: 'postgres://local' },
    });
    fireEvent.change(screen.getByLabelText('Redis URL'), { target: { value: 'redis://local' } });
    fireEvent.change(screen.getByLabelText('JWT 密钥'), { target: { value: 'secret' } });
    fireEvent.click(screen.getByRole('button', { name: '保存配置' }));
    await waitFor(() =>
      expect(
        screen.getByText('Go 服务已重新启动。')
      ).toBeInTheDocument()
    );
    expect(screen.getByRole('button', { name: '重启' })).toBeInTheDocument();
    expect(invoke).toHaveBeenCalledWith('save_go_service_configuration', expect.anything());
    expect(invoke).toHaveBeenCalledWith('restart_go_service');
    expect(document.body.textContent).not.toContain('postgres://local');
    expect(document.body.textContent).not.toContain('secret');
  });

  it('真实 Rust camelCase 保存响应经 store 后会触发 supervisor 重启命令', async () => {
    const rustSerializedSaveResponse = JSON.parse(`{
      "operation":"saved-pending-restart",
      "config":{"configured":true,"readiness":"untested","provenance":"local-user","fingerprint":"cfg_contract","fieldDiagnostics":{"databaseUrl":null,"redisUrl":null,"jwtSecret":null},"pendingApply":true},
      "process":{"state":"running","owner":"supervisor","health":"healthy","lastError":null,"stderrTail":null,"lastRestartAt":null,"diagnosticCategory":null,"pendingApply":true,"allowedActions":{"restart":true,"stop":true,"redetect":true}}
    }`);
    invoke
      .mockResolvedValueOnce(action('retry-current-process', 'supervisor'))
      .mockResolvedValueOnce(rustSerializedSaveResponse)
      .mockResolvedValueOnce(action('restarted-managed-process', 'supervisor'));
    render(<GoServicePanel />);
    await waitFor(() => expect(screen.getByRole('button', { name: /测试/ })).not.toBeDisabled());
    fireEvent.change(screen.getByLabelText('数据库 URL'), { target: { value: 'postgres://contract' } });
    fireEvent.change(screen.getByLabelText('Redis URL'), { target: { value: 'redis://contract' } });
    fireEvent.change(screen.getByLabelText('JWT 密钥'), { target: { value: 'contract-secret' } });
    fireEvent.click(screen.getByRole('button', { name: '保存配置' }));

    await waitFor(() => expect(invoke).toHaveBeenCalledWith('restart_go_service'));
    expect(screen.getByText('Go 服务已重新启动。')).toBeInTheDocument();
    expect(document.body.textContent).not.toContain('contract-secret');
  });

  it('保存命令失败时显示经脱敏的 Tauri 错误，而不吞掉原因或回显草稿秘密', async () => {
    const saveFailure = new Error('go configuration storage error: permission denied for /app-data');
    invoke
      .mockResolvedValueOnce(action('retry-current-process', 'supervisor'))
      .mockRejectedValueOnce(saveFailure);
    render(<GoServicePanel />);
    await waitFor(() => expect(screen.getByRole('button', { name: /测试/ })).not.toBeDisabled());
    fireEvent.change(screen.getByLabelText('数据库 URL'), { target: { value: 'postgres://save-failure' } });
    fireEvent.change(screen.getByLabelText('Redis URL'), { target: { value: 'redis://save-failure' } });
    fireEvent.change(screen.getByLabelText('JWT 密钥'), { target: { value: 'save-failure-secret' } });
    fireEvent.click(screen.getByRole('button', { name: '保存配置' }));

    await waitFor(() =>
      expect(screen.getByText(/保存配置失败：go configuration storage error: permission denied/)).toBeInTheDocument(),
    );
    expect(document.body.textContent).not.toContain('postgres://save-failure');
    expect(document.body.textContent).not.toContain('redis://save-failure');
    expect(document.body.textContent).not.toContain('save-failure-secret');
  });

  it('JWT 输入支持安全生成和显隐，且生成值不写入结果区', async () => {
    invoke.mockResolvedValueOnce(action('retry-current-process', 'supervisor'));
    render(<GoServicePanel />);
    await waitFor(() => expect(screen.getByRole('button', { name: /测试/ })).not.toBeDisabled());

    const input = screen.getByLabelText('JWT 密钥');
    expect(input).toHaveAttribute('type', 'password');
    fireEvent.click(screen.getByRole('button', { name: '生成安全 JWT 密钥' }));
    expect((input as HTMLInputElement).value).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(document.body.textContent).not.toContain((input as HTMLInputElement).value);
    fireEvent.click(screen.getByRole('button', { name: '显示 JWT 密钥' }));
    expect(input).toHaveAttribute('type', 'text');
    fireEvent.click(screen.getByRole('button', { name: '隐藏 JWT 密钥' }));
    expect(input).toHaveAttribute('type', 'password');
  });

  it('测试当前输入不保存，外部进程只提供重新检测', async () => {
    invoke
      .mockResolvedValueOnce(action('retry-current-process', 'external'))
      .mockResolvedValueOnce({ valid: true, fieldDiagnostics: {} });
    render(<GoServicePanel />);
    await waitFor(() => expect(screen.getByRole('button', { name: /测试/ })).not.toBeDisabled());
    fireEvent.change(screen.getByLabelText('数据库 URL'), {
      target: { value: 'postgres://draft' },
    });
    fireEvent.change(screen.getByLabelText('Redis URL'), { target: { value: 'redis://draft' } });
    fireEvent.change(screen.getByLabelText('JWT 密钥'), { target: { value: 'draft-secret' } });
    fireEvent.click(screen.getByRole('button', { name: /测试/ }));
    await waitFor(() => expect(screen.getByText('Go 服务依赖可用')).toBeInTheDocument());
    expect(invoke).toHaveBeenCalledWith('test_go_service_configuration', expect.anything());
    expect(invoke).not.toHaveBeenCalledWith('save_go_service_configuration', expect.anything());
    expect(screen.queryByRole('button', { name: '重启' })).not.toBeInTheDocument();
    expect(screen.getByText('外部 Go 服务需自行重启后重新检测。')).toBeInTheDocument();
  });

  it('running+healthy+unconfigured 时区分进程存活与未配置降级，不宣称服务运行正常', async () => {
    const unconfiguredAction = action('cleared-pending-restart', 'supervisor');
    unconfiguredAction.config.readiness = 'unconfigured';
    unconfiguredAction.process.health = 'healthy';
    invoke.mockResolvedValueOnce(unconfiguredAction);

    render(<GoServicePanel />);

    await waitFor(() =>
      expect(
        screen.getByText('Go 服务进程正在运行，但本地 Go 配置未配置；服务处于降级状态。'),
      ).toBeInTheDocument(),
    );
    expect(screen.queryByText('Go 服务运行正常（实时健康检查已通过）。')).not.toBeInTheDocument();
    expect(screen.getByText('依赖 readiness：unconfigured')).toBeInTheDocument();
  });

  it('running+healthy+configured 时显示服务运行正常', async () => {
    const healthyAction = action('retry-current-process', 'supervisor');
    healthyAction.process.health = 'healthy';
    invoke.mockResolvedValueOnce(healthyAction);

    render(<GoServicePanel />);

    await waitFor(() =>
      expect(screen.getByText('Go 服务运行正常（实时健康检查已通过）。')).toBeInTheDocument(),
    );
    expect(screen.queryByText('Go 服务未完全就绪；Agent 仍可继续使用。')).not.toBeInTheDocument();
    expect(screen.getByText('依赖 readiness：untested')).toBeInTheDocument();
  });

  it('依赖检查失败时保持降级文案，即使本地配置已保存', async () => {
    const degradedAction = action('retry-current-process', 'supervisor');
    degradedAction.process.health = 'degraded';
    invoke.mockResolvedValueOnce(degradedAction);

    render(<GoServicePanel />);

    await waitFor(() =>
      expect(screen.getByText('Go 服务未完全就绪；Agent 仍可继续使用。')).toBeInTheDocument(),
    );
    expect(screen.queryByText('Go 服务运行正常（实时健康检查已通过）。')).not.toBeInTheDocument();
  });

  it('已保存配置可在不重新输入写入专用字段的情况下安全检查', async () => {
    const healthyAction = action('retry-current-process', 'supervisor');
    healthyAction.process.health = 'healthy';
    invoke
      .mockResolvedValueOnce(healthyAction)
      .mockResolvedValueOnce({ valid: true, fieldDiagnostics: {} });

    render(<GoServicePanel />);

    await waitFor(() =>
      expect(screen.getByRole('button', { name: '测试已保存配置' })).not.toBeDisabled(),
    );
    fireEvent.click(screen.getByRole('button', { name: '测试已保存配置' }));
    await waitFor(() => expect(screen.getByText('已保存配置完整可用。')).toBeInTheDocument());
    expect(invoke).toHaveBeenCalledWith('test_saved_go_service_configuration');
    expect(screen.getByLabelText('数据库 URL')).toHaveValue('');
    expect(screen.getByLabelText('Redis URL')).toHaveValue('');
    expect(screen.getByLabelText('JWT 密钥')).toHaveValue('');
  });

  it('旧版事件 DTO 缺少 allowedActions 时不崩溃，也不推断出重启权限', async () => {
    const legacyAction = action('retry-current-process', 'supervisor');
    const { allowedActions: _allowedActions, ...legacyProcess } = legacyAction.process;
    invoke
      .mockResolvedValueOnce({ ...legacyAction, process: legacyProcess })
      .mockResolvedValueOnce({
        ...action('saved-pending-restart', 'supervisor'),
        process: legacyProcess,
      });

    render(<GoServicePanel />);

    await waitFor(() => expect(screen.getByRole('button', { name: /测试/ })).not.toBeDisabled());
    expect(screen.queryByRole('button', { name: '重启' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '重试 readiness' })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('数据库 URL'), { target: { value: 'postgres://legacy' } });
    fireEvent.change(screen.getByLabelText('Redis URL'), { target: { value: 'redis://legacy' } });
    fireEvent.change(screen.getByLabelText('JWT 密钥'), { target: { value: 'legacy-secret' } });
    fireEvent.click(screen.getByRole('button', { name: '保存配置' }));
    await waitFor(() =>
      expect(
        screen.getByText('配置已保存。运行中的 Go 服务将在重新启动后使用新配置。')
      ).toBeInTheDocument()
    );
    expect(invoke).not.toHaveBeenCalledWith('restart_go_service');
  });

  afterEach(() => {
    cleanup();
    invoke.mockReset();
    useGoServiceStore.getState().resetForTest();
  });
  it('D-01/D-02 在 300px 面板中提供写入专用表单、无障碍标签及无秘密 DOM', () => {
    render(
      <div style={{ width: 300 }}>
        <GoServicePanel />
      </div>
    );
    expect(screen.getByRole('heading', { name: 'Go 服务' })).toBeInTheDocument();
    expect(screen.getByLabelText('数据库 URL')).toBeInTheDocument();
    expect(screen.getByLabelText('Redis URL')).toBeInTheDocument();
    expect(screen.getByLabelText('JWT 密钥')).toHaveAttribute('type', 'password');
    expect(screen.getByRole('button', { name: '保存配置' })).toBeDisabled();
  });

  it('D-06 首次无效提交聚焦第一个错误字段且显示字段级文本', async () => {
    render(<GoServicePanel />);
    await waitFor(() =>
      expect(screen.getByRole('button', { name: '测试当前配置' })).not.toBeDisabled()
    );
    fireEvent.click(screen.getByRole('button', { name: '测试当前配置' }));
    expect(screen.getByText('数据库 URL 不能为空')).toBeInTheDocument();
    expect(screen.getByLabelText('数据库 URL')).toHaveFocus();
  });

  it('D-03/D-08 分别呈现保存、测试、导入、清除确认和 inline 结果', async () => {
    render(<GoServicePanel />);
    await waitFor(() =>
      expect(screen.getByRole('button', { name: '测试当前配置' })).not.toBeDisabled()
    );
    expect(screen.getByRole('button', { name: '测试当前配置' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '从环境变量导入' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '清除本地配置' }));
    expect(screen.getByRole('alertdialog')).toHaveTextContent('确认清除 Go 服务本地配置');
    expect(screen.getByText(/Agent 仍可继续使用/)).toBeInTheDocument();
  });
});
