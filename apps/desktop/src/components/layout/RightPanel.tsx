/**
 * 右侧多视图面板
 * 固定面板（替代 Sheet 浮层），支持终端/文件预览/Diff 审查三种视图
 * 可拖拽调整宽度，可隐藏/显示
 */
import { DiffReview } from '@/components/panel/DiffReview';
import { FilePreview } from '@/components/panel/FilePreview';
import { LogsPanel } from '@/components/panel/LogsPanel';
import { AiProviderPanel } from '@/components/provider/AiProviderPanel';
import { TerminalPanel } from '@/components/terminal/TerminalPanel';
import { TerminalTabBar } from '@/components/terminal/TerminalTabBar';
import { Button } from '@/components/ui/button';
import { type RightPanelId, useTerminalStore } from '@/stores/terminal';
import { Channel, invoke } from '@tauri-apps/api/core';
import {
  BrainCircuit,
  FileCode,
  GitBranch,
  Maximize2,
  Minimize2,
  ScrollText,
  Terminal as TerminalIcon,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef } from 'react';

export function RightPanel() {
  const isOpen = useTerminalStore((s) => s.isOpen);
  const isFullscreen = useTerminalStore((s) => s.isFullscreen);
  const toggleFullscreen = useTerminalStore((s) => s.toggleFullscreen);
  const activePanel = useTerminalStore((s) => s.activePanel);
  const panelWidth = useTerminalStore((s) => s.panelWidth);
  const setPanelWidth = useTerminalStore((s) => s.setPanelWidth);
  const activeTabId = useTerminalStore((s) => s.activeTabId);
  const setTerminalRunning = useTerminalStore((s) => s.setTerminalRunning);
  const closePanel = useTerminalStore((s) => s.closePanel);
  const setActivePanel = useTerminalStore((s) => s.setActivePanel);

  // 终端 PTY 逻辑（从 RightDrawer 迁移）
  const channelRef = useRef<Channel<Uint8Array> | null>(null);
  const channel = useMemo(() => {
    const ch = new Channel<Uint8Array>();
    channelRef.current = ch;
    return ch;
  }, [activeTabId]);

  const spawnedRefs = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (activePanel !== 'terminal') return;
    if (!activeTabId || spawnedRefs.current.has(activeTabId)) return;
    spawnedRefs.current.add(activeTabId);

    if (channelRef.current) {
      invoke('spawn_terminal', { id: activeTabId, channel: channelRef.current })
        .then(() => {
          setTerminalRunning(true);
        })
        .catch((e: Error) => {
          console.error('[RightPanel] spawn_terminal 失败:', e);
          spawnedRefs.current.delete(activeTabId);
          setTerminalRunning(false);
        });
    }
  }, [activePanel, activeTabId, setTerminalRunning]);

  // 终端聚焦
  const isJustOpened = useRef(false);
  useEffect(() => {
    if (isOpen && !isJustOpened.current) {
      isJustOpened.current = true;
      setTimeout(() => {
        const textarea = document.querySelector('.xterm-helper-textarea') as HTMLTextAreaElement;
        textarea?.focus();
      }, 100);
    }
    if (!isOpen) {
      isJustOpened.current = false;
    }
  }, [isOpen]);

  const handleCloseTab = useCallback(
    (tabId: string) => {
      invoke('close_terminal', { id: tabId }).catch(() => {});
      spawnedRefs.current.delete(tabId);
      useTerminalStore.getState().removeTab(tabId);
      if (spawnedRefs.current.size === 0) {
        setTerminalRunning(false);
      }
    },
    [setTerminalRunning]
  );

  // 拖拽调整宽度
  const isResizing = useRef(false);
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      isResizing.current = true;
      const startX = e.clientX;
      const startWidth = panelWidth;

      const handleMouseMove = (moveEvent: MouseEvent) => {
        if (!isResizing.current) return;
        // 向左拖增大宽度
        const delta = startX - moveEvent.clientX;
        setPanelWidth(startWidth + delta);
      };

      const handleMouseUp = () => {
        isResizing.current = false;
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      };

      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    },
    [panelWidth, setPanelWidth]
  );

  // 面板隐藏时不渲染
  if (!isOpen) return null;

  const tabs: Array<{ id: RightPanelId; icon: typeof TerminalIcon; label: string }> = [
    { id: 'terminal', icon: TerminalIcon, label: '终端' },
    { id: 'file-preview', icon: FileCode, label: '文件' },
    { id: 'diff', icon: GitBranch, label: 'Diff' },
    { id: 'logs', icon: ScrollText, label: '日志' },
    { id: 'ai-provider', icon: BrainCircuit, label: 'AI Provider' },
  ];

  return (
    <>
      {/* 拖拽 handle（全屏时隐藏） */}
      {!isFullscreen && (
        <div
          className="w-1 cursor-col-resize bg-transparent hover:bg-border transition-colors flex-shrink-0"
          onMouseDown={handleMouseDown}
        />
      )}

      <aside
        className="border-l border-border flex-shrink-0 bg-background flex flex-col overflow-hidden"
        style={{ width: isFullscreen ? '100%' : `${panelWidth}px` }}
      >
        {/* Tab 切换栏 */}
        <div className="flex items-center justify-between border-b border-border px-1 h-9">
          <div className="flex items-center gap-0.5">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = activePanel === tab.id;
              return (
                <Button
                  key={tab.id}
                  variant={isActive ? 'secondary' : 'ghost'}
                  size="sm"
                  onClick={() => setActivePanel(tab.id)}
                  className="h-7 px-2 text-xs gap-1"
                  title={tab.label}
                >
                  <Icon className="size-3.5" />
                  <span className="hidden sm:inline">{tab.label}</span>
                </Button>
              );
            })}
          </div>
          <div className="flex items-center gap-0.5">
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleFullscreen}
              className="h-7 w-7"
              aria-label={isFullscreen ? '退出全屏' : '全屏'}
              title={isFullscreen ? '退出全屏' : '全屏'}
            >
              {isFullscreen ? (
                <Minimize2 className="size-3.5" />
              ) : (
                <Maximize2 className="size-3.5" />
              )}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={closePanel}
              className="h-7 w-7"
              aria-label="关闭面板"
            >
              <X className="size-3.5" />
            </Button>
          </div>
        </div>

        {/* 内容区域 */}
        <div className="flex-1 flex flex-col min-h-0">
          {/* 终端视图 */}
          {activePanel === 'terminal' && (
            <>
              <TerminalTabBar onCloseTab={handleCloseTab} />
              <div className="flex-1 min-h-0">
                {activeTabId && (
                  <TerminalPanel
                    key={activeTabId}
                    terminalId={activeTabId}
                    channel={channel}
                    onClose={() => handleCloseTab(activeTabId)}
                  />
                )}
              </div>
            </>
          )}

          {/* 文件预览视图 */}
          {activePanel === 'file-preview' && <FilePreview />}

          {/* Diff 审查视图 */}
          {activePanel === 'diff' && <DiffReview />}

          {/* 日志视图 */}
          {activePanel === 'logs' && <LogsPanel />}

          {/* AI Provider 设置视图 */}
          {activePanel === 'ai-provider' && <AiProviderPanel />}
        </div>
      </aside>
    </>
  );
}
