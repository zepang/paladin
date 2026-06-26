/**
 * 文件预览状态管理
 * 管理当前预览的文件路径、内容、加载状态
 */
import { create } from 'zustand';
import { readTextFile } from '@/lib/tauri-commands';

interface FilePreviewState {
  /** 当前预览的文件路径 */
  filePath: string | null;
  /** 文件内容 */
  content: string | null;
  /** 是否正在加载 */
  isLoading: boolean;
  /** 错误信息 */
  error: string | null;
  /** 打开文件预览 */
  openFile: (path: string) => Promise<void>;
  /** 关闭文件预览 */
  closeFile: () => void;
}

export const useFilePreviewStore = create<FilePreviewState>((set) => ({
  filePath: null,
  content: null,
  isLoading: false,
  error: null,

  openFile: async (path: string) => {
    set({ isLoading: true, error: null, filePath: path });
    try {
      const content = await readTextFile(path);
      set({ content, isLoading: false });
    } catch (e) {
      set({ error: e instanceof Error ? e.message : String(e), isLoading: false });
    }
  },

  closeFile: () => set({ filePath: null, content: null, error: null, isLoading: false }),
}));
