import {
  type AiProviderReadiness,
  type AiProviderType,
  type MaskedProviderConfig,
  type MaskedProviderEntry,
  type TestAiProviderResult,
  deleteAiProvider,
  getAiProviderConfig,
  refreshAgentAiProvider,
  saveAiProvider,
  setActiveAiProvider,
  testAiProvider,
} from '@/lib/tauri-commands';
import { useTerminalStore } from '@/stores/terminal';
import { create } from 'zustand';

export type { AiProviderReadiness, AiProviderType, MaskedProviderEntry };

export interface AiProviderDraft {
  id: string;
  provider_type: AiProviderType;
  display_name: string;
  base_url: string;
  model_id: string;
  priority: number;
  active: boolean;
  api_key?: string | null;
}

export interface AiProviderError {
  type: 'provider-not-configured' | 'provider-invalid' | 'command-failed';
  message?: string;
}

interface AiProviderStore {
  providers: MaskedProviderEntry[];
  activeProviderId: string | null;
  activeProvider: MaskedProviderEntry | null;
  readiness: AiProviderReadiness;
  statusLabel: string;
  provenance: MaskedProviderConfig['provenance'];
  isLoading: boolean;
  isSaving: boolean;
  isTesting: boolean;
  error: string | null;
  lastProviderError: AiProviderError | null;
  lastTestResult: TestAiProviderResult | null;
  refresh: () => Promise<void>;
  loadProviders: () => Promise<void>;
  saveProvider: (input: AiProviderDraft) => Promise<MaskedProviderEntry>;
  deleteProvider: (providerId: string) => Promise<void>;
  setActiveProvider: (providerId: string) => Promise<void>;
  testProvider: (input: AiProviderDraft) => Promise<TestAiProviderResult>;
  refreshAgentRuntime: () => Promise<void>;
  openSettingsPanel: () => void;
  resetForTest: () => void;
}

const STATUS_LABEL: Record<AiProviderReadiness, string> = {
  unconfigured: 'AI · 未配置',
  untested: 'AI · 未测试',
  available: 'AI · 可用',
  invalid: 'AI · 无效',
};

const initialConfig = {
  providers: [],
  activeProviderId: null,
  activeProvider: null,
  readiness: 'unconfigured' as AiProviderReadiness,
  statusLabel: STATUS_LABEL.unconfigured,
  provenance: null,
  isLoading: false,
  isSaving: false,
  isTesting: false,
  error: null,
  lastProviderError: null,
  lastTestResult: null,
};

function sortProviders(providers: MaskedProviderEntry[]): MaskedProviderEntry[] {
  return [...providers].sort((a, b) => a.priority - b.priority || a.display_name.localeCompare(b.display_name) || a.id.localeCompare(b.id));
}

function deriveConfig(config: MaskedProviderConfig) {
  const providers = sortProviders(config.providers);
  const activeProvider =
    providers.find((provider) => provider.id === config.active_provider_id) ??
    providers.find((provider) => provider.active) ??
    null;
  const readiness = activeProvider?.readiness ?? config.readiness ?? 'unconfigured';

  return {
    providers,
    activeProviderId: activeProvider?.id ?? config.active_provider_id ?? null,
    activeProvider,
    readiness,
    statusLabel: STATUS_LABEL[readiness],
    provenance: config.provenance ?? null,
    lastProviderError:
      readiness === 'unconfigured' || readiness === 'invalid'
        ? ({ type: 'provider-not-configured' } as AiProviderError)
        : null,
  };
}

function toCommandInput(input: AiProviderDraft) {
  return {
    id: input.id,
    providerType: input.provider_type,
    displayName: input.display_name,
    baseUrl: input.base_url,
    modelId: input.model_id,
    priority: input.priority,
    active: input.active,
    apiKey: input.api_key?.trim() ? input.api_key : null,
  };
}

function configFromProviders(
  providers: MaskedProviderEntry[],
  activeProviderId: string | null,
  readiness: AiProviderReadiness,
): MaskedProviderConfig {
  return {
    providers,
    active_provider_id: activeProviderId,
    readiness,
    provenance: null,
  };
}

export const useAiProviderStore = create<AiProviderStore>((set, get) => ({
  ...initialConfig,

  refresh: async () => {
    set({ isLoading: true, error: null });
    try {
      const config = await getAiProviderConfig();
      set({ ...deriveConfig(config), isLoading: false });
    } catch (error) {
      set({
        isLoading: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  },

  loadProviders: async () => get().refresh(),

  saveProvider: async (input) => {
    set({ isSaving: true, error: null });
    try {
      const saved = await saveAiProvider(toCommandInput(input));
      const existing = get().providers.filter((provider) => provider.id !== saved.id);
      const providers = sortProviders([...existing, saved]);
      const activeProviderId = saved.active ? saved.id : get().activeProviderId;
      const readiness = saved.active ? saved.readiness : get().readiness;
      set({
        ...deriveConfig(configFromProviders(providers, activeProviderId, readiness)),
        isSaving: false,
      });
      return saved;
    } catch (error) {
      set({
        isSaving: false,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  },

  deleteProvider: async (providerId) => {
    set({ isSaving: true, error: null });
    try {
      const config = await deleteAiProvider(providerId);
      set({ ...deriveConfig(config), isSaving: false });
    } catch (error) {
      set({
        isSaving: false,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  },

  setActiveProvider: async (providerId) => {
    set({ isSaving: true, error: null });
    try {
      const config = await setActiveAiProvider(providerId);
      set({ ...deriveConfig(config), isSaving: false });
    } catch (error) {
      set({
        isSaving: false,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  },

  testProvider: async (input) => {
    set({ isTesting: true, error: null, lastTestResult: null });
    try {
      const result = await testAiProvider(toCommandInput(input));
      set({ isTesting: false, lastTestResult: result });
      return result;
    } catch (error) {
      set({
        isTesting: false,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  },

  refreshAgentRuntime: async () => {
    set({ isLoading: true, error: null });
    try {
      const config = await refreshAgentAiProvider();
      set({ ...deriveConfig(config), isLoading: false });
    } catch (error) {
      set({
        isLoading: false,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  },

  openSettingsPanel: () => {
    const terminalStore = useTerminalStore.getState();
    terminalStore.setActivePanel('ai-provider');
    terminalStore.openPanel();
  },

  resetForTest: () => set({ ...initialConfig }),
}));
