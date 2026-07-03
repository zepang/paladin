import { useRef, useState } from 'react';
import { useInterrupt, type InterruptEvent } from '@copilotkit/react-core/v2';
import {
  ApprovalCard,
  type ApprovalCardStatus,
  type ApprovalInterrupt,
} from './ApprovalCard';

type ApprovalInterruptValue = {
  id?: unknown;
  reason?: unknown;
  message?: unknown;
  toolCallId?: unknown;
  tool_call_id?: unknown;
  expiresAt?: unknown;
  expires_at?: unknown;
  metadata?: unknown;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined;
}

function toApprovalInterrupt(event: InterruptEvent): ApprovalInterrupt {
  const value = isRecord(event.value) ? (event.value as ApprovalInterruptValue) : {};
  const metadata = isRecord(value.metadata) ? value.metadata : {};
  const toolCallId = readString(value.toolCallId) ?? readString(value.tool_call_id);

  return {
    id: readString(value.id) ?? toolCallId ?? event.name,
    reason: readString(value.reason),
    message: readString(value.message),
    toolCallId,
    expiresAt: readString(value.expiresAt) ?? readString(value.expires_at),
    metadata,
  };
}

export function isApprovalRequired(event: Pick<InterruptEvent, 'value'>): boolean {
  return isRecord(event.value) && event.value.reason === 'tool_call';
}

export function buildApprovalResumePayload(
  decision: 'approved' | 'denied',
): Record<string, unknown> {
  if (decision === 'approved') {
    return { approved: true };
  }
  return {
    approved: false,
    reason: 'User denied this tool call.',
  };
}

function ApprovalInterruptRenderer({
  event,
  resolve,
}: {
  event: InterruptEvent;
  resolve: (response: unknown) => void;
}) {
  const [status, setStatus] = useState<ApprovalCardStatus>('pending');
  const decisionSentRef = useRef(false);
  const interrupt = toApprovalInterrupt(event);

  const approve = () => {
    if (decisionSentRef.current) return;
    decisionSentRef.current = true;
    setStatus('approved');
    resolve(buildApprovalResumePayload('approved'));
  };

  const deny = () => {
    if (decisionSentRef.current) return;
    decisionSentRef.current = true;
    setStatus('denied');
    resolve(buildApprovalResumePayload('denied'));
  };

  return (
    <ApprovalCard
      interrupt={interrupt}
      status={status}
      onApprove={approve}
      onDeny={deny}
    />
  );
}

export function AguiApprovalInterrupt() {
  useInterrupt({
    enabled: isApprovalRequired,
    renderInChat: true,
    render: ({ event, resolve }) => (
      <ApprovalInterruptRenderer event={event} resolve={resolve} />
    ),
  });

  return null;
}
