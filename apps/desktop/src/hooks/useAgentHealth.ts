import { useProcessStatus } from '@/stores/process';
/**
 * Agent 健康状态管理 Hook — plan 07.3-07
 *
 * 数据源从「自发 fetch /health」改为「订阅 stores/process.ts 的 agent selector」
 * (plan 06 supervisor emit `process-status` 事件,supervisor 是唯一真相源)。
 *
 * 接口形态保留 isOnline/isLoading/error/retry,App.tsx 解构不破坏。
 * retry 改为 invoke('restart_agent') — 走 supervisor 手动重启路径。
 */
import { invoke } from '@tauri-apps/api/core';
import { useCallback } from 'react';

export interface AgentHealthState {
  /** Agent 是否在线 (state === 'running') */
  isOnline: boolean;
  /** 是否正在启动 (state === 'starting') */
  isLoading: boolean;
  /** 错误信息 (last_error 优先,fallback 文案) */
  error: string | null;
}

/**
 * 检查 Agent 健康状态的 Hook — selector 订阅 store.agent
 *
 * @returns Agent 健康状态对象和重启函数
 */
export function useAgentHealth(): AgentHealthState & { retry: () => void } {
  const status = useProcessStatus('agent');

  const isOnline = status.state === 'running';
  const isLoading = status.state === 'starting';
  const error =
    status.last_error ??
    (status.state === 'stopped'
      ? 'Agent 已停止'
      : status.state === 'unhealthy'
        ? 'Agent 异常，正在自动重启'
        : status.state === 'degraded'
          ? 'Agent 降级运行'
          : null);

  const retry = useCallback(() => {
    invoke('restart_agent').catch((e) => {
      console.warn('[agent-health] restart_agent failed', e);
    });
  }, []);

  return { isOnline, isLoading, error, retry };
}
