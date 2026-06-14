import { useChatStore } from '@/stores/chat';
import { WelcomePage } from './WelcomePage';
import { MessageList } from './MessageList';
import { useMemo } from 'react';

/**
 * 聊天视图容器
 * 根据当前对话状态切换 WelcomePage / MessageList
 * Phase 2: 消息列表为空占位，Phase 4 接入实际消息
 */
export function ChatView() {
  const currentThreadId = useChatStore((s) => s.currentThreadId);
  const conversations = useChatStore((s) => s.conversations);

  // 当前选中的对话
  const currentConversation = useMemo(
    () => conversations.find((c) => c.id === currentThreadId),
    [conversations, currentThreadId],
  );

  // 无选中对话 → 欢迎页
  if (!currentThreadId || !currentConversation) {
    return <WelcomePage />;
  }

  // Phase 2 占位消息列表（Phase 4 接入实际消息）
  return (
    <div className="flex-1 flex flex-col">
      {/* 对话标题栏 */}
      <div className="flex items-center h-10 px-4 border-b border-gray-200 dark:border-gray-700">
        <h2 className="text-sm font-medium text-gray-700 dark:text-gray-300 truncate">
          {currentConversation.title}
        </h2>
      </div>
      {/* 消息区域 */}
      <MessageList messages={[]} />
    </div>
  );
}
