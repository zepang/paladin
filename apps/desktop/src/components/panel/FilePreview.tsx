/**
 * 文件预览组件
 * 支持代码高亮（shiki）、Markdown 渲染、图片预览、纯文本
 */
import { Button } from '@/components/ui/button';
import { useFilePreviewStore } from '@/stores/file-preview';
import { useThemeStore } from '@/stores/theme';
import { convertFileSrc } from '@tauri-apps/api/core';
import { codeToHtml } from 'shiki';
import { FileX, Loader2, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

/** 从文件路径提取扩展名 */
function getExt(path: string): string {
  const parts = path.split('.');
  return parts.length > 1 ? parts.pop()!.toLowerCase() : '';
}

/** 从文件路径提取文件名 */
function getFileName(path: string): string {
  return path.split('/').pop() || path;
}

/** 图片扩展名 */
const IMAGE_EXTS = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'ico'];

/** Markdown 扩展名 */
const MD_EXTS = ['md', 'markdown', 'mdx'];

/** Shiki 语言映射 */
const SHIKI_LANG_MAP: Record<string, string> = {
  ts: 'typescript', tsx: 'tsx', js: 'javascript', jsx: 'jsx',
  py: 'python', rs: 'rust', go: 'go', java: 'java',
  c: 'c', cpp: 'cpp', h: 'c', hpp: 'cpp',
  json: 'json', yaml: 'yaml', yml: 'yaml',
  html: 'html', css: 'css', scss: 'scss',
  sh: 'bash', bash: 'bash', zsh: 'bash',
  sql: 'sql', xml: 'xml', toml: 'toml',
  vue: 'vue', svelte: 'svelte',
};

export function FilePreview() {
  const { filePath, content, isLoading, error, closeFile } = useFilePreviewStore();
  const [highlighted, setHighlighted] = useState<string>('');
  const theme = useThemeStore((s) => s.theme);
  const isDark = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);

  const ext = useMemo(() => (filePath ? getExt(filePath) : ''), [filePath]);
  const fileName = useMemo(() => (filePath ? getFileName(filePath) : ''), [filePath]);
  const isImage = IMAGE_EXTS.includes(ext);
  const isMarkdown = MD_EXTS.includes(ext);

  // 代码高亮
  useEffect(() => {
    if (!content || isImage || isMarkdown) {
      setHighlighted('');
      return;
    }
    const lang = SHIKI_LANG_MAP[ext] || 'text';
    codeToHtml(content, {
      lang,
      theme: isDark ? 'github-dark' : 'github-light',
    })
      .then(setHighlighted)
      .catch(() => setHighlighted(''));
  }, [content, ext, isDark, isImage, isMarkdown]);

  // 加载状态
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        <Loader2 className="size-5 animate-spin mr-2" />
        <span className="text-sm">加载中...</span>
      </div>
    );
  }

  // 错误状态
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-2">
        <FileX className="size-8" />
        <span className="text-sm">{error}</span>
        <Button variant="ghost" size="sm" onClick={closeFile}>关闭</Button>
      </div>
    );
  }

  // 无文件
  if (!filePath) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground text-sm p-4 text-center">
        选择文件以预览
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* 文件标题栏 */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-border bg-muted/30">
        <span className="text-xs font-mono text-foreground truncate flex-1" title={filePath}>
          {fileName}
        </span>
        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={closeFile} aria-label="关闭文件">
          <X className="size-3.5" />
        </Button>
      </div>

      {/* 内容区域 */}
      <div className="flex-1 overflow-auto min-h-0">
        {/* 图片 */}
        {isImage && (
          <div className="flex items-center justify-center p-4 h-full">
            <img
              src={convertFileSrc(filePath)}
              alt={fileName}
              className="max-w-full max-h-full object-contain"
            />
          </div>
        )}

        {/* Markdown */}
        {isMarkdown && content && (
          <div className="p-4 prose prose-sm dark:prose-invert max-w-none">
            <pre className="whitespace-pre-wrap text-sm font-sans">{content}</pre>
          </div>
        )}

        {/* 代码（shiki 高亮） */}
        {!isImage && !isMarkdown && highlighted && (
          <div
            className="text-xs"
            dangerouslySetInnerHTML={{ __html: highlighted }}
          />
        )}

        {/* 代码（fallback 纯文本） */}
        {!isImage && !isMarkdown && !highlighted && content && (
          <pre className="p-3 text-xs font-mono whitespace-pre-wrap break-words text-foreground">
            {content}
          </pre>
        )}
      </div>
    </div>
  );
}
