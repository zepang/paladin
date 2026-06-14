import type { ChatMessage } from '@/stores/chat';

interface MessageBubbleProps {
  message: ChatMessage;
}

/** 用户头像 SVG */
function UserAvatar() {
  return (
    <div className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
      U
    </div>
  );
}

/** AI 头像 SVG */
function AIAvatar() {
  return (
    <div className="w-8 h-8 rounded-full bg-purple-500 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
      AI
    </div>
  );
}

/**
 * 消息气泡组件
 * 根据 role 显示不同的对齐方向和样式
 * - user: 右对齐，蓝色背景
 * - assistant: 左对齐，灰色背景
 */
export function MessageBubble({ message }: MessageBubbleProps) {
  const isUser = message.role === 'user';

  return (
    <div
      className={`flex gap-3 px-4 py-3 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}
    >
      {/* 头像 */}
      {isUser ? <UserAvatar /> : <AIAvatar />}

      {/* 消息内容 */}
      <div
        className={`max-w-[75%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap break-words ${
          isUser
            ? 'bg-blue-600 text-white rounded-tr-md'
            : 'bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-tl-md'
        }`}
      >
        {message.content}
      </div>
    </div>
  );
}
