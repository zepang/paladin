import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockInvoke = vi.fn();
vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: unknown[]) => mockInvoke(...args),
}));

import { AiProviderPanel } from '@/components/provider/AiProviderPanel';

describe('AiProviderPanel Phase 11 contracts', () => {
  beforeEach(() => {
    mockInvoke.mockReset();
    mockInvoke.mockResolvedValue({
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
    });
  });

  afterEach(() => cleanup());

  it('renders provider rows with masked key metadata and no raw key text', async () => {
    render(<AiProviderPanel />);

    expect(await screen.findByText('DeepSeek')).toBeInTheDocument();
    expect(screen.getByText('deepseek-chat')).toBeInTheDocument();
    expect(screen.getByText(/API key 已配置 · pk_7F3A/)).toBeInTheDocument();
    expect(screen.queryByText(/sk-raw-secret/)).not.toBeInTheDocument();
  });

  it('keeps API key input empty when editing a provider with an existing key', async () => {
    render(<AiProviderPanel />);

    fireEvent.click(await screen.findByRole('button', { name: /DeepSeek/ }));

    expect(screen.getByLabelText('API key')).toHaveValue('');
    expect(screen.getByPlaceholderText('输入新的 API key')).toBeInTheDocument();
    expect(screen.getByText(/API key 已配置 · pk_7F3A/)).toBeInTheDocument();
  });

  it('separates save and test commands and shows field-level validation', async () => {
    render(<AiProviderPanel />);
    fireEvent.click(await screen.findByRole('button', { name: /DeepSeek/ }));
    fireEvent.change(screen.getByLabelText('base URL'), { target: { value: '' } });

    fireEvent.click(screen.getByRole('button', { name: '测试连接' }));
    expect(await screen.findByText(/base URL/)).toBeInTheDocument();
    expect(mockInvoke).not.toHaveBeenCalledWith('test_ai_provider', expect.anything());

    fireEvent.change(screen.getByLabelText('base URL'), {
      target: { value: 'https://api.deepseek.com/v1' },
    });
    fireEvent.click(screen.getByRole('button', { name: '保存配置' }));

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('save_ai_provider', expect.anything());
    });
    expect(mockInvoke).not.toHaveBeenCalledWith('test_ai_provider', expect.anything());
  });
});
