/// Diff 消息卡片 — 聊天消息中内嵌显示代码变更

import {
  computeStats,
  detectLanguage,
  isBinaryDiff,
  parseDiffData,
  parseFiles,
} from '@/lib/diffParser';
import { DiffModeEnum, DiffView } from '@git-diff-view/react';
import '@git-diff-view/react/styles/diff-view.css';
import { useThemeStore } from '@/stores/theme';
import { useMemo, useState } from 'react';

interface DiffMessageCardProps {
  rawDiff: string;
  fileName: string;
  language?: string;
}

const LARGE_DIFF_THRESHOLD = 500;

export function DiffMessageCard({ rawDiff, fileName, language }: DiffMessageCardProps) {
  const stats = useMemo(() => computeStats(rawDiff), [rawDiff]);
  const isLarge = stats.additions + stats.deletions > LARGE_DIFF_THRESHOLD;
  const isBinary = useMemo(() => isBinaryDiff(rawDiff), [rawDiff]);

  const [expanded, setExpanded] = useState(!isLarge);
  const [viewMode, setViewMode] = useState<'unified' | 'split'>('unified');

  const isDark = useThemeStore((s) => {
    const theme = s.theme;
    return (
      theme === 'dark' ||
      (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)
    );
  });

  const files = useMemo(() => parseFiles(rawDiff, fileName), [rawDiff, fileName]);
  const lang = language ?? detectLanguage(fileName);

  const diffData = useMemo(() => {
    if (!expanded || isBinary) return null;
    return parseDiffData(rawDiff);
  }, [expanded, isBinary, rawDiff]);

  const fileList =
    files.length > 1 ? `修改了 ${files.length} 个文件` : (files[0] ?? fileName);

  if (isBinary) {
    return (
      <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden my-2 px-3 py-2 bg-gray-50 dark:bg-gray-800 text-sm text-gray-600 dark:text-gray-400">
        二进制文件变更
      </div>
    );
  }

  return (
    <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden my-2">
      <button
        type="button"
        className="w-full flex items-center gap-2 px-3 py-2 bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-750 transition-colors text-left"
        onClick={() => setExpanded(!expanded)}
        aria-expanded={expanded}
      >
        <span className="text-green-600 dark:text-green-400 text-xs font-mono">
          +{stats.additions}
        </span>
        <span className="text-red-600 dark:text-red-400 text-xs font-mono">
          -{stats.deletions}
        </span>
        <span className="text-xs text-gray-600 dark:text-gray-400 truncate flex-1">
          {isLarge && !expanded ? `大文件变更（点击展开） — ${fileList}` : fileList}
        </span>
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

      {expanded && diffData && (
        <div className="border-t border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-1 px-2 py-1 bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
            <button
              type="button"
              className={`px-2 py-0.5 text-xs rounded ${
                viewMode === 'unified'
                  ? 'bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300'
                  : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
              }`}
              onClick={() => setViewMode('unified')}
            >
              Unified
            </button>
            <button
              type="button"
              className={`px-2 py-0.5 text-xs rounded ${
                viewMode === 'split'
                  ? 'bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300'
                  : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
              }`}
              onClick={() => setViewMode('split')}
            >
              Split
            </button>
          </div>

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
