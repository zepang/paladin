import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { canRestartGoService } from '@/lib/go-service-permissions';
import { useGoServiceStore } from '@/stores/goService';
import { useProcessStatus } from '@/stores/process';
import { useTerminalStore } from '@/stores/terminal';
import { invoke } from '@tauri-apps/api/core';

export type GoLightStatus =
  | 'unconfigured'
  | 'incomplete'
  | 'session-override'
  | 'checking'
  | 'ready'
  | 'dependency-degraded'
  | 'port-conflict'
  | 'sidecar-failed'
  | 'saved-pending-restart';

type Owner = 'supervisor' | 'external' | 'none';

const presentation: Record<GoLightStatus, { label: string; dot: string; detail: string }> = {
  unconfigured: {
    label: 'Go · 未配置 · 降级',
    dot: 'bg-amber-500',
    detail: '尚未保存完整的 Go 服务配置。Agent 仍可继续使用。',
  },
  incomplete: {
    label: 'Go · 配置不完整 · 降级',
    dot: 'bg-amber-500',
    detail: 'Go 服务配置不完整。请在设置中逐项填写缺失或无效字段；Agent 仍可继续使用。',
  },
  'session-override': {
    label: 'Go · 会话覆盖 · 未保存',
    dot: 'bg-amber-500',
    detail: '当前使用仅本次启动的测试会话配置，未保存到此设备。',
  },
  checking: {
    label: 'Go · 托管 · 检查中',
    dot: 'bg-primary',
    detail: '正在检查 Go 服务与依赖…',
  },
  ready: { label: 'Go · 已就绪', dot: 'bg-emerald-500', detail: 'Go 服务依赖可用。' },
  'dependency-degraded': {
    label: 'Go · 依赖降级',
    dot: 'bg-amber-500',
    detail: 'Go 服务已启动，但依赖未完全就绪；Agent 仍可继续使用。',
  },
  'port-conflict': {
    label: 'Go · 端口冲突',
    dot: 'bg-destructive',
    detail: '本机已有进程占用了 Paladin 需要的端口，但未通过健康检查。',
  },
  'sidecar-failed': {
    label: 'Go · Sidecar 启动失败',
    dot: 'bg-orange-500',
    detail: 'Go sidecar 未能正常启动。Agent 仍可继续使用。',
  },
  'saved-pending-restart': {
    label: 'Go · 已保存 · 待重启',
    dot: 'bg-amber-500',
    detail: '配置已保存，将在 Go 服务重新启动后应用。',
  },
};

function deriveStatus(
  config: ReturnType<typeof useGoServiceStore.getState>['config'],
  state: string,
  health: string,
  pendingApply: boolean,
): GoLightStatus {
  if (state === 'conflict') return 'port-conflict';
  if (state === 'stopped' || state === 'unhealthy' || health === 'failed') return 'sidecar-failed';
  if (state === 'starting') return 'checking';
  if (state === 'degraded' || health === 'degraded') return 'dependency-degraded';
  if (!config?.configured) return config?.fieldDiagnostics && Object.keys(config.fieldDiagnostics).length ? 'incomplete' : 'unconfigured';
  if (pendingApply || config.pendingApply) return 'saved-pending-restart';
  return 'ready';
}

export function GoServiceLight({ status, owner }: { status?: GoLightStatus; owner?: Owner }) {
  const config = useGoServiceStore((store) => store.config);
  const process = useGoServiceStore((store) => store.process);
  const retryReadiness = useGoServiceStore((store) => store.retryReadiness);
  const restartService = useGoServiceStore((store) => store.restartService);
  const processStatus = useProcessStatus('server');
  const resolvedOwner = owner ?? process?.owner ?? processStatus.owner;
  const resolvedStatus = status ?? deriveStatus(
    config,
    process?.state ?? processStatus.state,
    process?.health ?? processStatus.health,
    process?.pendingApply ?? false,
  );
  const copy = presentation[resolvedStatus];
  const isExternal = resolvedOwner === 'external';
  const canRestart = !isExternal && canRestartGoService(process);
  const canRetry = ['dependency-degraded', 'checking', 'ready', 'session-override'].includes(resolvedStatus);
  const canRedetect = resolvedStatus === 'port-conflict' || resolvedStatus === 'sidecar-failed' || isExternal;
  const pending = resolvedStatus === 'saved-pending-restart';

  const openSettings = () => {
    const terminal = useTerminalStore.getState();
    terminal.setActivePanel('go-service');
    terminal.openPanel();
  };
  const openLogs = () => {
    const terminal = useTerminalStore.getState();
    terminal.setActivePanel('logs');
    terminal.openPanel();
  };

  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button
            variant="ghost"
            size="sm"
            title={status === undefined && resolvedStatus === 'dependency-degraded' ? `Go · ${resolvedOwner === 'supervisor' ? '托管' : resolvedOwner === 'external' ? '外部' : '未接管'} · 降级` : copy.label}
            aria-label={status === undefined && resolvedStatus === 'dependency-degraded' ? `Go · ${resolvedOwner === 'supervisor' ? '托管' : resolvedOwner === 'external' ? '外部' : '未接管'} · 降级` : copy.label}
          >
            <span className={`inline-block h-2 w-2 rounded-full ${copy.dot}`} />
            <span className="text-xs">
              {status === undefined && resolvedStatus === 'dependency-degraded'
                ? `Go · ${resolvedOwner === 'supervisor' ? '托管' : resolvedOwner === 'external' ? '外部' : '未接管'} · 降级`
                : copy.label}
            </span>
          </Button>
        }
      />
      <PopoverContent side="top" align="start" sideOffset={10}>
        <div className="flex flex-col gap-2">
          <div className="font-medium text-sm">Go 服务</div>
          <p className="text-xs text-muted-foreground">{copy.detail}</p>
          {config?.configured && config.fingerprint && (
            <p className="text-xs text-muted-foreground">配置指纹 · {config.fingerprint}</p>
          )}
          <p className="text-xs text-muted-foreground">所有权：{resolvedOwner === 'supervisor' ? '托管' : resolvedOwner === 'external' ? '外部' : '未接管'}</p>
          {pending && (
            <p className="text-xs text-muted-foreground">
              已保存的配置等待应用：托管 Go 服务可在重试后重启；外部 Go 服务只能由其所有者重启后重新检测。
            </p>
          )}
          {isExternal && (
            <p className="text-xs text-muted-foreground">外部 Go 服务由你手动管理，Paladin 不会停止或重启它。</p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={openSettings}>打开设置</Button>
            {canRetry && <Button size="sm" variant="outline" onClick={() => void retryReadiness()}> {resolvedStatus === 'dependency-degraded' ? '重试 readiness' : '测试连接'} </Button>}
            {(canRestart && (pending || resolvedStatus === 'sidecar-failed')) || isExternal ? (
              <Button size="sm" variant="outline" disabled={isExternal} onClick={() => void restartService()}>
                重启
              </Button>
            ) : null}
            {(canRedetect || isExternal) && <Button size="sm" variant="outline" onClick={() => void invoke('redetect_server')}>重新检测</Button>}
            <Button size="sm" variant="ghost" onClick={openLogs}>查看日志</Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
