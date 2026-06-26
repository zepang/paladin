/**
 * UI 布局状态管理 Store
 * 管理侧边栏折叠/展开状态、响应式宽度方案
 */
import { create } from 'zustand';

/** 响应式断点档位 */
export type Breakpoint = 'sm' | 'md' | 'lg';

/** 各档位宽度配置 */
export const WIDTH_CONFIG = {
  sm: { sidebar: 220, chat: 480, panel: 480 },  // 1366px
  md: { sidebar: 220, chat: 480, panel: 480 },  // 1440px
  lg: { sidebar: 240, chat: 480, panel: 480 },  // 1920px+
} as const;

/** 根据窗口宽度获取断点 */
export function getBreakpoint(width: number): Breakpoint {
  if (width >= 1920) return 'lg';
  if (width >= 1440) return 'md';
  return 'sm';
}

interface UIState {
  /** 左侧对话列表是否折叠 */
  sidebarCollapsed: boolean;
  /** 当前响应式断点 */
  breakpoint: Breakpoint;
  /** 是否使用抽屉模式（<1440px 时会话列表浮层） */
  sidebarDrawerMode: boolean;
  /** 抽屉模式下的临时展开状态 */
  sidebarDrawerOpen: boolean;
  /** 切换侧边栏折叠状态 */
  toggleSidebar: () => void;
  /** 设置侧边栏折叠状态 */
  setSidebarCollapsed: (collapsed: boolean) => void;
  /** 设置断点 */
  setBreakpoint: (bp: Breakpoint) => void;
  /** 设置抽屉模式 */
  setSidebarDrawerMode: (drawer: boolean) => void;
  /** 切换抽屉展开 */
  toggleSidebarDrawer: () => void;
  /** 设置抽屉展开状态 */
  setSidebarDrawerOpen: (open: boolean) => void;
}

export const useUIStore = create<UIState>()((set) => ({
  sidebarCollapsed: false,
  breakpoint: 'md',
  sidebarDrawerMode: false,
  sidebarDrawerOpen: false,
  toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
  setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),
  setBreakpoint: (bp) => set({
    breakpoint: bp,
    // <1440px 启用抽屉模式，默认收起
    sidebarDrawerMode: bp === 'sm',
    sidebarCollapsed: bp === 'sm' ? true : false,
  }),
  setSidebarDrawerMode: (drawer) => set({ sidebarDrawerMode: drawer }),
  toggleSidebarDrawer: () => set((s) => ({ sidebarDrawerOpen: !s.sidebarDrawerOpen })),
  setSidebarDrawerOpen: (open) => set({ sidebarDrawerOpen: open }),
}));
