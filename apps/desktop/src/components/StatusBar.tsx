import { useTerminalStore } from '@/stores/terminal';
import { useCallback } from 'react';

// 底部状态栏 — 显示终端运行状态指示器
// 绿色圆点 = 终端运行中，灰色圆点 = 未运行，点击切换面板

export function StatusBar() {
  const isTerminalRunning = useTerminalStore((s) => s.isTerminalRunning);
  const isOpen = useTerminalStore((s) => s.isOpen);
  const togglePanel = useTerminalStore((s) => s.togglePanel);

  const handleClick = useCallback(() => {
    togglePanel();
  }, [togglePanel]);

  return (
    <div className="flex items-center justify-between h-6 px-2 bg-gray-200 dark:bg-gray-800 border-t border-gray-300 dark:border-gray-700 text-xs text-gray-600 dark:text-gray-400 select-none">
      <div className="flex items-center gap-2">
        {/* 终端状态指示器 */}
        <button
          type="button"
          className="flex items-center gap-1 hover:text-gray-800 dark:hover:text-gray-200 transition-colors"
          onClick={handleClick}
          title={`${isOpen ? '关闭' : '打开'}终端面板 (Ctrl+\`)`}
        >
          <span
            className={`inline-block w-2 h-2 rounded-full ${
              isTerminalRunning ? 'bg-green-500' : 'bg-gray-400'
            }`}
          />
          <span>{isTerminalRunning ? '终端运行中' : '终端未启动'}</span>
        </button>
      </div>
      <div className="flex items-center gap-1">
        <span className="text-gray-400 dark:text-gray-500">Ctrl+`</span>
      </div>
    </div>
  );
}
