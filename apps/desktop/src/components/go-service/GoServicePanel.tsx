import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import type { GoServiceDraft } from '@/lib/tauri-commands';
import { useGoServiceStore } from '@/stores/goService';
import { Database, LoaderCircle, RotateCw, ServerCog, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

type Field = keyof GoServiceDraft;
type FieldErrors = Partial<Record<Field, string>>;

const fieldLabels: Record<Field, string> = {
  databaseUrl: '数据库 URL',
  redisUrl: 'Redis URL',
  jwtSecret: 'JWT 密钥',
};

const emptyDraft: GoServiceDraft = { databaseUrl: '', redisUrl: '', jwtSecret: '' };

function validate(draft: GoServiceDraft): FieldErrors {
  const errors: FieldErrors = {};
  for (const field of Object.keys(fieldLabels) as Field[]) {
    if (!draft[field].trim()) errors[field] = `${fieldLabels[field]} 不能为空`;
  }
  return errors;
}

function actionMessage(operation: string) {
  if (operation === 'saved-pending-restart') {
    return '配置已保存。运行中的 Go 服务将在重新启动后使用新配置。';
  }
  if (operation === 'imported-pending-restart')
    return '环境配置已导入。运行中的 Go 服务将在重新启动后使用新配置。';
  if (operation === 'cleared-pending-restart') return '本地 Go 服务配置已清除。';
  if (operation === 'restarted-managed-process') return 'Go 服务已重新启动。';
  if (operation === 'retry-current-process') return '已检查当前 Go 服务进程。';
  return '当前 Go 服务不支持重新启动。';
}

export function GoServicePanel() {
  const config = useGoServiceStore((state) => state.config);
  const process = useGoServiceStore((state) => state.process);
  const lastAction = useGoServiceStore((state) => state.lastAction);
  const lastTestResult = useGoServiceStore((state) => state.lastTestResult);
  const isLoading = useGoServiceStore((state) => state.isLoading);
  const refresh = useGoServiceStore((state) => state.refresh);
  const saveConfiguration = useGoServiceStore((state) => state.saveConfiguration);
  const testReadiness = useGoServiceStore((state) => state.testReadiness);
  const importFromEnvironment = useGoServiceStore((state) => state.importFromEnvironment);
  const clearConfiguration = useGoServiceStore((state) => state.clearConfiguration);
  const retryReadiness = useGoServiceStore((state) => state.retryReadiness);
  const restartService = useGoServiceStore((state) => state.restartService);
  const [draft, setDraft] = useState<GoServiceDraft>(emptyDraft);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [result, setResult] = useState('');
  const databaseRef = useRef<HTMLInputElement>(null);
  const redisRef = useRef<HTMLInputElement>(null);
  const jwtRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const focusFirstError = (nextErrors: FieldErrors) => {
    if (nextErrors.databaseUrl) databaseRef.current?.focus();
    else if (nextErrors.redisUrl) redisRef.current?.focus();
    else if (nextErrors.jwtSecret) jwtRef.current?.focus();
  };

  const update = (field: Field, value: string) => {
    setDraft((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: undefined }));
  };

  const requireCompleteDraft = () => {
    const nextErrors = validate(draft);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) {
      focusFirstError(nextErrors);
      return false;
    }
    return true;
  };

  const save = async () => {
    if (!requireCompleteDraft()) return;
    try {
      const action = await saveConfiguration(draft);
      const message = actionMessage(action.operation);
      setResult(message);
      toast.success('Go 服务配置已保存');
      setDraft(emptyDraft);
    } catch {
      setResult('保存配置失败，请检查字段后重试。');
    }
  };

  const testCurrentInput = async () => {
    if (!requireCompleteDraft()) return;
    try {
      const test = await testReadiness(draft);
      setResult(test.valid ? 'Go 服务依赖可用' : '当前未保存输入未通过检查。');
    } catch {
      setResult('测试当前配置失败，请检查字段后重试。');
    }
  };

  const runAction = async (operation: () => Promise<{ operation: string }>) => {
    try {
      const action = await operation();
      setResult(actionMessage(action.operation));
    } catch {
      setResult('操作失败，请稍后重试。');
    }
  };

  const handleClear = async () => {
    await runAction(clearConfiguration);
    setDraft(emptyDraft);
    setErrors({});
  };

  const hasSavedConfig = Boolean(config?.configured);
  const managed = process?.owner === 'supervisor' && process.allowedActions.restart;
  const external = process?.owner === 'external';
  const status = config?.configured ? '已保存到此设备' : '未配置';
  const latest = result || (lastAction ? actionMessage(lastAction.operation) : '');

  return (
    <ScrollArea className="min-h-0 flex-1">
      <section className="space-y-6 p-4" aria-labelledby="go-service-title">
        <div className="rounded-lg border border-border bg-card p-4 space-y-2">
          <div className="flex items-center gap-2">
            <ServerCog className="size-4 text-primary" aria-hidden="true" />
            <h2 id="go-service-title" className="text-base font-semibold">
              Go 服务
            </h2>
          </div>
          <p className="text-xs text-muted-foreground">{status}</p>
          {config?.configured && (
            <p className="text-xs text-muted-foreground">配置指纹 · {config.fingerprint}</p>
          )}
          <p className="text-sm">
            {process?.health === 'ready'
              ? 'Go 服务依赖可用'
              : 'Go 服务未完全就绪；Agent 仍可继续使用。'}
          </p>
          <div className="grid gap-1 text-xs text-muted-foreground">
            <span>sidecar：{process?.state ?? 'unknown'}</span>
            <span>健康检查：{process?.health ?? 'unknown'}</span>
            <span>依赖 readiness：{config?.readiness ?? 'unconfigured'}</span>
          </div>
        </div>

        <div className="space-y-3">
          {(Object.keys(fieldLabels) as Field[]).map((field) => {
            const ref =
              field === 'databaseUrl' ? databaseRef : field === 'redisUrl' ? redisRef : jwtRef;
            return (
              <label key={field} className="block space-y-1 text-xs" htmlFor={`go-${field}`}>
                <span>{fieldLabels[field]}</span>
                <input
                  ref={ref}
                  id={`go-${field}`}
                  aria-label={fieldLabels[field]}
                  aria-invalid={Boolean(errors[field])}
                  type={field === 'jwtSecret' ? 'password' : 'text'}
                  value={draft[field]}
                  onChange={(event) => update(field, event.target.value)}
                  className="h-8 w-full rounded-md border border-input bg-background px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
                {config?.fieldDiagnostics?.[field] === 'configured' && (
                  <span className="text-muted-foreground">已配置</span>
                )}
                {errors[field] && (
                  <span className="text-destructive" role="alert">
                    {errors[field]}
                  </span>
                )}
              </label>
            );
          })}
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            onClick={() => void save()}
            disabled={isLoading || Object.keys(validate(draft)).length > 0}
          >
            {isLoading && <LoaderCircle className="size-4 animate-spin" />} 保存配置
          </Button>
          <Button variant="outline" onClick={() => void testCurrentInput()} disabled={isLoading}>
            测试{hasSavedConfig ? '连接' : '当前配置'}
          </Button>
          <Button
            variant="outline"
            onClick={() => void runAction(importFromEnvironment)}
            disabled={isLoading}
          >
            从环境变量导入
          </Button>
          <AlertDialog>
            <AlertDialogTrigger render={<Button variant="destructive" disabled={isLoading} />}>
              <Trash2 className="size-4" /> 清除本地配置
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>确认清除 Go 服务本地配置</AlertDialogTitle>
                <AlertDialogDescription>清除后不会自动从环境变量重新导入。</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>取消</AlertDialogCancel>
                <AlertDialogAction onClick={() => void handleClear()}>确认清除</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>

        <div className="space-y-2">
          {managed && (
            <Button
              variant="outline"
              onClick={() => void runAction(restartService)}
              disabled={isLoading}
            >
              <RotateCw className="size-4" /> 重启
            </Button>
          )}
          {external && (
            <div className="space-y-2 text-sm text-muted-foreground">
              <p>外部 Go 服务需自行重启后重新检测。</p>
              <Button
                variant="outline"
                onClick={() => void runAction(retryReadiness)}
                disabled={isLoading}
              >
                重新检测
              </Button>
            </div>
          )}
          {!external && hasSavedConfig && !managed && (
            <Button
              variant="outline"
              onClick={() => void runAction(retryReadiness)}
              disabled={isLoading}
            >
              重试 readiness
            </Button>
          )}
        </div>

        {(latest || lastTestResult) && (
          <output
            aria-live="polite"
            className="rounded-md border border-border bg-muted p-3 text-sm"
          >
            {latest || (lastTestResult?.valid ? 'Go 服务依赖可用' : '当前未保存输入未通过检查。')}
          </output>
        )}
        <p className="sr-only">
          <Database />
          Go 服务配置为写入专用。
        </p>
      </section>
    </ScrollArea>
  );
}
