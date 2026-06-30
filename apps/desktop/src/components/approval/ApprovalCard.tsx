/**
 * Phase 07a — ApprovalCard: CopilotChat 消息流内嵌审批卡片
 *
 * D-07 修订: normal flow 内联渲染（无 fixed/absolute 定位）
 * D-06: 展示完整上下文——工具名 + 参数摘要 + Agent 调用原因
 * D-08: 队列提示——底部「还有 N 个待审批操作」
 */
import { useApprovalContext, type ApprovalRequest } from './ApprovalBridge';

interface ApprovalCardProps {
  request: ApprovalRequest;
  onApprove: (requestId: string) => void;
  onDeny: (requestId: string) => void;
}

/** 截断字符串到 maxLen，超长加 ... */
function truncate(s: string, maxLen: number): string {
  if (s.length <= maxLen) return s;
  return s.slice(0, maxLen) + '…';
}

export function ApprovalCard({ request, onApprove, onDeny }: ApprovalCardProps) {
  const { pendingApprovals } = useApprovalContext();
  const queueLength = pendingApprovals.length;

  const argsSummary = truncate(JSON.stringify(request.args), 200);

  return (
    <div className="approval-card my-2 w-full rounded-lg border border-border bg-card p-4 shadow-sm">
      {/* 头部: 工具名 + 状态 */}
      <div className="mb-2 flex items-center gap-2">
        <span className="inline-flex items-center rounded-md bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-400">
          等待审批
        </span>
        <span className="text-sm font-mono font-semibold text-foreground">
          {request.tool_name}
        </span>
      </div>

      {/* 参数摘要 (D-06) */}
      {argsSummary && (
        <div className="mb-2 rounded bg-muted px-3 py-1.5">
          <code className="text-xs text-muted-foreground break-all">{argsSummary}</code>
        </div>
      )}

      {/* 调用原因 (D-06) */}
      {request.reason && (
        <p className="mb-3 text-xs text-muted-foreground">{request.reason}</p>
      )}

      {/* 按钮组 */}
      <div className="flex gap-2">
        <button
          onClick={() => onDeny(request.request_id)}
          className="inline-flex h-8 items-center rounded-md border border-destructive/30 bg-destructive/10 px-3 text-xs font-medium text-destructive hover:bg-destructive/20 transition-colors"
        >
          拒绝
        </button>
        <button
          onClick={() => onApprove(request.request_id)}
          className="inline-flex h-8 items-center rounded-md bg-emerald-600 px-3 text-xs font-medium text-white hover:bg-emerald-700 transition-colors"
        >
          批准
        </button>
      </div>

      {/* 队列提示 (D-08) */}
      {queueLength > 1 && (
        <p className="mt-2 text-xs text-muted-foreground/60">
          还有 {queueLength - 1} 个待审批操作
        </p>
      )}
    </div>
  );
}
