import { useAgent } from '@copilotkit/react-core/v2';
import { useChatStore } from '@/stores/chat';
import { useMemo } from 'react';
import { MessageList } from './MessageList';
import { WelcomePage } from './WelcomePage';

/**
 * 聊天视图容器
 * 根据当前对话状态切换 WelcomePage / MessageList
 * Phase 4: 接入 CopilotKit useAgent hook 获取真实消息流
 */
export function ChatView() {
  const currentThreadId = useChatStore((s) => s.currentThreadId);
  const conversations = useChatStore((s) => s.conversations);
  
  // 接入 CopilotKit Agent，获取实时消息列表和运行状态
  const { agent } = useAgent();

  // 当前选中的对话
  const currentConversation = useMemo(
    () => conversations.find((c) => c.id === currentThreadId),
    [conversations, currentThreadId]
  );

  // 无选中对话 → 欢迎页
  if (!currentThreadId || !currentConversation) {
    return <WelcomePage />;
  }

  // 使用 CopilotKit agent.messages 替代 Phase 2 空数组
  return (
    <div className="flex-1 flex flex-col">
      {/* 对话标题栏 */}
      <div className="flex items-center h-10 px-4 border-b border-border">
        <h2 className="text-sm font-medium text-foreground truncate">
          {currentConversation.title}
        </h2>
        {/* Agent 运行状态指示 */}
        {agent.isRunning && (
          <span className="ml-2 w-2 h-2 rounded-full bg-green-500 animate-pulse" 
            title="Agent 正在处理" 
          />
        )}
      </div>
      {/* 消息区域 — 接入 CopilotKit 实时消息流 */}
      <MessageList messages={agent.messages} />
    </div>
  );
}
