import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import type { AiProviderReadiness } from '@/stores/aiProvider';
import { useAiProviderStore } from '@/stores/aiProvider';
import { BrainCircuit } from 'lucide-react';

const DOT_CLASS: Record<AiProviderReadiness, string> = {
  unconfigured: 'bg-muted-foreground',
  untested: 'bg-amber-500',
  available: 'bg-emerald-500',
  invalid: 'bg-orange-500',
};

const TEXT_CLASS: Record<AiProviderReadiness, string> = {
  unconfigured: 'text-muted-foreground',
  untested: 'text-amber-600 dark:text-amber-400',
  available: 'text-emerald-600 dark:text-emerald-400',
  invalid: 'text-orange-600 dark:text-orange-400',
};

const LABEL: Record<AiProviderReadiness, string> = {
  unconfigured: 'AI · 未配置',
  untested: 'AI · 未测试',
  available: 'AI · 可用',
  invalid: 'AI · 无效',
};

const DETAIL: Record<AiProviderReadiness, string> = {
  unconfigured: '尚未配置 AI provider',
  untested: 'Provider 已保存，尚未测试连接。',
  available: 'Provider 连接可用。',
  invalid: '当前 provider 不可用。请检查 base URL、API key 和模型 ID，或切换到其他 provider。',
};

export function AiProviderLight() {
  const readiness = useAiProviderStore((s) => s.readiness);
  const activeProvider = useAiProviderStore((s) => s.activeProvider);
  const openSettingsPanel = useAiProviderStore((s) => s.openSettingsPanel);
  const testProvider = useAiProviderStore((s) => s.testProvider);
  const isTesting = useAiProviderStore((s) => s.isTesting);
  const label = LABEL[readiness];

  const handleTest = () => {
    if (!activeProvider) return;
    void testProvider({
      id: activeProvider.id,
      provider_type: activeProvider.provider_type,
      display_name: activeProvider.display_name,
      base_url: activeProvider.base_url,
      model_id: activeProvider.model_id,
      priority: activeProvider.priority,
      active: activeProvider.active,
      api_key: null,
    });
  };

  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button variant="ghost" size="sm" title={label}>
            <span className={`inline-block w-2 h-2 rounded-full ${DOT_CLASS[readiness]}`} />
            <BrainCircuit className="h-3.5 w-3.5" aria-hidden="true" />
            <span className={`text-xs ${TEXT_CLASS[readiness]}`}>{label}</span>
          </Button>
        }
      />
      <PopoverContent side="top" align="start" sideOffset={10}>
        <div className="flex flex-col gap-2">
          <div className="font-medium text-sm">AI provider</div>
          <div className="text-xs text-muted-foreground">{DETAIL[readiness]}</div>
          {activeProvider ? (
            <div className="grid gap-1 text-xs text-muted-foreground">
              <div>
                Provider: <span className="text-foreground">{activeProvider.display_name}</span>
              </div>
              <div>
                Model: <span className="text-foreground">{activeProvider.model_id}</span>
              </div>
              <div>
                Status: <span className={TEXT_CLASS[readiness]}>{label}</span>
              </div>
              {activeProvider.has_api_key && activeProvider.api_key_fingerprint && (
                <div>API key 已配置 · {activeProvider.api_key_fingerprint}</div>
              )}
            </div>
          ) : (
            <div className="text-xs text-muted-foreground">
              配置 DeepSeek、OpenAI 兼容服务或 LM Studio 后即可开始对话。
            </div>
          )}
          <div className="flex gap-2">
            <Button size="sm" onClick={openSettingsPanel}>
              打开设置
            </Button>
            {activeProvider && (
              <Button size="sm" variant="outline" onClick={handleTest} disabled={isTesting}>
                测试连接
              </Button>
            )}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
