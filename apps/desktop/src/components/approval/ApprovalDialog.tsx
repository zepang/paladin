/**
 * Phase 07a — ApprovalDialog: shadcn AlertDialog 注意力提醒弹窗
 *
 * D-05: 与 ApprovalCard（聊天流内嵌卡片）同时显示
 * 审批请求到达时自动弹出，展示与 ApprovalCard 匹配的信息 + 批准/拒绝按钮
 */
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useApprovalContext, type ApprovalRequest } from './ApprovalBridge';

interface ApprovalDialogProps {
  request: ApprovalRequest | null;
}

function summarize(args: Record<string, unknown>): string {
  const obj = args as Record<string, unknown>;
  if (!obj || Object.keys(obj).length === 0) return '(无参数)';
  const entries = Object.entries(obj).slice(0, 3);
  return entries.map(([k, v]) => `${k}=${JSON.stringify(v)}`).join(', ');
}

export function ApprovalDialog({ request }: ApprovalDialogProps) {
  const { approve, deny } = useApprovalContext();

  if (!request) return null;

  const open = true;

  return (
    <AlertDialog open={open}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <span className="inline-flex items-center rounded-md bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-400">
              审批请求
            </span>
            <span className="font-mono text-sm">{request.tool_name}</span>
          </AlertDialogTitle>
          <AlertDialogDescription>
            <div className="space-y-2">
              <p className="text-sm">{request.reason}</p>
              <code className="block rounded bg-muted px-3 py-1.5 text-xs text-muted-foreground break-all">
                {summarize(request.args)}
              </code>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => deny(request.request_id)}>
            拒绝
          </AlertDialogCancel>
          <AlertDialogAction onClick={() => approve(request.request_id)}>
            批准
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
