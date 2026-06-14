/**
 * 聊天面板开关按钮
 * 放在 Titlebar 右侧，与 ThemeToggle 同排
 * 点击切换 CopilotSidebar 的打开/关闭状态
 */
function ChatIcon() {
  return (
    <svg
      className="w-4 h-4"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <title>Toggle Chat</title>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"
      />
    </svg>
  );
}

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
      <ChatIcon />
    </button>
  );
}
