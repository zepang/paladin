/**
 * 对话区域容器
 * 用 CopilotKit v2 CopilotChat 替换手写消息组件
 * 自带居中窄列布局、输入框、欢迎屏、虚拟滚动
 * 顶部集成 AgentStatusBar 显示运行状态
 */
import { AgentStatusBar } from '@/components/AgentStatusBar';
import { useChatStore } from '@/stores/chat';
import { CopilotChat } from '@copilotkit/react-core/v2';

export function ChatArea() {
  const currentThreadId = useChatStore((s) => s.currentThreadId);
  const conversations = useChatStore((s) => s.conversations);

  // 查找当前对话，获取 CopilotKit threadId
  const currentConversation = conversations.find((c) => c.id === currentThreadId);

  // 无选中对话 → 简单欢迎提示
  if (!currentThreadId || !currentConversation) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-4 p-8">
        <h1 className="text-2xl font-bold text-foreground">Paladin</h1>
        <p className="text-muted-foreground text-center max-w-md">
          AI 编程伙伴。从左侧选择对话或创建新对话开始。
        </p>
      </div>
    );
  }

  // 对话区域 = 状态条 + CopilotChat
  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <AgentStatusBar />
      <CopilotChat
        className="flex-1"
        threadId={currentConversation.threadId}
        labels={{
          welcomeMessageText: 'Paladin — AI 编程伙伴',
          chatInputPlaceholder: '输入消息...',
        }}
      />
    </div>
  );
}
