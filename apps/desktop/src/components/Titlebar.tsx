import { useWindowStore } from '@/stores/window';
import { GitBranch, Maximize2, Minus, Terminal, X } from 'lucide-react';
import { ChatToggle } from './ChatToggle';
import { ThemeToggle } from './ThemeToggle';

export function Titlebar({
  onToggleChat,
  onToggleTerminal,
  onToggleDiff,
}: {
  onToggleChat: () => void;
  onToggleTerminal: () => void;
  onToggleDiff: () => void;
}) {
  const { minimize, toggleMaximize, close } = useWindowStore();

  return (
    <div
      data-tauri-drag-region
      className="flex items-center justify-between h-9 bg-gray-100 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 select-none flex-shrink-0"
      style={{ backgroundColor: 'var(--titlebar-bg, #f3f4f6)' }}
    >
      {/* Left: drag region spacer */}
      <div className="flex-1" data-tauri-drag-region />

      {/* Center: app name */}
      <div className="text-xs font-medium text-gray-500 dark:text-gray-400 select-none">
        Paladin
      </div>

      {/* Right: controls */}
      <div className="flex-1 flex items-center justify-end gap-0.5 pr-1">
        <ChatToggle onClick={onToggleChat} />
        {/* 终端按钮 */}
        <button
          type="button"
          onClick={onToggleTerminal}
          className="p-1.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors text-gray-500 dark:text-gray-400"
          aria-label="切换终端面板"
          title="终端 (Ctrl+`)"
        >
          <Terminal className="size-4" />
        </button>
        {/* Diff 按钮 */}
        <button
          type="button"
          onClick={onToggleDiff}
          className="p-1.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors text-gray-500 dark:text-gray-400"
          aria-label="切换 Diff 面板"
          title="Diff (Ctrl+Shift+D)"
        >
          <GitBranch className="size-4" />
        </button>
        <ThemeToggle />
        <button
          type="button"
          onClick={minimize}
          className="p-1.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
          aria-label="Minimize"
        >
          <Minus className="size-4" />
        </button>
        <button
          type="button"
          onClick={toggleMaximize}
          className="p-1.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
          aria-label="Maximize"
        >
          <Maximize2 className="size-4" />
        </button>
        <button
          type="button"
          onClick={close}
          className="p-1.5 rounded hover:bg-red-500 hover:text-white transition-colors"
          aria-label="Close"
        >
          <X className="size-4" />
        </button>
      </div>
    </div>
  );
}
