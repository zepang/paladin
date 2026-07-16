import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { describe, expect, it, vi } from 'vitest';

const invoke = vi.fn();
vi.mock('@tauri-apps/api/core', () => ({ invoke }));

import { GoServicePanel } from '../GoServicePanel';

describe('Go 服务面板 RED 合同', () => {
  it('D-01/D-02 在 300px 面板中提供写入专用表单、无障碍标签及无秘密 DOM', () => {
    render(<div style={{ width: 300 }}><GoServicePanel /></div>);
    expect(screen.getByRole('heading', { name: 'Go 服务' })).toBeInTheDocument();
    expect(screen.getByLabelText('数据库 URL')).toBeInTheDocument();
    expect(screen.getByLabelText('Redis URL')).toBeInTheDocument();
    expect(screen.getByLabelText('JWT 密钥')).toHaveAttribute('type', 'password');
    expect(screen.getByRole('button', { name: '保存配置' })).toBeDisabled();
  });

  it('D-06 首次无效提交聚焦第一个错误字段且显示字段级文本', () => {
    render(<GoServicePanel />);
    fireEvent.click(screen.getByRole('button', { name: '保存配置' }));
    expect(screen.getByText('数据库 URL 不能为空')).toBeInTheDocument();
    expect(screen.getByLabelText('数据库 URL')).toHaveFocus();
  });

  it('D-03/D-08 分别呈现保存、测试、导入、清除确认和 inline 结果', () => {
    render(<GoServicePanel />);
    expect(screen.getByRole('button', { name: '测试连接' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '从环境变量导入' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '清除本地配置' }));
    expect(screen.getByRole('alertdialog')).toHaveTextContent('确认清除 Go 服务本地配置');
    expect(screen.getByText(/Agent 仍可继续使用/)).toBeInTheDocument();
  });
});
