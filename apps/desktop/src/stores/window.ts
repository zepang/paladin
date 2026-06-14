import { create } from 'zustand';
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow';

interface WindowState {
  isMaximized: boolean;
  isFocused: boolean;
  position: { x: number; y: number } | null;
  size: { width: number; height: number } | null;
  setIsMaximized: (v: boolean) => void;
  setIsFocused: (v: boolean) => void;
  setPosition: (x: number, y: number) => void;
  setSize: (width: number, height: number) => void;
  minimize: () => Promise<void>;
  maximize: () => Promise<void>;
  close: () => Promise<void>;
  toggleMaximize: () => Promise<void>;
}

export const useWindowStore = create<WindowState>()((set, get) => ({
  isMaximized: false,
  isFocused: true,
  position: null,
  size: null,

  setIsMaximized: (isMaximized) => set({ isMaximized }),
  setIsFocused: (isFocused) => set({ isFocused }),
  setPosition: (x, y) => set({ position: { x, y } }),
  setSize: (width, height) => set({ size: { width, height } }),

  minimize: async () => {
    const win = getCurrentWebviewWindow();
    await win.minimize();
  },

  maximize: async () => {
    const win = getCurrentWebviewWindow();
    await win.toggleMaximize();
    set({ isMaximized: !get().isMaximized });
  },

  close: async () => {
    const win = getCurrentWebviewWindow();
    await win.hide();
  },

  toggleMaximize: async () => {
    const win = getCurrentWebviewWindow();
    await win.toggleMaximize();
    set({ isMaximized: !get().isMaximized });
  },
}));

// Wire Tauri window events to store
export function initWindowEvents() {
  const win = getCurrentWebviewWindow();

  win.onFocusChanged(({ payload: focused }) => {
    useWindowStore.getState().setIsFocused(focused);
  });

  win.listen('tauri://resize', () => {
    // Mark as not maximized after manual resize
    useWindowStore.getState().setIsMaximized(false);
  });
}
