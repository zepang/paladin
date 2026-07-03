import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AguiApprovalInterrupt,
  buildApprovalResumePayload,
  isApprovalRequired,
} from '../AguiApprovalInterrupt';
import { ApprovalCard, type ApprovalInterrupt } from '../ApprovalCard';
import { ChatArea } from '../../ChatArea';

const {
  agentMock,
  setInterruptElementMock,
  useChatStoreMock,
  useAgentMock,
  useCopilotKitMock,
  useTerminalStoreMock,
} = vi.hoisted(() => ({
  agentMock: {
    runAgent: vi.fn(),
    subscribe: vi.fn(() => ({ unsubscribe: vi.fn() })),
    messages: [],
  },
  setInterruptElementMock: vi.fn(),
  useChatStoreMock: vi.fn(),
  useAgentMock: vi.fn(),
  useCopilotKitMock: vi.fn(),
  useTerminalStoreMock: vi.fn(),
}));

vi.mock('@copilotkit/react-core/v2', () => ({
  CopilotChat: ({ threadId }: { threadId: string }) => (
    <div data-testid="copilot-chat" data-thread-id={threadId} />
  ),
  useAgent: useAgentMock,
  useCopilotKit: useCopilotKitMock,
}));

vi.mock('@/components/ChatToolbar', () => ({
  ChatToolbar: () => <aside data-testid="chat-toolbar" />,
}));

vi.mock('@/stores/chat', () => ({
  useChatStore: useChatStoreMock,
}));

vi.mock('@/stores/terminal', () => ({
  useTerminalStore: useTerminalStoreMock,
}));

const interrupt: ApprovalInterrupt = {
  id: 'interrupt-1',
  reason: 'Needs permission before editing files.',
  message: 'Approve this tool call?',
  toolCallId: 'tool-call-1',
  metadata: {
    toolName: 'edit_file',
    tool_args: {
      path: 'src/App.tsx',
      replacement: 'updated content',
    },
  },
};

type AguiInterruptSubscriber = {
  onRunFinishedEvent: (params: {
    outcome: 'interrupt';
    interrupts: Array<Record<string, unknown>>;
  }) => void;
};

function latestSubscriber(): AguiInterruptSubscriber {
  const calls = agentMock.subscribe.mock.calls as unknown as Array<[AguiInterruptSubscriber]>;
  const call = calls[calls.length - 1];
  if (!call) throw new Error('Expected AG-UI subscriber registration');
  return call[0];
}

function latestInterruptElement(): ReactElement {
  const calls = setInterruptElementMock.mock.calls as Array<[ReactElement | null]>;
  const call = calls[calls.length - 1];
  if (!call?.[0]) throw new Error('Expected interrupt element');
  return call[0];
}

describe('ApprovalCard', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders approval interrupt details', () => {
    render(
      <ApprovalCard
        interrupt={interrupt}
        status="pending"
        onApprove={vi.fn()}
        onDeny={vi.fn()}
      />,
    );

    expect(screen.getByText('Waiting for approval')).toBeTruthy();
    expect(screen.getByText('edit_file')).toBeTruthy();
    expect(screen.getByText('Approve this tool call?')).toBeTruthy();
    expect(screen.getByText('Needs permission before editing files.')).toBeTruthy();
    expect(screen.getByText(/src\/App\.tsx/)).toBeTruthy();
  });

  it('calls approval callbacks with the interrupt', () => {
    const onApprove = vi.fn();
    const onDeny = vi.fn();

    render(
      <ApprovalCard
        interrupt={interrupt}
        status="pending"
        onApprove={onApprove}
        onDeny={onDeny}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Approve' }));
    fireEvent.click(screen.getByRole('button', { name: 'Deny' }));

    expect(onApprove).toHaveBeenCalledWith(interrupt);
    expect(onDeny).toHaveBeenCalledWith(interrupt);
  });

  it('disables approval actions after approval', () => {
    const onApprove = vi.fn();
    const onDeny = vi.fn();

    render(
      <ApprovalCard
        interrupt={interrupt}
        status="approved"
        onApprove={onApprove}
        onDeny={onDeny}
      />,
    );

    const approveButton = screen.getByRole('button', { name: 'Approve' });
    const denyButton = screen.getByRole('button', { name: 'Deny' });

    expect(approveButton.hasAttribute('disabled')).toBe(true);
    expect(denyButton.hasAttribute('disabled')).toBe(true);

    fireEvent.click(approveButton);
    fireEvent.click(denyButton);

    expect(onApprove).not.toHaveBeenCalled();
    expect(onDeny).not.toHaveBeenCalled();
  });
});

describe('AG-UI approval interrupt helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAgentMock.mockReturnValue({ agent: agentMock });
    useCopilotKitMock.mockReturnValue({
      copilotkit: { setInterruptElement: setInterruptElementMock },
    });
    useChatStoreMock.mockImplementation((selector) =>
      selector({
        currentThreadId: 'conversation-1',
        conversations: [{ id: 'conversation-1', threadId: 'thread-1' }],
      }),
    );
    useTerminalStoreMock.mockImplementation((selector) => selector({ isOpen: false }));
  });

  afterEach(() => {
    cleanup();
  });

  it('accepts the official Pydantic AI tool_call interrupt reason', () => {
    expect(isApprovalRequired({ value: { reason: 'tool_call' } })).toBe(true);
  });

  it('rejects missing, empty, legacy, and unrelated interrupt reasons', () => {
    expect(isApprovalRequired({ value: undefined })).toBe(false);
    expect(isApprovalRequired({ value: {} })).toBe(false);
    expect(isApprovalRequired({ value: { reason: 'approval_required' } })).toBe(false);
    expect(isApprovalRequired({ value: { reason: 'human_review' } })).toBe(false);
  });

  it('uses the official resume payload schema', () => {
    expect(buildApprovalResumePayload('approved')).toEqual({ approved: true });
    expect(buildApprovalResumePayload('denied')).toEqual({
      approved: false,
      reason: 'User denied this tool call.',
    });
  });

  it('subscribes to official AG-UI run-finished interrupts', () => {
    render(<AguiApprovalInterrupt />);

    expect(agentMock.subscribe).toHaveBeenCalledWith(
      expect.objectContaining({
        onRunFinishedEvent: expect.any(Function),
        onRunStartedEvent: expect.any(Function),
        onRunFailed: expect.any(Function),
      }),
    );
  });

  it('keeps the official approval interrupt mounted in the chat area', () => {
    render(<ChatArea />);

    expect(agentMock.subscribe).toHaveBeenCalledWith(
      expect.objectContaining({
        onRunFinishedEvent: expect.any(Function),
      }),
    );
    expect(screen.getByTestId('copilot-chat').getAttribute('data-thread-id')).toBe('thread-1');
  });

  it('sends only one official resume entry for repeated approve clicks', async () => {
    render(<AguiApprovalInterrupt />);

    const subscriber = latestSubscriber();

    await act(async () => {
      subscriber.onRunFinishedEvent({
        outcome: 'interrupt',
        interrupts: [{
          id: 'interrupt-1',
          reason: 'tool_call',
          message: 'Approve this tool call?',
          toolCallId: 'tool-call-1',
          metadata: { toolName: 'edit_file' },
        }],
      });
    });

    const element = latestInterruptElement();
    render(element);

    const approveButton = screen.getByRole('button', { name: 'Approve' });
    fireEvent.click(approveButton);
    fireEvent.click(approveButton);

    expect(agentMock.runAgent).toHaveBeenCalledTimes(1);
    expect(agentMock.runAgent).toHaveBeenCalledWith({
      resume: [
        {
          interruptId: 'interrupt-1',
          status: 'resolved',
          payload: { approved: true },
        },
      ],
    });
  });

  it('renders official AG-UI run-finished interrupts and resumes with resume entries', async () => {
    render(<AguiApprovalInterrupt />);

    const subscriber = latestSubscriber();
    const officialInterrupt = {
      id: 'int-tool-call-1',
      reason: 'tool_call',
      message: 'Approve write_file({"path":"/tmp/test.txt"})?',
      toolCallId: 'tool-call-1',
      metadata: { toolName: 'write_file', tool_args: { path: '/tmp/test.txt' } },
    };

    await act(async () => {
      subscriber.onRunFinishedEvent({
        outcome: 'interrupt',
        interrupts: [officialInterrupt],
      });
    });

    const element = latestInterruptElement();
    expect(element).toBeTruthy();

    render(element);
    expect(screen.getByText('write_file')).toBeTruthy();
    expect(screen.getByText('Approve write_file({"path":"/tmp/test.txt"})?')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Approve' }));

    expect(agentMock.runAgent).toHaveBeenCalledWith({
      resume: [
        {
          interruptId: 'int-tool-call-1',
          status: 'resolved',
          payload: { approved: true },
        },
      ],
    });
  });
});
