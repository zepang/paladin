import { useTerminalStore } from '@/stores/terminal';
import { useCallback } from 'react';

// Tab 栏 - 横向排列，+ 按钮新建，x 关闭，双击重命名

export function TerminalTabBar() {
  const tabs = useTerminalStore((s) => s.tabs);
  const activeTabId = useTerminalStore((s) => s.activeTabId);
  const addTab = useTerminalStore((s) => s.addTab);
  const removeTab = useTerminalStore((s) => s.removeTab);
  const setActiveTab = useTerminalStore((s) => s.setActiveTab);
  const renameTab = useTerminalStore((s) => s.renameTab);

  const handleAddTab = useCallback(() => {
    const id = `term-${Date.now()}`;
    addTab({ id, title: 'zsh', cwd: '' });
    setActiveTab(id);
  }, [addTab, setActiveTab]);

  const handleRemoveTab = useCallback(
    (id: string, e: React.MouseEvent) => {
      e.stopPropagation();
      removeTab(id);
    },
    [removeTab],
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
          // 上一个 Tab
          const prevIndex = currentIndex <= 0 ? tabs.length - 1 : currentIndex - 1;
          setActiveTab(tabs[prevIndex]?.id ?? null);
        } else {
          // 下一个 Tab
          const nextIndex = currentIndex >= tabs.length - 1 ? 0 : currentIndex + 1;
          setActiveTab(tabs[nextIndex]?.id ?? null);
        }
      }
    },
    [tabs, activeTabId, setActiveTab],
  );

  return (
    <div
      className="flex items-center bg-gray-200 dark:bg-gray-800 border-b border-gray-300 dark:border-gray-700 px-1"
      onKeyDown={handleKeyDown}
      role="tablist"
      aria-label="终端标签栏"
    >
      {tabs.map((tab) => (
        <div
          key={tab.id}
          role="tab"
          aria-selected={tab.id === activeTabId}
          className={`flex items-center gap-1 px-3 py-1 text-xs cursor-pointer border-r border-gray-300 dark:border-gray-700 select-none ${
            tab.id === activeTabId
              ? 'bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100'
              : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
          }`}
          onClick={() => setActiveTab(tab.id)}
          onDoubleClick={() => handleDoubleClick(tab.id)}
          title="双击重命名"
        >
          <span className="truncate max-w-32">{tab.title}</span>
          <button
            type="button"
            className="ml-1 w-4 h-4 flex items-center justify-center rounded hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-500 dark:text-gray-400"
            onClick={(e) => handleRemoveTab(tab.id, e)}
            aria-label={`关闭 ${tab.title} 标签`}
          >
            ×
          </button>
        </div>
      ))}
      <button
        type="button"
        className="px-2 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 text-sm font-bold"
        onClick={handleAddTab}
        aria-label="新建终端标签"
      >
        +
      </button>
    </div>
  );
}
