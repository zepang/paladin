/**
 * 聊天面板开关按钮
 * 放在 Titlebar 右侧，与 ThemeToggle 同排
 * 点击切换 CopilotSidebar 的打开/关闭状态
 */
import { MessageSquare } from 'lucide-react';

interface ChatToggleProps {
  onClick: () => void;
}

export function ChatToggle({ onClick }: ChatToggleProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="p-1.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
      aria-label="Toggle Chat"
    >
      <MessageSquare className="size-4" />
    </button>
  );
}
