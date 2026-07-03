import { useEffect, useMemo, useRef, useState } from 'react';
import type { AgentSubscriber, Interrupt, ResumeEntry } from '@ag-ui/client';
import { useAgent, useCopilotKit } from '@copilotkit/react-core/v2';
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

type InterruptEvent = {
  name: string;
  value: unknown;
};

type RunFinishedParams = Parameters<NonNullable<AgentSubscriber['onRunFinishedEvent']>>[0];

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
  interrupt,
  onResolve,
}: {
  interrupt: ApprovalInterrupt;
  onResolve: (decision: 'approved' | 'denied') => void;
}) {
  const [status, setStatus] = useState<ApprovalCardStatus>('pending');
  const decisionSentRef = useRef(false);

  useEffect(() => {
    setStatus('pending');
    decisionSentRef.current = false;
  }, [interrupt.id]);

  const approve = () => {
    if (decisionSentRef.current) return;
    decisionSentRef.current = true;
    setStatus('approved');
    onResolve('approved');
  };

  const deny = () => {
    if (decisionSentRef.current) return;
    decisionSentRef.current = true;
    setStatus('denied');
    onResolve('denied');
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

function toInterruptEvent(interrupt: Interrupt): InterruptEvent {
  return {
    name: 'agui_interrupt',
    value: interrupt,
  };
}

export function AguiApprovalInterrupt() {
  const { agent } = useAgent();
  const { copilotkit } = useCopilotKit();
  const [pendingInterrupt, setPendingInterrupt] = useState<ApprovalInterrupt | null>(null);

  useEffect(() => {
    const subscription = agent.subscribe({
      onRunStartedEvent: () => {
        setPendingInterrupt(null);
      },
      onRunFailed: () => {
        setPendingInterrupt(null);
      },
      onRunFinishedEvent: (params: RunFinishedParams) => {
        if (params.outcome !== 'interrupt') {
          setPendingInterrupt(null);
          return;
        }

        const approvalInterrupt = params.interrupts
          .map((interrupt) => toInterruptEvent(interrupt))
          .find(isApprovalRequired);

        setPendingInterrupt(
          approvalInterrupt ? toApprovalInterrupt(approvalInterrupt) : null,
        );
      },
    });

    return () => subscription.unsubscribe();
  }, [agent]);

  const element = useMemo(() => {
    if (!pendingInterrupt) return null;

    const resolve = (decision: 'approved' | 'denied') => {
      const resume: ResumeEntry[] = [
        {
          interruptId: pendingInterrupt.id,
          status: 'resolved',
          payload: buildApprovalResumePayload(decision),
        },
      ];

      void agent.runAgent({ resume });
    };

    return (
      <ApprovalInterruptRenderer
        interrupt={pendingInterrupt}
        onResolve={resolve}
      />
    );
  }, [agent, pendingInterrupt]);

  useEffect(() => {
    copilotkit.setInterruptElement(element);
  }, [copilotkit, element]);

  useEffect(() => {
    return () => {
      copilotkit.setInterruptElement(null);
    };
  }, [copilotkit]);

  return null;
}
