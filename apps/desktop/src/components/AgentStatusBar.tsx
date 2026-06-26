/**
 * Agent 运行状态条
 * 在对话区域顶部显示 Agent 运行状态
 * 仅在 agent.isRunning 为 true 时可见
 */
import { useAgent } from '@copilotkit/react-core/v2';

export function AgentStatusBar() {
  const { agent } = useAgent();

  // Agent 未运行时不渲染
  if (!agent.isRunning) return null;

  return (
    <div className="flex items-center gap-2 px-4 py-1.5 bg-primary/5 border-b border-border text-xs text-muted-foreground">
      {/* 脉冲指示点 */}
      <span className="relative flex h-2 w-2">
        <span className="absolute inline-flex h-full w-full rounded-full bg-green-500 opacity-75 animate-ping" />
        <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
      </span>
      {/* 状态文字 */}
      <span>Agent 正在思考...</span>
    </div>
  );
}
