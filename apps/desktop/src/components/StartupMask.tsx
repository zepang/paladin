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
import { Button } from '@/components/ui/button';
import type { ProcessState } from '@/stores/process';

interface StartupMaskProps {
  agentState: ProcessState;
  error: string | null;
  stderrTail: string | null;
  onRestart: () => void;
}

export function StartupMask({ agentState, error, stderrTail, onRestart }: StartupMaskProps) {
  if (agentState === 'starting') {
    return (
      <div className="flex flex-col h-full items-center justify-center p-8 text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mb-4" />
        <p className="text-muted-foreground">正在启动 Agent...</p>
      </div>
    );
  }

  if (agentState === 'unhealthy' || agentState === 'degraded') {
    return (
      <div className="flex flex-col h-full items-center justify-center p-8 text-center">
        <div className="text-amber-500 text-5xl mb-4">⚠</div>
        <h2 className="text-xl font-semibold text-foreground mb-2">
          {agentState === 'unhealthy'
            ? 'Agent 异常，正在自动重启（退避中）'
            : 'Agent 降级（部分依赖不可用）'}
        </h2>
        {error && <p className="text-sm text-muted-foreground mb-2">{error}</p>}
        {stderrTail && (
          <pre className="text-[10px] bg-muted p-2 rounded max-h-32 overflow-auto max-w-2xl whitespace-pre-wrap">
            {stderrTail}
          </pre>
        )}
      </div>
    );
  }

  if (agentState === 'stopped') {
    return (
      <div className="flex flex-col h-full items-center justify-center p-8 text-center">
        <div className="text-destructive text-5xl mb-4">✕</div>
        <h2 className="text-xl font-semibold text-destructive mb-2">Agent 已停止</h2>
        {error && <p className="text-sm text-muted-foreground mb-4 max-w-2xl">{error}</p>}
        {stderrTail && (
          <pre className="text-[10px] bg-muted p-2 rounded max-h-32 overflow-auto max-w-2xl whitespace-pre-wrap mb-4">
            {stderrTail}
          </pre>
        )}
        <Button variant="destructive" onClick={onRestart}>
          重启 Agent
        </Button>
      </div>
    );
  }

  return null;
}
