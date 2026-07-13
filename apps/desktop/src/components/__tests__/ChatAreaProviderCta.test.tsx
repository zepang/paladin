import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@copilotkit/react-core/v2', () => ({
  CopilotChat: () => <div data-testid="copilot-chat" />,
}));

vi.mock('@/components/ChatToolbar', () => ({
  ChatToolbar: () => <div data-testid="chat-toolbar" />,
}));

vi.mock('@/components/approval/AguiApprovalInterrupt', () => ({
  AguiApprovalInterrupt: () => null,
}));

import { ChatArea } from '@/components/ChatArea';
import { useAiProviderStore } from '@/stores/aiProvider';
import { useChatStore } from '@/stores/chat';
import { useTerminalStore } from '@/stores/terminal';

describe('ChatArea provider-not-configured CTA', () => {
  beforeEach(() => {
    useAiProviderStore.getState().resetForTest();
    useTerminalStore.setState({ isOpen: false, activePanel: 'terminal' });
    useChatStore.setState({
      currentThreadId: 'conversation-1',
      conversations: [
        {
          id: 'conversation-1',
          title: 'Provider setup',
          threadId: 'copilot-thread-1',
          createdAt: Date.now(),
          lastMessage: '',
          messageCount: 0,
        },
      ],
    });
  });

  afterEach(() => cleanup());

  it('renders one stable neutral CTA when AI provider readiness is unconfigured', () => {
    useAiProviderStore.setState({
      readiness: 'unconfigured',
      lastProviderError: { type: 'provider-not-configured' },
    });

    render(<ChatArea />);

    expect(screen.getAllByText('尚未配置 AI provider')).toHaveLength(1);
    expect(
      screen.getByText('配置 DeepSeek、OpenAI 兼容服务或 LM Studio 后即可开始对话。')
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /配置 AI provider/ })).toBeInTheDocument();
    expect(screen.queryByText(/崩溃|失败启动|Go|Redis|DB/)).not.toBeInTheDocument();
    expect(screen.queryByTestId('copilot-chat')).not.toBeInTheDocument();
  });

  it('opens the existing RightPanel on the ai-provider tab from the CTA', () => {
    useAiProviderStore.setState({
      readiness: 'invalid',
      lastProviderError: { type: 'provider-not-configured' },
    });

    render(<ChatArea />);
    fireEvent.click(screen.getByRole('button', { name: /配置 AI provider/ }));

    expect(useTerminalStore.getState().isOpen).toBe(true);
    expect(useTerminalStore.getState().activePanel).toBe('ai-provider');
  });
});
