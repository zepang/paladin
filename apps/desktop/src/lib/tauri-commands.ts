/**
 * Tauri command 封装
 * 提供类型安全的 Rust 后端调用
 */
import { invoke } from '@tauri-apps/api/core';

export type AiProviderType = 'deepseek' | 'openai-compatible' | 'lm-studio';

export type AiProviderReadiness =
  | 'unconfigured'
  | 'untested'
  | 'available'
  | 'invalid';

export type ConfigProvenance =
  | 'local-user'
  | 'paladin-ai-env'
  | 'legacy-deep-seek-env';

export interface MaskedProviderConfig {
  providers: MaskedProviderEntry[];
  active_provider_id: string | null;
  readiness: AiProviderReadiness;
  provenance: ConfigProvenance | null;
}

export interface MaskedProviderEntry {
  id: string;
  provider_type: AiProviderType;
  display_name: string;
  base_url: string;
  model_id: string;
  priority: number;
  active: boolean;
  readiness: AiProviderReadiness;
  has_api_key: boolean;
  api_key_fingerprint: string;
}

export interface SaveAiProviderInput {
  id: string;
  providerType: AiProviderType;
  displayName: string;
  baseUrl: string;
  modelId: string;
  apiKey?: string | null;
  priority: number;
  active: boolean;
}

export interface AiProviderState extends MaskedProviderConfig {}

export interface TestAiProviderResult {
  readiness: AiProviderReadiness;
  configured: boolean;
  message: string | null;
}

interface RustSaveAiProviderInput {
  id: string;
  provider_type: AiProviderType;
  display_name: string;
  base_url: string;
  model_id: string;
  api_key?: string | null;
  priority: number;
  active: boolean;
}

function toRustSaveAiProviderInput(input: SaveAiProviderInput): RustSaveAiProviderInput {
  return {
    id: input.id,
    provider_type: input.providerType,
    display_name: input.displayName,
    base_url: input.baseUrl,
    model_id: input.modelId,
    api_key: input.apiKey,
    priority: input.priority,
    active: input.active,
  };
}

/**
 * 读取文本文件内容
 * @param path 文件绝对路径
 * @returns 文件内容字符串
 */
export async function readTextFile(path: string): Promise<string> {
  return invoke<string>('read_text_file', { path });
}

export async function getAiProviderConfig(): Promise<AiProviderState> {
  return invoke<AiProviderState>('get_ai_provider_config');
}

export async function saveAiProvider(
  input: SaveAiProviderInput,
): Promise<MaskedProviderEntry> {
  return invoke<MaskedProviderEntry>('save_ai_provider', {
    input: toRustSaveAiProviderInput(input),
  });
}

export async function deleteAiProvider(
  providerId: string,
): Promise<AiProviderState> {
  return invoke<AiProviderState>('delete_ai_provider', {
    providerId,
  });
}

export async function setActiveAiProvider(
  providerId: string,
): Promise<AiProviderState> {
  return invoke<AiProviderState>('set_active_ai_provider', {
    providerId,
  });
}

export async function testAiProvider(
  input: SaveAiProviderInput,
): Promise<TestAiProviderResult> {
  return invoke<TestAiProviderResult>('test_ai_provider', {
    input: toRustSaveAiProviderInput(input),
  });
}

export async function refreshAgentAiProvider(): Promise<AiProviderState> {
  return invoke<AiProviderState>('refresh_agent_ai_provider');
}
