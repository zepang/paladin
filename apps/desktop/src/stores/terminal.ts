import { create } from 'zustand';

export interface TerminalTab {
  id: string;
  title: string;
  cwd: string;
}

interface TerminalState {
  isOpen: boolean;
  isFullscreen: boolean;
  panelWidth: number;
  activePanel: 'terminal' | 'file-preview' | 'diff';
  tabs: TerminalTab[];
  activeTabId: string | null;
  isTerminalRunning: boolean;
  openPanel: () => void;
  closePanel: () => void;
  togglePanel: () => void;
  setPanelWidth: (w: number) => void;
  setFullscreen: (fs: boolean) => void;
  toggleFullscreen: () => void;
  setActivePanel: (panel: 'terminal' | 'file-preview' | 'diff') => void;
  addTab: (tab: TerminalTab) => void;
  removeTab: (id: string) => void;
  setActiveTab: (id: string | null) => void;
  renameTab: (id: string, title: string) => void;
  setTerminalRunning: (running: boolean) => void;
}

export const useTerminalStore = create<TerminalState>((set, get) => ({
  isOpen: false,
  isFullscreen: false,
  panelWidth: 480,
  activePanel: 'terminal',
  tabs: [],
  activeTabId: null,
  isTerminalRunning: false,

  openPanel: () => set({ isOpen: true }),
  closePanel: () => set({ isOpen: false, isFullscreen: false }),
  togglePanel: () => set((s) => ({ isOpen: !s.isOpen })),
  setPanelWidth: (w) => set({ panelWidth: Math.max(300, w) }),
  setFullscreen: (fs) => set({ isFullscreen: fs }),
  toggleFullscreen: () => set((s) => ({ isFullscreen: !s.isFullscreen })),

  setActivePanel: (panel) => set({ activePanel: panel }),

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
      set({ tabs: [], activeTabId: null, isOpen: false, isTerminalRunning: false });
    } else {
      const newActiveId =
        state.activeTabId === id ? (newTabs[newTabs.length - 1]?.id ?? null) : state.activeTabId;
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
