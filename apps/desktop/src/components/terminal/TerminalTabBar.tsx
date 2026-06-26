import { useTerminalStore } from '@/stores/terminal';
import { useCallback } from 'react';

export function TerminalTabBar({ onCloseTab }: { onCloseTab: (id: string) => void }) {
  const tabs = useTerminalStore((s) => s.tabs);
  const activeTabId = useTerminalStore((s) => s.activeTabId);
  const addTab = useTerminalStore((s) => s.addTab);
  const setActiveTab = useTerminalStore((s) => s.setActiveTab);
  const renameTab = useTerminalStore((s) => s.renameTab);

  const handleAddTab = useCallback(() => {
    const id = `term-${Date.now()}`;
    addTab({ id, title: 'zsh', cwd: '' });
  }, [addTab]);

  const handleRemoveTab = useCallback(
    (id: string, e: React.MouseEvent) => {
      e.stopPropagation();
      onCloseTab(id);
    },
    [onCloseTab],
  );

  const handleDoubleClick = useCallback(
    (id: string) => {
      const newName = prompt('Tab 名称:', tabs.find((t) => t.id === id)?.title);
      if (newName) {
        renameTab(id, newName);
      }
    },
    [tabs, renameTab],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.ctrlKey && e.key === 'Tab') {
        e.preventDefault();
        const currentIndex = tabs.findIndex((t) => t.id === activeTabId);
        if (e.shiftKey) {
          const prevIndex = currentIndex <= 0 ? tabs.length - 1 : currentIndex - 1;
          setActiveTab(tabs[prevIndex]?.id ?? null);
        } else {
          const nextIndex = currentIndex >= tabs.length - 1 ? 0 : currentIndex + 1;
          setActiveTab(tabs[nextIndex]?.id ?? null);
        }
      }
    },
    [tabs, activeTabId, setActiveTab],
  );

  return (
    <div
      className="flex items-center bg-muted border-b border-border px-1"
      onKeyDown={handleKeyDown}
      tabIndex={0}
      role="tablist"
      aria-label="终端标签栏"
    >
      {tabs.map((tab) => (
        <div
          key={tab.id}
          role="tab"
          aria-selected={tab.id === activeTabId}
          className={`flex items-center gap-1 px-3 py-1 text-xs cursor-pointer border-r border-border select-none ${
            tab.id === activeTabId
              ? 'bg-background text-foreground'
              : 'text-muted-foreground hover:bg-muted'
          }`}
          onClick={() => setActiveTab(tab.id)}
          onDoubleClick={() => handleDoubleClick(tab.id)}
          title="双击重命名"
        >
          <span className="truncate max-w-32">{tab.title}</span>
          {tab.cwd && (
            <span className="truncate max-w-32 text-muted-foreground/70">{tab.cwd}</span>
          )}
          <button
            type="button"
            className="ml-1 w-4 h-4 flex items-center justify-center rounded hover:bg-muted-foreground/30 text-muted-foreground"
            onClick={(e) => handleRemoveTab(tab.id, e)}
            aria-label={`关闭 ${tab.title} 标签`}
          >
            ×
          </button>
        </div>
      ))}
      <button
        type="button"
        className="px-2 text-muted-foreground hover:text-foreground text-sm font-bold"
        onClick={handleAddTab}
        aria-label="新建终端标签"
      >
        +
      </button>
    </div>
  );
}
