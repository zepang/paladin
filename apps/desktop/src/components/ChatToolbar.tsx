/**
 * 右侧工具栏
 * 显示对话上下文信息（模型、线程ID、消息数、工具调用列表）
 * 提供快捷操作（清空对话、切换模型占位）
 */
import { Button } from '@/components/ui/button';
import { useChatStore } from '@/stores/chat';
import { useAgent } from '@copilotkit/react-core/v2';
import type { Message } from '@copilotkit/react-core/v2';
import { Eraser, Info, ShieldAlert, Wrench } from 'lucide-react';
import { useMemo } from 'react';
import { toast } from 'sonner';
import { useApprovalContext } from '@/components/approval/ApprovalBridge';

/** 工具调用信息 */
interface ToolCallInfo {
  id: string;
  name: string;
}

/**
 * 从消息列表中提取工具调用
 */
function extractToolCalls(messages: Message[]): ToolCallInfo[] {
  const calls: ToolCallInfo[] = [];
  for (const msg of messages) {
    if (msg.role === 'assistant' && 'toolCalls' in msg && msg.toolCalls) {
      for (const tc of msg.toolCalls) {
        calls.push({ id: tc.id, name: tc.function.name });
      }
    }
  }
  return calls;
}

export function ChatToolbar() {
  const { agent } = useAgent();
  const currentThreadId = useChatStore((s) => s.currentThreadId);
  const createConversation = useChatStore((s) => s.createConversation);
  const { current, pendingApprovals } = useApprovalContext();

  // 提取工具调用列表
  const toolCalls = useMemo(() => extractToolCalls(agent.messages), [agent.messages]);
  const messageCount = agent.messages.length;

  // 清空对话 — 创建新对话
  const handleClear = () => {
    createConversation();
    toast.success('已创建新对话');
  };

  const hasPending = pendingApprovals.length > 0;

  return (
    <aside className="w-56 border-l border-border/50 flex-shrink-0 bg-background/50 flex flex-col overflow-hidden">
      {/* 审批状态 (D-09) */}
      {hasPending && current && (
        <div className="p-3 border-b border-border bg-yellow-500/5">
          <div className="flex items-center gap-1.5 text-xs font-medium text-yellow-600 mb-1.5">
            <ShieldAlert className="size-3.5" />
            <span>等待审批中…</span>
          </div>
          <p className="text-xs font-mono text-foreground truncate">{current.tool_name}</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            第 {pendingApprovals.length > 0 ? '1' : '0'}/{pendingApprovals.length} 个
          </p>
        </div>
      )}

      {/* 上下文信息 */}
      <div className="p-3 border-b border-border">
        <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground mb-2">
          <Info className="size-3.5" />
          <span>上下文</span>
        </div>
        <dl className="space-y-1 text-xs">
          <div className="flex justify-between">
            <dt className="text-muted-foreground">模型</dt>
            <dd className="text-foreground font-mono">deepseek-chat</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted-foreground">消息数</dt>
            <dd className="text-foreground">{messageCount}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted-foreground">线程</dt>
            <dd
              className="text-foreground font-mono truncate max-w-[100px]"
              title={currentThreadId ?? '-'}
            >
              {currentThreadId ? `${currentThreadId.slice(0, 8)}...` : '-'}
            </dd>
          </div>
        </dl>
      </div>

      {/* 工具调用列表 */}
      <div className="p-3 border-b border-border flex-1 overflow-auto">
        <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground mb-2">
          <Wrench className="size-3.5" />
          <span>工具调用</span>
        </div>
        {toolCalls.length === 0 ? (
          <p className="text-xs text-muted-foreground/60">暂无工具调用</p>
        ) : (
          <ul className="space-y-1">
            {toolCalls.map((tc) => (
              <li
                key={tc.id}
                className="text-xs font-mono text-foreground bg-muted px-2 py-1 rounded truncate"
              >
                {tc.name}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* 快捷操作 */}
      <div className="p-3 border-t border-border">
        <Button
          variant="ghost"
          size="sm"
          onClick={handleClear}
          className="w-full justify-start text-xs"
        >
          <Eraser className="size-3.5 mr-1.5" />
          清空对话
        </Button>
      </div>
    </aside>
  );
}
