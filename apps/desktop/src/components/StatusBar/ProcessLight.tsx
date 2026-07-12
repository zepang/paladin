import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import type { ProcessHealth, ProcessName, ProcessOwner, ProcessState } from '@/stores/process';
import { useProcessStatus } from '@/stores/process';
import { useTerminalStore } from '@/stores/terminal';
import { invoke } from '@tauri-apps/api/core';

const DOT_CLASS: Record<ProcessState, string> = {
  starting: 'bg-primary',
  running: 'bg-emerald-500',
  degraded: 'bg-amber-500',
  unhealthy: 'bg-orange-500',
  stopped: 'bg-destructive',
  conflict: 'bg-destructive',
};

const TEXT: Record<ProcessState, string> = {
  starting: '启动中',
  running: '运行中',
  degraded: '降级',
  unhealthy: '异常',
  stopped: '已停止',
  conflict: '冲突',
};

const OWNER_TEXT: Record<ProcessOwner, string> = {
  supervisor: '托管',
  external: '外部',
  none: '未接管',
};

const HEALTH_TEXT: Record<ProcessHealth, string> = {
  healthy: '健康',
  degraded: '降级',
  failed: '失败',
  unknown: '未知',
};

export function ProcessLight({ name, label }: { name: ProcessName; label: string }) {
  const status = useProcessStatus(name);
  const text = TEXT[status.state];
  const ownerText = OWNER_TEXT[status.owner];
  const isExternal = status.owner === 'external';
  const isGoDegraded = name === 'server' && (status.state === 'degraded' || status.health === 'degraded');
  const displayText =
    status.state === 'conflict'
      ? `${label} · 冲突`
      : `${label} · ${ownerText} · ${text}`;
  const openLogsPanel = () => {
    const terminalStore = useTerminalStore.getState();
    terminalStore.setActivePanel('logs');
    terminalStore.openPanel();
  };

  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button variant="ghost" size="sm" title={displayText}>
            <span className={`inline-block w-2 h-2 rounded-full ${DOT_CLASS[status.state]}`} />
            <span className="text-xs">{displayText}</span>
          </Button>
        }
      />
      <PopoverContent side="top" align="start" sideOffset={10}>
        <div className="flex flex-col gap-2">
          <div className="font-medium text-sm">{label} 进程</div>
          <div className="text-xs text-muted-foreground">
            状态: {text} · 所有权: {ownerText} · 健康: {HEALTH_TEXT[status.health]}
          </div>
          {isExternal && (
            <div className="text-xs text-muted-foreground">
              外部服务由你手动管理，Paladin 不会停止或重启它。
            </div>
          )}
          {isGoDegraded && (
            <div className="text-xs text-muted-foreground">
              Go 服务已启动，但依赖未完全就绪；Agent 仍可继续使用。
            </div>
          )}
          {status.last_error && (
            <div className="text-xs text-destructive">退出原因: {status.last_error}</div>
          )}
          {status.stderr_tail && (
            <pre className="text-[10px] bg-muted p-2 rounded max-h-32 overflow-auto whitespace-pre-wrap">
              {status.stderr_tail}
            </pre>
          )}
          <div className="flex gap-2">
            <Button size="sm" disabled={isExternal} onClick={() => invoke(`restart_${name}`)}>
              重启
            </Button>
            <Button size="sm" variant="outline" disabled={isExternal} onClick={() => invoke(`stop_${name}`)}>
              停止
            </Button>
            <Button size="sm" variant="outline" onClick={() => invoke(`redetect_${name}`)}>
              重新检测
            </Button>
            <Button
              size="sm"
              variant="ghost"
              title={isExternal ? '查看 Paladin 已捕获的日志' : '查看日志'}
              onClick={openLogsPanel}
            >
              查看日志
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
