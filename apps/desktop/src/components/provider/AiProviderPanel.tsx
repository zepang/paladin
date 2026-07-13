import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import type { AiProviderDraft, AiProviderReadiness, AiProviderType, MaskedProviderEntry } from '@/stores/aiProvider';
import { useAiProviderStore } from '@/stores/aiProvider';
import { CheckCircle2, CircleAlert, CircleDot, KeyRound, Loader2, Plus, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

const PROVIDER_OPTIONS: Array<{ value: AiProviderType; label: string; defaultBaseUrl: string; defaultModelId: string }> = [
  {
    value: 'deepseek',
    label: 'DeepSeek',
    defaultBaseUrl: 'https://api.deepseek.com/v1',
    defaultModelId: 'deepseek-chat',
  },
  {
    value: 'openai-compatible',
    label: 'OpenAI 兼容',
    defaultBaseUrl: 'https://api.openai.com/v1',
    defaultModelId: '',
  },
  {
    value: 'lm-studio',
    label: 'LM Studio',
    defaultBaseUrl: 'http://localhost:1234/v1',
    defaultModelId: '',
  },
];

const READINESS_LABEL: Record<AiProviderReadiness, string> = {
  unconfigured: '未配置',
  untested: '未测试',
  available: '可用',
  invalid: '无效',
};

const READINESS_CLASS: Record<AiProviderReadiness, string> = {
  unconfigured: 'bg-muted-foreground text-muted-foreground',
  untested: 'bg-amber-500 text-amber-600 dark:text-amber-400',
  available: 'bg-emerald-500 text-emerald-600 dark:text-emerald-400',
  invalid: 'bg-orange-500 text-orange-600 dark:text-orange-400',
};

const EMPTY_FORM: AiProviderDraft = {
  id: '',
  provider_type: 'deepseek',
  display_name: 'DeepSeek',
  base_url: 'https://api.deepseek.com/v1',
  model_id: 'deepseek-chat',
  priority: 1,
  active: true,
  api_key: '',
};

function providerLabel(type: AiProviderType): string {
  return PROVIDER_OPTIONS.find((option) => option.value === type)?.label ?? type;
}

function draftFromProvider(provider: MaskedProviderEntry): AiProviderDraft {
  return {
    id: provider.id,
    provider_type: provider.provider_type,
    display_name: provider.display_name,
    base_url: provider.base_url,
    model_id: provider.model_id,
    priority: provider.priority,
    active: provider.active,
    api_key: '',
  };
}

function normalizeId(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
}

function keyMetadata(provider: MaskedProviderEntry | null): string | null {
  if (!provider?.has_api_key) return null;
  return provider.api_key_fingerprint
    ? `API key 已配置 · ${provider.api_key_fingerprint}`
    : 'API key 已配置';
}

function compactKeyMetadata(provider: MaskedProviderEntry | null): string {
  if (!provider?.has_api_key) return '密钥未配置';
  return provider.api_key_fingerprint ? `密钥已配置 · ${provider.api_key_fingerprint}` : '密钥已配置';
}

function validateDraft(draft: AiProviderDraft): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!draft.display_name.trim()) errors.display_name = 'display name 不能为空';
  if (!draft.base_url.trim()) errors.base_url = 'base URL 不能为空';
  if (!draft.model_id.trim()) errors.model_id = '模型 ID 不能为空';
  if (!draft.id.trim()) errors.id = 'provider ID 不能为空';
  return errors;
}

function StatusBadge({ readiness }: { readiness: AiProviderReadiness }) {
  return (
    <span className={`inline-flex items-center gap-1 text-xs ${READINESS_CLASS[readiness].replace('bg-', 'text-')}`}>
      <span className={`size-2 rounded-full ${READINESS_CLASS[readiness].split(' ')[0]}`} />
      {READINESS_LABEL[readiness]}
    </span>
  );
}

export function AiProviderPanel() {
  const providers = useAiProviderStore((state) => state.providers);
  const activeProvider = useAiProviderStore((state) => state.activeProvider);
  const readiness = useAiProviderStore((state) => state.readiness);
  const isLoading = useAiProviderStore((state) => state.isLoading);
  const isSaving = useAiProviderStore((state) => state.isSaving);
  const isTesting = useAiProviderStore((state) => state.isTesting);
  const lastTestResult = useAiProviderStore((state) => state.lastTestResult);
  const error = useAiProviderStore((state) => state.error);
  const refresh = useAiProviderStore((state) => state.refresh);
  const saveProvider = useAiProviderStore((state) => state.saveProvider);
  const testProvider = useAiProviderStore((state) => state.testProvider);
  const deleteProvider = useAiProviderStore((state) => state.deleteProvider);
  const setActiveProvider = useAiProviderStore((state) => state.setActiveProvider);

  const [draft, setDraft] = useState<AiProviderDraft>(EMPTY_FORM);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [deleteTarget, setDeleteTarget] = useState<MaskedProviderEntry | null>(null);
  const selectedProvider = useMemo(
    () => providers.find((provider) => provider.id === selectedId) ?? null,
    [providers, selectedId],
  );

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!selectedId && activeProvider) {
      setSelectedId(activeProvider.id);
      setDraft(draftFromProvider(activeProvider));
    }
  }, [activeProvider, selectedId]);

  const updateDraft = (patch: Partial<AiProviderDraft>) => {
    setDraft((current) => ({ ...current, ...patch }));
  };

  const selectProvider = (provider: MaskedProviderEntry) => {
    setSelectedId(provider.id);
    setDraft(draftFromProvider(provider));
    setFieldErrors({});
  };

  const startNewProvider = () => {
    setSelectedId(null);
    setDraft({ ...EMPTY_FORM, id: `provider-${providers.length + 1}`, priority: providers.length + 1 });
    setFieldErrors({});
  };

  const onProviderTypeChange = (providerType: AiProviderType) => {
    const option = PROVIDER_OPTIONS.find((candidate) => candidate.value === providerType);
    updateDraft({
      provider_type: providerType,
      display_name: selectedId ? draft.display_name : (option?.label ?? draft.display_name),
      base_url: option?.defaultBaseUrl ?? draft.base_url,
      model_id: option?.defaultModelId ?? draft.model_id,
    });
  };

  const runWithValidation = async (action: 'save' | 'test') => {
    const nextDraft = {
      ...draft,
      id: draft.id.trim() || normalizeId(draft.display_name) || `provider-${providers.length + 1}`,
    };
    const errors = validateDraft(nextDraft);
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    if (action === 'save') {
      await saveProvider(nextDraft);
      updateDraft({ id: nextDraft.id, api_key: '' });
      setSelectedId(nextDraft.id);
      return;
    }

    await testProvider(nextDraft);
    updateDraft({ id: nextDraft.id, api_key: '' });
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    await deleteProvider(deleteTarget.id);
    setDeleteTarget(null);
    setSelectedId(null);
    setDraft({ ...EMPTY_FORM });
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <ScrollArea className="min-h-0 flex-1">
        <div className="flex min-w-0 flex-col gap-4 p-4">
          <section className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-base font-semibold leading-tight">当前 provider</h2>
              {isLoading && <Loader2 className="size-4 animate-spin text-muted-foreground" aria-label="加载中" />}
            </div>
            <div className="rounded-lg border border-border bg-card p-3">
              {activeProvider ? (
                <div className="flex min-w-0 flex-col gap-1">
                  <div className="flex min-w-0 items-center justify-between gap-2">
                    <div className="min-w-0 truncate text-sm font-medium">{activeProvider.display_name}</div>
                    <StatusBadge readiness={activeProvider.readiness} />
                  </div>
                  <div className="truncate text-xs text-muted-foreground">模型: {activeProvider.model_id}</div>
                  <div className="text-xs text-muted-foreground">{compactKeyMetadata(activeProvider)}</div>
                </div>
              ) : (
                <div className="flex flex-col gap-1">
                  <div className="text-sm font-medium">尚未配置 AI provider</div>
                  <div className="text-xs text-muted-foreground">配置 DeepSeek、OpenAI 兼容服务或 LM Studio 后即可开始对话。</div>
                  <StatusBadge readiness={readiness} />
                </div>
              )}
            </div>
          </section>

          <section className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-base font-semibold leading-tight">Provider 列表</h2>
              <Button type="button" variant="outline" size="sm" onClick={startNewProvider}>
                <Plus className="size-3.5" />
                新建
              </Button>
            </div>
            <div className="flex flex-col gap-2">
              {providers.length === 0 ? (
                <div className="rounded-lg border border-dashed border-border p-3 text-xs text-muted-foreground">
                  暂无 provider。
                </div>
              ) : (
                providers.map((provider) => (
                  <button
                    key={provider.id}
                    type="button"
                    onClick={() => selectProvider(provider)}
                    className="flex min-w-0 flex-col gap-1 rounded-lg border border-border bg-card p-3 text-left transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    aria-label={`${provider.display_name} ${provider.model_id}`}
                  >
                    <div className="flex min-w-0 items-center justify-between gap-2">
                      <span className="min-w-0 truncate text-sm font-medium">{provider.display_name}</span>
                      {provider.active ? (
                        <span className="inline-flex items-center gap-1 text-xs text-primary">
                          <CircleDot className="size-3" />
                          当前
                        </span>
                      ) : null}
                    </div>
                    <div className="flex min-w-0 flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <span>{providerLabel(provider.provider_type)}</span>
                      <span className="truncate">{provider.model_id}</span>
                      <StatusBadge readiness={provider.readiness} />
                    </div>
                    <div className="text-xs text-muted-foreground">{compactKeyMetadata(provider)}</div>
                  </button>
                ))
              )}
            </div>
          </section>

          <section className="flex flex-col gap-3">
            <h2 className="text-base font-semibold leading-tight">编辑配置</h2>
            <div className="grid grid-cols-1 gap-3">
              <label className="flex flex-col gap-1 text-xs">
                provider 类型
                <select
                  aria-label="provider 类型"
                  value={draft.provider_type}
                  onChange={(event) => onProviderTypeChange(event.target.value as AiProviderType)}
                  className="h-8 rounded-md border border-input bg-background px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {PROVIDER_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="flex flex-col gap-1 text-xs">
                display name
                <input
                  aria-label="display name"
                  value={draft.display_name}
                  onChange={(event) => updateDraft({ display_name: event.target.value })}
                  className="h-8 rounded-md border border-input bg-background px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
                {fieldErrors.display_name && <span className="text-xs text-destructive">{fieldErrors.display_name}</span>}
              </label>

              <label className="flex flex-col gap-1 text-xs">
                base URL
                <input
                  aria-label="base URL"
                  value={draft.base_url}
                  onChange={(event) => updateDraft({ base_url: event.target.value })}
                  className="h-8 rounded-md border border-input bg-background px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
                {fieldErrors.base_url && <span className="text-xs text-destructive">请输入 URL</span>}
              </label>

              <label className="flex flex-col gap-1 text-xs">
                model ID
                <input
                  aria-label="model ID"
                  value={draft.model_id}
                  onChange={(event) => updateDraft({ model_id: event.target.value })}
                  className="h-8 rounded-md border border-input bg-background px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
                {fieldErrors.model_id && <span className="text-xs text-destructive">{fieldErrors.model_id}</span>}
              </label>

              <label className="flex flex-col gap-1 text-xs">
                API key
                <input
                  aria-label="API key"
                  type="password"
                  value={draft.api_key ?? ''}
                  placeholder="输入新的 API key"
                  onChange={(event) => updateDraft({ api_key: event.target.value })}
                  className="h-8 rounded-md border border-input bg-background px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
                {keyMetadata(selectedProvider) && (
                  <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                    <KeyRound className="size-3" />
                    {keyMetadata(selectedProvider)}
                  </span>
                )}
              </label>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className="flex flex-col gap-1 text-xs">
                  priority
                  <input
                    aria-label="priority"
                    type="number"
                    min={0}
                    value={draft.priority}
                    onChange={(event) => updateDraft({ priority: Number(event.target.value) })}
                    className="h-8 rounded-md border border-input bg-background px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  />
                </label>
                <label className="flex items-center gap-2 pt-5 text-xs">
                  <input
                    aria-label="设为当前 provider"
                    type="checkbox"
                    checked={draft.active}
                    onChange={(event) => updateDraft({ active: event.target.checked })}
                    className="size-4"
                  />
                  设为当前 provider
                </label>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button type="button" onClick={() => void runWithValidation('save')} disabled={isSaving}>
                {isSaving ? <Loader2 className="size-3.5 animate-spin" /> : <CheckCircle2 className="size-3.5" />}
                保存配置
              </Button>
              <Button type="button" variant="outline" onClick={() => void runWithValidation('test')} disabled={isTesting}>
                {isTesting ? <Loader2 className="size-3.5 animate-spin" /> : <CircleAlert className="size-3.5" />}
                测试连接
              </Button>
              {selectedProvider && !selectedProvider.active && (
                <Button type="button" variant="ghost" onClick={() => void setActiveProvider(selectedProvider.id)}>
                  设为当前
                </Button>
              )}
              {selectedProvider && (
                <Button
                  type="button"
                  variant="destructive"
                  aria-label="删除 provider"
                  onClick={() => setDeleteTarget(selectedProvider)}
                >
                  <Trash2 className="size-3.5" />
                  删除
                </Button>
              )}
            </div>
          </section>

          <section className="flex flex-col gap-2">
            <h2 className="text-base font-semibold leading-tight">验证结果</h2>
            {lastTestResult ? (
              <div className="rounded-lg border border-border p-3 text-sm">
                {lastTestResult.readiness === 'available' ? '连接可用' : '连接测试失败，请检查配置后重试'}
                {lastTestResult.message ? (
                  <div className="mt-1 text-xs text-muted-foreground">{lastTestResult.message}</div>
                ) : null}
              </div>
            ) : (
              <div className="rounded-lg border border-dashed border-border p-3 text-xs text-muted-foreground">
                保存配置不会自动测试连接。
              </div>
            )}
            {error && <div className="text-xs text-destructive">{error}</div>}
          </section>
        </div>
      </ScrollArea>

      <AlertDialog open={Boolean(deleteTarget)} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除 provider</AlertDialogTitle>
            <AlertDialogDescription>
              删除后将移除该 provider 的本地配置；如果它是当前激活项，Paladin 会回到未配置状态。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={() => void confirmDelete()}>确认删除</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
