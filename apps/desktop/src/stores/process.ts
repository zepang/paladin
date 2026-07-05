/**
 * 进程状态 Store — 集中订阅 Rust supervisor 的 `process-status` 事件
 *
 * 单一 zustand store 持有 agent + server 两路 ProcessInfo,
 * 组件通过 `useProcessStatus(name)` selector 订阅;
 * `initProcessListeners()` 在应用顶层调用一次,拉一次初值 + listen 后续。
 *
 * 字段命名严格对齐 plan 06 emit payload (snake_case,与 Rust serde 一致):
 * ProcessInfoDTO { state, last_error, stderr_tail, last_restart_at }
 * ProcessStatusPayload 通过 #[serde(flatten)] 平铺为 { name, ...ProcessInfoDTO }
 */
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { create } from 'zustand';

export type ProcessName = 'agent' | 'server';

export type ProcessState = 'starting' | 'running' | 'degraded' | 'unhealthy' | 'stopped';

export interface ProcessInfo {
  state: ProcessState;
  last_error: string | null;
  stderr_tail: string | null;
  last_restart_at: number | null;
}

interface ProcessStore {
  agent: ProcessInfo;
  server: ProcessInfo;
  setStatus: (name: ProcessName, patch: Partial<ProcessInfo>) => void;
}

const initial: ProcessInfo = {
  state: 'starting',
  last_error: null,
  stderr_tail: null,
  last_restart_at: null,
};

export const useProcessStore = create<ProcessStore>((set) => ({
  agent: { ...initial },
  server: { ...initial },
  setStatus: (name, patch) =>
    set((s) => ({ [name]: { ...s[name], ...patch } })),
}));

export const useProcessStatus = (name: ProcessName): ProcessInfo =>
  useProcessStore((s) => s[name]);

type ProcessStatusSnapshot = Record<ProcessName, ProcessInfo>;

type ProcessStatusEventPayload = { name: ProcessName } & Partial<ProcessInfo>;

/**
 * 全局订阅入口 — 在应用顶层调用一次。
 *
 * 1. `invoke('get_process_status')` 拉一次初值 (首探完成前 agent/server 均为 starting)
 * 2. `listen('process-status')` 订阅后续 transition emit
 *
 * @returns unlisten 函数,在 cleanup 调用 (SPA 实际不卸载)
 */
export async function initProcessListeners(): Promise<() => void> {
  try {
    const snap = await invoke<ProcessStatusSnapshot>('get_process_status');
    useProcessStore.setState({
      agent: { ...initial, ...snap.agent },
      server: { ...initial, ...snap.server },
    });
  } catch (e) {
    console.warn('[process] get_process_status failed, 保留 starting 默认值', e);
  }

  const unlisten = await listen<ProcessStatusEventPayload>(
    'process-status',
    (e) => {
      const { name, ...patch } = e.payload;
      useProcessStore.getState().setStatus(name, patch);
    }
  );

  return unlisten;
}
