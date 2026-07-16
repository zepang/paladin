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

  it('保存仅持久化，管理进程才显示显式重启', async () => {
    invoke
      .mockResolvedValueOnce(action('retry-current-process', 'supervisor'))
      .mockResolvedValueOnce(action('saved-pending-restart', 'supervisor'));
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
        screen.getByText('配置已保存。运行中的 Go 服务将在重新启动后使用新配置。')
      ).toBeInTheDocument()
    );
    expect(screen.getByRole('button', { name: '重启' })).toBeInTheDocument();
    expect(invoke).toHaveBeenCalledWith('save_go_service_configuration', expect.anything());
    expect(invoke).not.toHaveBeenCalledWith('restart_go_service');
    expect(document.body.textContent).not.toContain('postgres://local');
    expect(document.body.textContent).not.toContain('secret');
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
