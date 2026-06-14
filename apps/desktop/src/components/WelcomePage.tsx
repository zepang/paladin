import { useChatStore } from '@/stores/chat';
import { useMemo } from 'react';

/**
 * 聊天欢迎页
 * 未选择对话时显示，提供快捷入口和新对话创建按钮
 * 根据当前时间显示不同问候语
 */
export function WelcomePage() {
  const conversations = useChatStore((s) => s.conversations);
  const currentThreadId = useChatStore((s) => s.currentThreadId);
  const createConversation = useChatStore((s) => s.createConversation);

  // 只有无对话或无当前对话时显示
  const showWelcome = useMemo(
    () => conversations.length === 0 || !currentThreadId,
    [conversations.length, currentThreadId],
  );

  if (!showWelcome) return null;

  // 根据当前时间生成问候语
  const hour = new Date().getHours();
  const greeting =
    hour < 6 ? '夜深了，早点休息' : hour < 12 ? '早上好' : hour < 18 ? '下午好' : '晚上好';

  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-6 p-8">
      {/* 问候语 */}
      <h1 className="text-3xl font-bold text-gray-800 dark:text-gray-100">
        {greeting}，今天需要什么帮助？
      </h1>

      {/* 描述 */}
      <p className="text-gray-500 dark:text-gray-400 text-center max-w-md">
        Paladin 是你的 AI 编程伙伴。选择左侧对话或创建新对话开始。
      </p>

      {/* 创建新对话按钮 */}
      <button
        type="button"
        onClick={createConversation}
        className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-medium transition-colors shadow-lg shadow-blue-500/20"
      >
        开始新对话
      </button>
    </div>
  );
}
