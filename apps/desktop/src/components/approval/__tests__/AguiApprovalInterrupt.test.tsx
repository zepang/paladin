import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApprovalCard, type ApprovalInterrupt } from '../ApprovalCard';

const interrupt: ApprovalInterrupt = {
  id: 'interrupt-1',
  reason: 'Needs permission before editing files.',
  message: 'Approve this tool call?',
  toolCallId: 'tool-call-1',
  metadata: {
    toolName: 'edit_file',
    args: {
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
