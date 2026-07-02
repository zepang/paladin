export type ApprovalCardStatus = 'pending' | 'approved' | 'denied' | 'expired' | 'error';

export interface ApprovalInterrupt {
  id: string;
  reason?: string;
  message?: string;
  toolCallId?: string;
  expiresAt?: string;
  metadata?: Record<string, unknown>;
}

interface ApprovalCardProps {
  interrupt: ApprovalInterrupt;
  status: ApprovalCardStatus;
  onApprove: (interrupt: ApprovalInterrupt) => void;
  onDeny: (interrupt: ApprovalInterrupt) => void;
}

const STATUS_LABELS: Record<ApprovalCardStatus, string> = {
  pending: 'Waiting for approval',
  approved: 'Approved',
  denied: 'Denied',
  expired: 'Expired',
  error: 'Approval error',
};

function stringify(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'string') return value;

  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function truncate(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength)}...`;
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined;
}

function getToolName(interrupt: ApprovalInterrupt): string {
  const metadata = interrupt.metadata ?? {};
  return (
    readString(metadata.toolName) ??
    readString(metadata.tool_name) ??
    readString(metadata.name) ??
    interrupt.toolCallId ??
    'Tool call'
  );
}

function getArgsSummary(interrupt: ApprovalInterrupt): string {
  const metadata = interrupt.metadata ?? {};
  const args = metadata.args ?? metadata.arguments ?? metadata.parameters;
  return truncate(stringify(args), 200);
}

export function ApprovalCard({ interrupt, status, onApprove, onDeny }: ApprovalCardProps) {
  const isPending = status === 'pending';
  const argsSummary = getArgsSummary(interrupt);
  const toolName = getToolName(interrupt);

  return (
    <div className="approval-card my-2 w-full rounded-lg border border-border bg-card p-4 shadow-sm">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center rounded-md bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-400">
          {STATUS_LABELS[status]}
        </span>
        <span className="font-mono text-sm font-semibold text-foreground">{toolName}</span>
      </div>

      {argsSummary && (
        <div className="mb-2 rounded bg-muted px-3 py-1.5">
          <code className="break-all text-xs text-muted-foreground">{argsSummary}</code>
        </div>
      )}

      {interrupt.message && (
        <p className="mb-1 text-sm text-foreground">{interrupt.message}</p>
      )}
      {interrupt.reason && (
        <p className="mb-3 text-xs text-muted-foreground">{interrupt.reason}</p>
      )}

      <div className="flex gap-2">
        <button
          type="button"
          disabled={!isPending}
          onClick={() => onDeny(interrupt)}
          className="inline-flex h-8 items-center rounded-md border border-destructive/30 bg-destructive/10 px-3 text-xs font-medium text-destructive transition-colors hover:bg-destructive/20 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Deny
        </button>
        <button
          type="button"
          disabled={!isPending}
          onClick={() => onApprove(interrupt)}
          className="inline-flex h-8 items-center rounded-md bg-emerald-600 px-3 text-xs font-medium text-white transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Approve
        </button>
      </div>
    </div>
  );
}
