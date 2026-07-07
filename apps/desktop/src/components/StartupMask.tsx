/**
 * StartupMask — 状态驱动首屏遮罩 (plan 07.3-07, D-06 + D-08 + SPEC Prohibition P2)
 *
 * 当 Agent 状态 !== 'running' 时,App.tsx 渲染本遮罩代替主界面 (CopilotKitProvider)。
 * StatusBar 始终在外层渲染 (D-10 状态灯永远可见)。
 *
 * 色值映射 (D-06):
 *   starting  → 蓝 (border-primary spinner)
 *   unhealthy → 黄/橙 (text-amber-500)
 *   degraded  → 黄/橙 (text-amber-500)
 *   stopped   → 红 (text-destructive + 重启按钮)
 *
 * SPEC Prohibition P2: stopped/unhealthy 必须暴露退出原因 (last_error) + 末尾 stderr 摘要。
 */
import type { ReactNode } from 'react';
import { AlertTriangle, LoaderCircle, RefreshCw, ShieldAlert, XCircle } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { ProcessHealth, ProcessOwner, ProcessState } from '@/stores/process';

interface StartupMaskProps {
  agentState: ProcessState;
  owner: ProcessOwner;
  health: ProcessHealth;
  error: string | null;
  stderrTail: string | null;
  onRestart: () => void;
  onRedetect?: () => void;
}

interface StatusPanelProps {
  icon: ReactNode;
  tone: 'loading' | 'warning' | 'destructive';
  eyebrow: string;
  title: string;
  description: string;
  error?: string | null;
  stderrTail?: string | null;
  action?: ReactNode;
}

const toneClassNames: Record<StatusPanelProps['tone'], string> = {
  loading: 'border-primary/20 bg-primary/10 text-primary',
  warning: 'border-amber-500/25 bg-amber-500/10 text-amber-600 dark:text-amber-400',
  destructive: 'border-destructive/25 bg-destructive/10 text-destructive',
};

function StatusPanel({
  icon,
  tone,
  eyebrow,
  title,
  description,
  error,
  stderrTail,
  action,
}: StatusPanelProps) {
  const hasDiagnostics = Boolean(error || stderrTail);

  return (
    <div className="flex h-full items-center justify-center bg-background p-6 text-center">
      <section
        className={cn(
          'w-full rounded-lg border border-border bg-card text-card-foreground shadow-sm',
          hasDiagnostics ? 'max-w-[520px] p-6' : 'max-w-[420px] p-5'
        )}
      >
        <div
          className={cn(
            'mx-auto flex items-center justify-center rounded-full border',
            hasDiagnostics ? 'mb-4 size-12' : 'mb-3 size-10',
            toneClassNames[tone]
          )}
        >
          {icon}
        </div>

        <div className="mb-1 text-xs font-medium tracking-normal text-muted-foreground">
          {eyebrow}
        </div>
        <h2 className={cn('font-semibold text-foreground', hasDiagnostics ? 'text-xl' : 'text-lg')}>
          {title}
        </h2>
        <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-muted-foreground">
          {description}
        </p>

        {error && (
          <div className="mt-5 rounded-md border border-border bg-muted/60 px-3 py-2 text-left">
            <div className="mb-1 text-xs font-medium text-foreground">错误信息</div>
            <p className="break-words text-xs leading-5 text-muted-foreground">{error}</p>
          </div>
        )}

        {stderrTail && (
          <div className="mt-3 rounded-md border border-border bg-muted/60 text-left">
            <div className="border-b border-border px-3 py-2 text-xs font-medium text-foreground">
              stderr 摘要
            </div>
            <pre className="max-h-36 overflow-auto whitespace-pre-wrap break-words px-3 py-2 font-mono text-[11px] leading-5 text-muted-foreground">
              {stderrTail}
            </pre>
          </div>
        )}

        {action && (
          <div className={cn('flex justify-center', hasDiagnostics ? 'mt-5' : 'mt-4')}>
            {action}
          </div>
        )}
      </section>
    </div>
  );
}

function classifyFailure(error: string | null, health: ProcessHealth) {
  const text = error ?? '';
  if (text.includes('运行时配置无效') || text.includes('processes.json')) {
    return {
      eyebrow: '配置错误',
      title: '运行时配置无效',
      description: '请检查 src-tauri/processes.json 的模式、命令和路径配置。',
    };
  }
  if (text.includes('端口') || text.includes('健康检查')) {
    return {
      eyebrow: '端口冲突',
      title: 'Agent 端口被占用',
      description: '已有进程占用了 Agent 端口，但没有通过 Paladin 健康检查。',
    };
  }
  if (text.includes('cwd')) {
    return {
      eyebrow: '路径错误',
      title: 'Agent 工作目录不存在',
      description: '请检查运行时配置中的 cwd 是否指向本机存在的目录。',
    };
  }
  if (text.includes('spawn') || text.includes('No such file') || text.includes('找不到')) {
    return {
      eyebrow: '可执行文件缺失',
      title: 'Agent 可执行文件不可用',
      description: '请确认 Agent 启动命令在当前运行环境中可执行。',
    };
  }
  if (text.includes('进程退出') || text.includes('startup')) {
    return {
      eyebrow: '启动失败',
      title: 'Agent 在启动窗口内退出',
      description: 'Agent 已在启动保护窗口内退出，请查看诊断信息后重试。',
    };
  }
  if (health === 'failed') {
    return {
      eyebrow: '健康检查失败',
      title: 'Agent 健康检查未通过',
      description: 'Agent 服务暂不可用，请查看诊断信息或重新检测。',
    };
  }
  return {
    eyebrow: '进程已停止',
    title: 'Agent 已停止',
    description:
      '本地 Agent 没有成功启动。请先尝试重启；如果仍然失败，请根据错误信息检查可执行文件路径或运行环境。',
  };
}

export function StartupMask({
  agentState,
  owner,
  health,
  error,
  stderrTail,
  onRestart,
  onRedetect,
}: StartupMaskProps) {
  if (agentState === 'starting') {
    return (
      <StatusPanel
        icon={<LoaderCircle className="size-5 animate-spin" />}
        tone="loading"
        eyebrow="启动中"
        title="正在启动 Agent"
        description="正在连接本地 Agent 服务，完成后会自动进入工作区。"
      />
    );
  }

  if (agentState === 'unhealthy' || agentState === 'degraded') {
    return (
      <StatusPanel
        icon={
          agentState === 'unhealthy' ? (
            <AlertTriangle className="size-5" />
          ) : (
            <ShieldAlert className="size-5" />
          )
        }
        tone="warning"
        eyebrow={agentState === 'unhealthy' ? '自动恢复中' : '降级运行'}
        title={
          agentState === 'unhealthy'
            ? 'Agent 异常，正在自动重启'
            : 'Agent 部分依赖不可用'
        }
        description={
          agentState === 'unhealthy'
            ? '系统正在退避重试。你可以查看下方错误信息，等待自动恢复。'
            : '核心功能仍会尽量保持可用，但部分能力可能暂时受限。'
        }
        error={error}
        stderrTail={stderrTail}
      />
    );
  }

  if (agentState === 'conflict') {
    const failure = classifyFailure(error, health);
    return (
      <StatusPanel
        icon={<ShieldAlert className="size-5" />}
        tone="destructive"
        eyebrow={failure.eyebrow}
        title={failure.title}
        description={failure.description}
        error={error}
        stderrTail={stderrTail}
        action={
          <Button variant="destructive" onClick={onRedetect ?? onRestart}>
            <RefreshCw data-icon="inline-start" />
            重新检测 Agent
          </Button>
        }
      />
    );
  }

  if (agentState === 'stopped') {
    const failure = classifyFailure(error, health);
    const actionDisabled = owner === 'external';
    return (
      <StatusPanel
        icon={<XCircle className="size-5" />}
        tone="destructive"
        eyebrow={failure.eyebrow}
        title={failure.title}
        description={failure.description}
        error={error}
        stderrTail={stderrTail}
        action={
          <Button variant="destructive" disabled={actionDisabled} onClick={onRestart}>
            <RefreshCw data-icon="inline-start" />
            重启 Agent
          </Button>
        }
      />
    );
  }

  return null;
}
