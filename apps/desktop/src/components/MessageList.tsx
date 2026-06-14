import type { ChatMessage } from '@/stores/chat';
import { MessageBubble } from './MessageBubble';
import { Virtuoso } from 'react-virtuoso';
import { useCallback, useRef } from 'react';

interface MessageListProps {
  /** 消息列表 */
  messages: ChatMessage[];
  /** 输入框区域（由父组件渲染在最底部） */
  footer?: React.ReactNode;
}

/**
 * 消息列表组件 — Virtuoso 虚拟滚动
 * 高效渲染大量消息，新消息自动滚动到底部
 * followOutput="smooth" 提供平滑的自动跟随体验
 */
export function MessageList({ messages, footer }: MessageListProps) {
  const virtuosoRef = useRef<HTMLDivElement>(null);

  // Virtuoso item renderer
  const renderItem = useCallback(
    (_index: number, message: ChatMessage) => (
      <MessageBubble key={message.id} message={message} />
    ),
    [],
  );

  // 空列表占位
  if (messages.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-gray-400 dark:text-gray-500 text-sm">
        发送消息开始对话
      </div>
    );
  }

  return (
    <div ref={virtuosoRef} className="flex-1 overflow-hidden">
      <Virtuoso
        style={{ height: '100%' }}
        data={messages}
        itemContent={renderItem}
        followOutput="smooth"
        // 初始滚动到底部
        initialTopMostItemIndex={messages.length - 1}
      />
      {footer}
    </div>
  );
}
