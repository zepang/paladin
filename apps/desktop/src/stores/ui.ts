/**
 * UI 布局状态管理 Store
 * 管理侧边栏折叠/展开状态
 */
import { create } from 'zustand';

interface UIState {
  /** 左侧对话列表是否折叠 */
  sidebarCollapsed: boolean;
  /** 切换侧边栏折叠状态 */
  toggleSidebar: () => void;
  /** 设置侧边栏折叠状态 */
  setSidebarCollapsed: (collapsed: boolean) => void;
}

export const useUIStore = create<UIState>()((set) => ({
  sidebarCollapsed: false,
  toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
  setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),
}));
