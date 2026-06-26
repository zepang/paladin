/**
 * Diff 审查视图
 * 全局 diff 列表，可点击查看详情
 * 数据源：useDiffStore
 */
import { Button } from '@/components/ui/button';
import { computeStats, isBinaryDiff, parseDiffData, detectLanguage } from '@/lib/diffParser';
import { useDiffStore, type DiffEntry } from '@/stores/diff';
import { useThemeStore } from '@/stores/theme';
import { DiffModeEnum, DiffView } from '@git-diff-view/react';
import '@git-diff-view/react/styles/diff-view.css';
import { ChevronLeft, GitBranch, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';

export function DiffReview() {
  const { diffs, activeDiffId, setActiveDiff, clearAll } = useDiffStore();
  const diffEntries = Object.entries(diffs);
  const activeEntry = activeDiffId ? diffs[activeDiffId] : null;

  const [viewMode, setViewMode] = useState<'unified' | 'split'>('unified');

  const isDark = useThemeStore((s) => {
    const theme = s.theme;
    return (
      theme === 'dark' ||
      (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)
    );
  });

  const diffData = useMemo(() => {
    if (!activeEntry || isBinaryDiff(activeEntry.rawDiff)) return null;
    return parseDiffData(activeEntry.rawDiff);
  }, [activeEntry]);

  // 无 diff 数据
  if (diffEntries.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-2">
        <GitBranch className="size-8" />
        <span className="text-sm">暂无代码变更</span>
        <span className="text-xs text-muted-foreground/70">
          Agent 执行代码修改后将在此显示
        </span>
      </div>
    );
  }

  // 详情视图
  if (activeEntry && activeDiffId) {
    const isBinary = isBinaryDiff(activeEntry.rawDiff);
    const lang = activeEntry.language || detectLanguage(activeEntry.fileName);
    const stats = computeStats(activeEntry.rawDiff);

    return (
      <div className="flex flex-col h-full">
        {/* 顶部导航 */}
        <div className="flex items-center gap-2 px-3 py-1.5 border-b border-border bg-muted/30">
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={() => setActiveDiff(null)}
            aria-label="返回列表"
          >
            <ChevronLeft className="size-3.5" />
          </Button>
          <span className="text-xs font-mono text-foreground truncate flex-1" title={activeEntry.fileName}>
            {activeEntry.fileName}
          </span>
          <span className="text-green-600 dark:text-green-400 text-xs font-mono">+{stats.additions}</span>
          <span className="text-red-600 dark:text-red-400 text-xs font-mono">-{stats.deletions}</span>
        </div>

        {/* 视图模式切换 */}
        {!isBinary && (
          <div className="flex items-center gap-1 px-2 py-1 border-b border-border">
            <Button
              variant={viewMode === 'unified' ? 'secondary' : 'ghost'}
              size="sm"
              className="h-6 px-2 text-xs"
              onClick={() => setViewMode('unified')}
            >
              Unified
            </Button>
            <Button
              variant={viewMode === 'split' ? 'secondary' : 'ghost'}
              size="sm"
              className="h-6 px-2 text-xs"
              onClick={() => setViewMode('split')}
            >
              Split
            </Button>
          </div>
        )}

        {/* Diff 内容 */}
        <div className="flex-1 overflow-auto min-h-0">
          {isBinary ? (
            <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
              二进制文件变更
            </div>
          ) : diffData ? (
            <DiffView
              data={{
                oldFile: {
                  fileName: activeEntry.fileName,
                  fileLang: lang,
                  content: diffData.oldContent,
                },
                newFile: {
                  fileName: activeEntry.fileName,
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
          ) : null}
        </div>
      </div>
    );
  }

  // 列表视图
  return (
    <div className="flex flex-col h-full">
      {/* 标题栏 */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-border bg-muted/30">
        <span className="text-xs text-muted-foreground">
          {diffEntries.length} 个变更
        </span>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          onClick={clearAll}
          aria-label="清空所有"
        >
          <Trash2 className="size-3.5" />
        </Button>
      </div>

      {/* Diff 列表 */}
      <div className="flex-1 overflow-auto min-h-0">
        {diffEntries.map(([id, entry]) => (
          <DiffListItem
            key={id}
            entry={entry}
            onClick={() => setActiveDiff(id)}
          />
        ))}
      </div>
    </div>
  );
}

/** Diff 列表项 */
function DiffListItem({ entry, onClick }: { entry: DiffEntry; onClick: () => void }) {
  const stats = useMemo(() => computeStats(entry.rawDiff), [entry.rawDiff]);
  const isBinary = isBinaryDiff(entry.rawDiff);

  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full flex items-center gap-2 px-3 py-2 hover:bg-muted/50 transition-colors text-left border-b border-border/50"
    >
      <GitBranch className="size-3.5 text-muted-foreground flex-shrink-0" />
      <span className="text-xs font-mono text-foreground truncate flex-1" title={entry.fileName}>
        {entry.fileName}
      </span>
      {isBinary ? (
        <span className="text-xs text-muted-foreground">二进制</span>
      ) : (
        <>
          <span className="text-green-600 dark:text-green-400 text-xs font-mono">+{stats.additions}</span>
          <span className="text-red-600 dark:text-red-400 text-xs font-mono">-{stats.deletions}</span>
        </>
      )}
    </button>
  );
}
