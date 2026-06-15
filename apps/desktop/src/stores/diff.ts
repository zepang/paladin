import { create } from 'zustand';

// Diff 条目数据结构
export interface DiffEntry {
  rawDiff: string;
  fileName: string;
  language: string;
  stats: { additions: number; deletions: number };
  expanded: boolean;
}

// Diff 状态管理 — 聊天消息中的 diff 数据
interface DiffState {
  diffs: Record<string, DiffEntry>; // messageId → DiffEntry
  activeDiffId: string | null;
  addDiff: (messageId: string, entry: DiffEntry) => void;
  removeDiff: (messageId: string) => void;
  setActiveDiff: (id: string | null) => void;
  toggleExpanded: (id: string) => void;
  clearAll: () => void;
}

export const useDiffStore = create<DiffState>((set) => ({
  diffs: {},
  activeDiffId: null,

  addDiff: (messageId, entry) =>
    set((s) => ({
      diffs: { ...s.diffs, [messageId]: entry },
    })),

  removeDiff: (messageId) =>
    set((s) => {
      const newDiffs = { ...s.diffs };
      delete newDiffs[messageId];
      return { diffs: newDiffs };
    }),

  setActiveDiff: (id) => set({ activeDiffId: id }),

  toggleExpanded: (id) =>
    set((s) => {
      const entry = s.diffs[id];
      if (!entry) return s;
      return {
        diffs: {
          ...s.diffs,
          [id]: { ...entry, expanded: !entry.expanded },
        },
      };
    }),

  clearAll: () => set({ diffs: {}, activeDiffId: null }),
}));
