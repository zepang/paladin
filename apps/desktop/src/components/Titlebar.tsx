import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow';
import { Button } from '@/components/ui/button';
import { useWindowStore } from '@/stores/window';
import { GitBranch, Maximize2, Minus, Terminal, X } from 'lucide-react';
import { ChatToggle } from './ChatToggle';
import { ThemeToggle } from './ThemeToggle';

/** 手动触发窗口拖拽 — 仅左键触发，不阻止默认行为以便 Tauri 原生 drag-region 处理 */
function handleDragRegionMouseDown(e: React.MouseEvent) {
  // if (e.buttons !== 1) return;
  // getCurrentWebviewWindow().startDragging();
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
      className="flex items-center justify-between h-9 bg-muted border-b border-border select-none flex-shrink-0"
      style={{ backgroundColor: 'var(--titlebar-bg, #f3f4f6)' }}
      onMouseDown={handleDragRegionMouseDown}
    >
      {/* Left: drag region spacer — select-none 防止文字选择，cursor-default 保持箭头光标 */}
      <div className="h-full flex-1 flex flex-col justify-center select-none cursor-default" data-tauri-drag-region > 
        <div
          className="text-xs font-medium text-muted-foreground select-none cursor-default px-2"
          data-tauri-drag-region
        >
          Paladin
        </div>  
      </div>

      {/* Right: controls — NO drag region, 避免拦截 Button 点击事件 */}
      <div className="flex items-center justify-end gap-0.5 pr-1">
        <ChatToggle onClick={onToggleChat} />
        <Button
          variant="ghost"
          size="icon"
          onClick={onToggleTerminal}
          aria-label="切换终端面板"
          title="终端 (Ctrl+`)"
        >
          <Terminal className="size-4 text-muted-foreground" />
        </Button>
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
