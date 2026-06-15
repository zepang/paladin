/// Diff 消息卡片 — 聊天消息中内嵌显示代码变更
///
/// 默认显示紧凑摘要（'修改了 N 个文件，+M/-K'），点击展开完整 Diff。
/// 使用 @git-diff-view/react 的 DiffView 组件，支持 Split/Unified 视图切换、语法高亮。

import { DiffModeEnum, DiffView } from '@git-diff-view/react';
import '@git-diff-view/react/styles/diff-view.css';
import { useThemeStore } from '@/stores/theme';
import { useMemo, useState } from 'react';

interface DiffMessageCardProps {
  rawDiff: string;
  fileName: string;
  language?: string;
}

// 文件扩展名 → 语言映射
function detectLanguage(fName: string): string {
  const ext = fName.split('.').pop()?.toLowerCase();
  const map: Record<string, string> = {
    ts: 'typescript', tsx: 'tsx', js: 'javascript', jsx: 'jsx',
    py: 'python', rs: 'rust', go: 'go', css: 'css', html: 'html',
    json: 'json', md: 'markdown', yaml: 'yaml', yml: 'yaml',
    toml: 'toml', sql: 'sql', sh: 'bash', bash: 'bash', zsh: 'bash',
  };
  return map[ext ?? ''] ?? 'plaintext';
}

// 从 unified diff 文本中提取统计信息
function computeStats(rawDiff: string): { additions: number; deletions: number } {
  const lines = rawDiff.split('\n');
  let additions = 0;
  let deletions = 0;
  for (const line of lines) {
    if (line.startsWith('+') && !line.startsWith('+++')) additions++;
    if (line.startsWith('-') && !line.startsWith('---')) deletions++;
  }
  return { additions, deletions };
}

// 解析 diff 中的文件列表
function parseFiles(rawDiff: string, fallbackName: string): string[] {
  const files: string[] = [];
  const lines = rawDiff.split('\n');
  for (const line of lines) {
    const match = line.match(/^\+\+\+ b\/(.+)$/);
    const f = match?.[1];
    if (f) files.push(f);
  }
  return files.length > 0 ? files : [fallbackName];
}

// 从 unified diff 文本中提取内容用于 DiffView 的 data 属性
// 返回 { oldContent, newContent, hunks }
function parseDiffData(rawDiff: string): {
  oldContent: string;
  newContent: string;
  hunks: string[];
} {
  const oldLines: string[] = [];
  const newLines: string[] = [];
  const hunks: string[] = [];
  let currentHunk = '';

  for (const line of rawDiff.split('\n')) {
    // 跳过 diff 头部行
    if (line.startsWith('diff --git ') || line.startsWith('index ')) continue;
    if (line.startsWith('--- ') || line.startsWith('+++ ')) continue;

    // hunk 头部 — 开始新的 hunk
    if (line.startsWith('@@')) {
      if (currentHunk) hunks.push(currentHunk);
      currentHunk = line + '\n';
      continue;
    }

    if (currentHunk.includes('@@')) {
      // 在 hunk 内收集内容
      currentHunk += line + '\n';

      if (line.startsWith('-')) {
        // 删除行：仅存在于旧版本
        oldLines.push(line.slice(1));
      } else if (line.startsWith('+')) {
        // 新增行：仅存在于新版本
        newLines.push(line.slice(1));
      } else {
        // 上下文行（以空格开头）：同时存在于新旧版本
        const content = line.length > 0 && line[0] === ' ' ? line.slice(1) : line;
        oldLines.push(content);
        newLines.push(content);
      }
    }
  }

  if (currentHunk) hunks.push(currentHunk);

  return {
    oldContent: oldLines.join('\n'),
    newContent: newLines.join('\n'),
    hunks,
  };
}

export function DiffMessageCard({ rawDiff, fileName, language }: DiffMessageCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [viewMode, setViewMode] = useState<'unified' | 'split'>('unified');
  const isDark = useThemeStore((s) => s.theme === 'dark');

  const stats = useMemo(() => computeStats(rawDiff), [rawDiff]);
  const files = useMemo(() => parseFiles(rawDiff, fileName), [rawDiff, fileName]);
  const lang = language ?? detectLanguage(fileName);

  // 解析 diff 数据，只在展开时计算
  const diffData = useMemo(() => {
    if (!expanded) return null;
    return parseDiffData(rawDiff);
  }, [expanded, rawDiff]);

  const fileList = files.length > 1
    ? `修改了 ${files.length} 个文件`
    : (files[0] ?? fileName);

  return (
    <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden my-2">
      {/* 紧凑摘要头部 */}
      <button
        type="button"
        className="w-full flex items-center gap-2 px-3 py-2 bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-750 transition-colors text-left"
        onClick={() => setExpanded(!expanded)}
        aria-expanded={expanded}
      >
        {/* 统计 */}
        <span className="text-green-600 dark:text-green-400 text-xs font-mono">+{stats.additions}</span>
        <span className="text-red-600 dark:text-red-400 text-xs font-mono">-{stats.deletions}</span>

        {/* 文件信息 */}
        <span className="text-xs text-gray-600 dark:text-gray-400 truncate flex-1">
          {fileList}
        </span>

        {/* 展开/收起箭头 */}
        <svg
          className={`w-4 h-4 text-gray-400 transition-transform ${expanded ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <title>{expanded ? '收起' : '展开'}</title>
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* 展开的 Diff 内容 */}
      {expanded && diffData && (
        <div className="border-t border-gray-200 dark:border-gray-700">
          {/* 视图切换工具栏 */}
          <div className="flex items-center gap-1 px-2 py-1 bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
            <button
              type="button"
              className={`px-2 py-0.5 text-xs rounded ${viewMode === 'unified'
                ? 'bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300'
                : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'}`}
              onClick={() => setViewMode('unified')}
            >
              Unified
            </button>
            <button
              type="button"
              className={`px-2 py-0.5 text-xs rounded ${viewMode === 'split'
                ? 'bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300'
                : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'}`}
              onClick={() => setViewMode('split')}
            >
              Split
            </button>
          </div>

          {/* Diff 内容 — 使用 data 属性避免 DiffFile 类型冲突 */}
          <div className="max-h-96 overflow-auto">
            <DiffView
              data={{
                oldFile: {
                  fileName,
                  fileLang: lang,
                  content: diffData.oldContent,
                },
                newFile: {
                  fileName,
                  fileLang: lang,
                  content: diffData.newContent,
                },
                hunks: diffData.hunks,
              }}
              diffViewMode={viewMode === 'split' ? DiffModeEnum.Split : DiffModeEnum.Unified}
              diffViewTheme={isDark ? 'dark' : 'light'}
              diffViewHighlight={true}
              diffViewWrap={false}
            />
          </div>
        </div>
      )}
    </div>
  );
}
