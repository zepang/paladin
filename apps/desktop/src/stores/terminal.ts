import { create } from 'zustand';

// 终端 Tab 数据结构
export interface TerminalTab {
  id: string;
  title: string;
  cwd: string;
}

// 终端状态管理 — 面板开关、Tab 列表、面板类型切换
interface TerminalState {
  // 面板状态
  isOpen: boolean;
  panelHeight: number;
  activePanel: 'terminal' | 'diff';
  // Tab 管理
  tabs: TerminalTab[];
  activeTabId: string | null;
  // 后台运行状态
  isTerminalRunning: boolean;
  // Actions
  openPanel: () => void;
  closePanel: () => void;
  togglePanel: () => void;
  setPanelHeight: (h: number) => void;
  setActivePanel: (panel: 'terminal' | 'diff') => void;
  addTab: (tab: TerminalTab) => void;
  removeTab: (id: string) => void;
  setActiveTab: (id: string | null) => void;
  renameTab: (id: string, title: string) => void;
  setTerminalRunning: (running: boolean) => void;
}

export const useTerminalStore = create<TerminalState>((set, get) => ({
  // 初始状态
  isOpen: false,
  panelHeight: 250,
  activePanel: 'terminal',
  tabs: [],
  activeTabId: null,
  isTerminalRunning: false,

  // 面板开关
  openPanel: () => set({ isOpen: true }),
  closePanel: () => set({ isOpen: false }),
  togglePanel: () => set((s) => ({ isOpen: !s.isOpen })),
  setPanelHeight: (h) => set({ panelHeight: Math.max(100, Math.min(h, window.innerHeight * 0.5)) }),

  // 面板类型切换
  setActivePanel: (panel) => set({ activePanel: panel }),

  // Tab 管理
  addTab: (tab) =>
    set((s) => ({
      tabs: [...s.tabs, tab],
      activeTabId: tab.id,
    })),

  removeTab: (id) => {
    const state = get();
    const newTabs = state.tabs.filter((t) => t.id !== id);
    const isLastTab = newTabs.length === 0;

    if (isLastTab) {
      // 关闭最后一个 Tab 时隐藏面板，并重置运行状态
      set({ tabs: [], activeTabId: null, isOpen: false, isTerminalRunning: false });
    } else {
      // 如果关闭的是活跃 Tab，切换到最后一个 Tab
      const newActiveId = state.activeTabId === id ? (newTabs[newTabs.length - 1]?.id ?? null) : state.activeTabId;
      set({ tabs: newTabs, activeTabId: newActiveId });
    }
  },

  setActiveTab: (id) => set({ activeTabId: id }),

  renameTab: (id, title) =>
    set((s) => ({
      tabs: s.tabs.map((t) => (t.id === id ? { ...t, title } : t)),
    })),

  setTerminalRunning: (running) => set({ isTerminalRunning: running }),
}));
