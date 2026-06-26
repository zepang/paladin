import { Button } from '@/components/ui/button';
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
      className="flex items-center justify-between h-9 bg-muted border-b border-border select-none flex-shrink-0"
      style={{ backgroundColor: 'var(--titlebar-bg, #f3f4f6)' }}
    >
      {/* Left: drag region spacer */}
      <div className="flex-1" data-tauri-drag-region />

      {/* Center: app name — also drag region */}
      <div className="text-xs font-medium text-muted-foreground select-none" data-tauri-drag-region>
        Paladin
      </div>

      {/* Right: controls — NO drag region, 避免拦截 Button 点击事件 */}
      <div className="flex-1 flex items-center justify-end gap-0.5 pr-1">
        <ChatToggle onClick={onToggleChat} />
        {/* 终端按钮 */}
        <Button
          variant="ghost"
          size="icon"
          onClick={onToggleTerminal}
          aria-label="切换终端面板"
          title="终端 (Ctrl+`)"
        >
          <Terminal className="size-4 text-muted-foreground" />
        </Button>
        {/* Diff 按钮 */}
        <Button
          variant="ghost"
          size="icon"
          onClick={onToggleDiff}
          aria-label="切换 Diff 面板"
          title="Diff (Ctrl+Shift+D)"
        >
          <GitBranch className="size-4 text-muted-foreground" />
        </Button>
        <ThemeToggle />
        <Button variant="ghost" size="icon" onClick={minimize} aria-label="Minimize">
          <Minus className="size-4" />
        </Button>
        <Button variant="ghost" size="icon" onClick={toggleMaximize} aria-label="Maximize">
          <Maximize2 className="size-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={close}
          aria-label="Close"
          className="hover:bg-red-500 hover:text-white"
        >
          <X className="size-4" />
        </Button>
      </div>
    </div>
  );
}
