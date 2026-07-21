import { create } from 'zustand';
import {
  clearGoServiceConfiguration,
  getGoServiceConfiguration,
  importGoServiceEnvironment,
  restartGoService,
  retryGoServiceReadiness,
  saveGoServiceConfig,
  testGoServiceConfiguration,
  testSavedGoServiceConfiguration,
  type GoServiceActionResult,
  type GoServiceDraft,
  type GoServiceProcess,
  type MaskedGoServiceConfig,
  type TestGoServiceResult,
} from '@/lib/tauri-commands';

interface GoServiceStore {
  config: MaskedGoServiceConfig | null;
  process: GoServiceProcess | null;
  lastAction: GoServiceActionResult | null;
  lastTestResult: TestGoServiceResult | null;
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  saveConfiguration: (draft: GoServiceDraft) => Promise<GoServiceActionResult>;
  testReadiness: (draft: GoServiceDraft) => Promise<TestGoServiceResult>;
  testSavedConfiguration: () => Promise<TestGoServiceResult>;
  importFromEnvironment: () => Promise<GoServiceActionResult>;
  clearConfiguration: () => Promise<GoServiceActionResult>;
  retryReadiness: () => Promise<GoServiceActionResult>;
  restartService: () => Promise<GoServiceActionResult>;
  resetForTest: () => void;
}

const initialState = {
  config: null,
  process: null,
  lastAction: null,
  lastTestResult: null,
  isLoading: false,
  error: null,
};

function applyAction(set: (value: Partial<GoServiceStore>) => void, result: GoServiceActionResult) {
  set({
    config: result.config,
    process: result.process,
    lastAction: result,
    isLoading: false,
    error: null,
  });
  return result;
}

export const useGoServiceStore = create<GoServiceStore>((set) => ({
  ...initialState,
  refresh: async () => {
    set({ isLoading: true, error: null });
    try {
      applyAction(set, await getGoServiceConfiguration());
    } catch (error) {
      set({ isLoading: false, error: String(error) });
    }
  },
  saveConfiguration: async (draft) => {
    set({ isLoading: true, error: null });
    try {
      return applyAction(set, await saveGoServiceConfig(draft));
    } catch (error) {
      set({ isLoading: false, error: String(error) });
      throw error;
    }
  },
  testReadiness: async (draft) => {
    set({ isLoading: true, error: null });
    try {
      const result = await testGoServiceConfiguration(draft);
      set({ isLoading: false, lastTestResult: result });
      return result;
    } catch (error) {
      set({ isLoading: false, error: String(error) });
      throw error;
    }
  },
  testSavedConfiguration: async () => {
    set({ isLoading: true, error: null });
    try {
      const result = await testSavedGoServiceConfiguration();
      set({ isLoading: false, lastTestResult: result });
      return result;
    } catch (error) {
      set({ isLoading: false, error: String(error) });
      throw error;
    }
  },
  importFromEnvironment: async () => applyAction(set, await importGoServiceEnvironment()),
  clearConfiguration: async () => applyAction(set, await clearGoServiceConfiguration()),
  retryReadiness: async () => applyAction(set, await retryGoServiceReadiness()),
  restartService: async () => applyAction(set, await restartGoService()),
  resetForTest: () => set(initialState),
}));
