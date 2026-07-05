import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import type { ProcessName, ProcessState } from '@/stores/process';
import { useProcessStatus } from '@/stores/process';
import { useTerminalStore } from '@/stores/terminal';
import { invoke } from '@tauri-apps/api/core';

const DOT_CLASS: Record<ProcessState, string> = {
  starting: 'bg-primary',
  running: 'bg-emerald-500',
  degraded: 'bg-amber-500',
  unhealthy: 'bg-orange-500',
  stopped: 'bg-destructive',
};

const TEXT: Record<ProcessState, string> = {
  starting: '启动中',
  running: '运行中',
  degraded: '降级',
  unhealthy: '异常',
  stopped: '已停止',
};

export function ProcessLight({ name, label }: { name: ProcessName; label: string }) {
  const status = useProcessStatus(name);
  const text = TEXT[status.state];

  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button variant="ghost" size="sm" title={`${label}: ${text}`}>
            <span
              className={`inline-block w-2 h-2 rounded-full ${DOT_CLASS[status.state]}`}
            />
            <span className="text-xs">
              {label}
              {status.state === 'running' ? '' : `·${text}`}
            </span>
          </Button>
        }
      />
      <PopoverContent>
        <div className="flex flex-col gap-2">
          <div className="font-medium text-sm">{label} 进程</div>
          <div className="text-xs text-muted-foreground">状态: {text}</div>
          {status.last_error && (
            <div className="text-xs text-destructive">退出原因: {status.last_error}</div>
          )}
          {status.stderr_tail && (
            <pre className="text-[10px] bg-muted p-2 rounded max-h-32 overflow-auto whitespace-pre-wrap">
              {status.stderr_tail}
            </pre>
          )}
          <div className="flex gap-2">
            <Button size="sm" onClick={() => invoke(`restart_${name}`)}>
              重启
            </Button>
            <Button size="sm" variant="outline" onClick={() => invoke(`stop_${name}`)}>
              停止
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => useTerminalStore.getState().setActivePanel('logs')}
            >
              查看日志
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
