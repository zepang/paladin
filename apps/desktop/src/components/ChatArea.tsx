/**
 * 对话区域容器
 * 用 CopilotKit v2 CopilotChat + 内嵌审批卡片
 * ApprovalCard 使用 sticky 定位固定在消息区域底部，随消息流自然呈现
 * ChatToolbar 嵌入内部右侧，与对话区域视觉一体化
 */
import { ChatToolbar } from '@/components/ChatToolbar';
import { useChatStore } from '@/stores/chat';
import { useTerminalStore } from '@/stores/terminal';
import { CopilotChat } from '@copilotkit/react-core/v2';

export function ChatArea() {
  const currentThreadId = useChatStore((s) => s.currentThreadId);
  const conversations = useChatStore((s) => s.conversations);
  const rightPanelOpen = useTerminalStore((s) => s.isOpen);

  // 查找当前对话，获取 CopilotKit threadId
  const currentConversation = conversations.find((c) => c.id === currentThreadId);

  // 无选中对话 → 简单欢迎提示
  if (!currentThreadId || !currentConversation) {
    return (
      <div className="flex-1 flex min-w-0">
        <div className="flex-1 flex flex-col items-center justify-center gap-4 p-8">
          <h1 className="text-2xl font-bold text-foreground">Paladin</h1>
          <p className="text-muted-foreground text-center max-w-md">
            AI 编程伙伴。从左侧选择对话或创建新对话开始。
          </p>
        </div>
        {!rightPanelOpen && <ChatToolbar />}
      </div>
    );
  }

  return (
    <div className="flex-1 flex min-w-0">
      <CopilotChat
        className="flex-1 min-w-0"
        threadId={currentConversation.threadId}
        labels={{
          welcomeMessageText: 'Paladin — AI 编程伙伴',
          chatInputPlaceholder: '输入消息...',
        }}
      />
      {!rightPanelOpen && <ChatToolbar />}
    </div>
  );
}
