import { AiProviderLight } from '@/components/StatusBar/AiProviderLight';
import { ProcessLight } from '@/components/StatusBar/ProcessLight';
import { Button } from '@/components/ui/button';
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
    <div className="flex items-center justify-between h-6 px-2 bg-muted border-t border-border text-xs text-muted-foreground select-none">
      <div className="flex items-center gap-2">
        {/* 终端状态指示器 */}
        <Button
          variant="ghost"
          size="sm"
          onClick={handleClick}
          title={`${isOpen ? '关闭' : '打开'}终端面板 (Ctrl+\`)`}
        >
          <span
            className={`inline-block w-2 h-2 rounded-full ${
              isTerminalRunning ? 'bg-green-500' : 'bg-muted-foreground'
            }`}
          />
          <span>{isTerminalRunning ? '终端运行中' : '终端未启动'}</span>
        </Button>
        {/* Agent 子进程状态灯 — Popover 控制菜单 (D-09/D-11) */}
        <ProcessLight name="agent" label="Agent" />
        {/* Go Server 子进程状态灯 — 常驻为后续 desktop 集成预留 (D-12) */}
        <ProcessLight name="server" label="Go" />
        {/* AI provider readiness — 独立于 Agent/Go 进程健康状态 */}
        <AiProviderLight />
      </div>
      <div className="flex items-center gap-1">
        <span className="text-muted-foreground/70">Ctrl+`</span>
      </div>
    </div>
  );
}
