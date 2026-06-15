import { useWindowStore } from '@/stores/window';
import { ChatToggle } from './ChatToggle';
import { ThemeToggle } from './ThemeToggle';

function MinimizeIcon() {
  return (
    <svg
      className="w-4 h-4"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <title>Minimize</title>
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
    </svg>
  );
}

function MaximizeIcon() {
  return (
    <svg
      className="w-4 h-4"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <title>Maximize</title>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M8 3H5a2 2 0 00-2 2v3m18 0V5a2 2 0 00-2-2h-3m0 18h3a2 2 0 002-2v-3M3 16v3a2 2 0 002 2h3"
      />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg
      className="w-4 h-4"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <title>Close</title>
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}

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
        <ThemeToggle />
        {/* 终端按钮 */}
        <button
          type="button"
          onClick={onToggleTerminal}
          className="p-1.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors text-gray-500 dark:text-gray-400"
          aria-label="切换终端面板"
          title="终端 (Ctrl+`)"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <title>终端</title>
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
        </button>
        {/* Diff 按钮 */}
        <button
          type="button"
          onClick={onToggleDiff}
          className="p-1.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors text-gray-500 dark:text-gray-400"
          aria-label="切换 Diff 面板"
          title="Diff (Ctrl+Shift+D)"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <title>Diff</title>
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h7" />
          </svg>
        </button>
        <button
          type="button"
          onClick={minimize}
          className="p-1.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
          aria-label="Minimize"
        >
          <MinimizeIcon />
        </button>
        <button
          type="button"
          onClick={toggleMaximize}
          className="p-1.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
          aria-label="Maximize"
        >
          <MaximizeIcon />
        </button>
        <button
          type="button"
          onClick={close}
          className="p-1.5 rounded hover:bg-red-500 hover:text-white transition-colors"
          aria-label="Close"
        >
          <CloseIcon />
        </button>
      </div>
    </div>
  );
}
