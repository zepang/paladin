import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  AguiApprovalInterrupt,
  buildApprovalResumePayload,
  isApprovalRequired,
} from '../AguiApprovalInterrupt';
import { ApprovalCard, type ApprovalInterrupt } from '../ApprovalCard';

const { useInterruptMock } = vi.hoisted(() => ({
  useInterruptMock: vi.fn(),
}));

vi.mock('@copilotkit/react-core/v2', () => ({
  useInterrupt: useInterruptMock,
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

  it('registers useInterrupt for inline chat rendering with the official predicate', () => {
    render(<AguiApprovalInterrupt />);

    expect(useInterruptMock).toHaveBeenCalledWith(
      expect.objectContaining({
        enabled: isApprovalRequired,
        renderInChat: true,
      }),
    );
  });

  it('sends only one official resume payload for repeated approve clicks', () => {
    render(<AguiApprovalInterrupt />);

    const options = useInterruptMock.mock.calls[useInterruptMock.mock.calls.length - 1]?.[0];
    const resolve = vi.fn();
    const event = {
      name: 'approval',
      value: {
        id: 'interrupt-1',
        reason: 'tool_call',
        message: 'Approve this tool call?',
        toolCallId: 'tool-call-1',
        metadata: { toolName: 'edit_file' },
      },
    };

    render(options.render({ event, resolve }));

    const approveButton = screen.getByRole('button', { name: 'Approve' });
    fireEvent.click(approveButton);
    fireEvent.click(approveButton);

    expect(resolve).toHaveBeenCalledTimes(1);
    expect(resolve).toHaveBeenCalledWith({ approved: true });
  });
});
