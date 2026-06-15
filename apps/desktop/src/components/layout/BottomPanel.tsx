import { ResizeHandle } from '@/components/layout/ResizeHandle';
import { TerminalPanel } from '@/components/terminal/TerminalPanel';
import { TerminalTabBar } from '@/components/terminal/TerminalTabBar';
import { useTerminalStore } from '@/stores/terminal';
import { Channel, invoke } from '@tauri-apps/api/core';
import { useEffect, useMemo, useRef } from 'react';

// 底部面板容器 — 终端 + Diff 可切换面板
// 200ms ease-in-out 滑动动画，聊天区域自动收缩

export function BottomPanel() {
  const isOpen = useTerminalStore((s) => s.isOpen);
  const panelHeight = useTerminalStore((s) => s.panelHeight);
  const activePanel = useTerminalStore((s) => s.activePanel);
  const tabs = useTerminalStore((s) => s.tabs);
  const activeTabId = useTerminalStore((s) => s.activeTabId);
  const addTab = useTerminalStore((s) => s.addTab);
  const setTerminalRunning = useTerminalStore((s) => s.setTerminalRunning);

  // 面板打开时自动聚焦终端
  const isJustOpened = useRef(false);
  useEffect(() => {
    if (isOpen && !isJustOpened.current) {
      isJustOpened.current = true;
      // 聚焦 xterm 的隐藏 textarea
      setTimeout(() => {
        const textarea = document.querySelector('.xterm-helper-textarea') as HTMLTextAreaElement;
        textarea?.focus();
      }, 100);
    }
    if (!isOpen) {
      isJustOpened.current = false;
    }
  }, [isOpen]);

  // 自动打开首个 Tab（当 tabs 非空且无活跃 Tab 时创建首个终端）
  useEffect(() => {
    if (isOpen && tabs.length === 0 && activePanel === 'terminal') {
      const id = `term-${Date.now()}`;
      addTab({ id, title: 'zsh', cwd: '' });
    }
  }, [isOpen, tabs.length, activePanel, addTab]);

  // 活跃 Tab 的 Channel 管理
  const channelRef = useRef<Channel<Uint8Array> | null>(null);
  const channel = useMemo(() => {
    const ch = new Channel<Uint8Array>();
    channelRef.current = ch;
    return ch;
  }, [activeTabId]);

  // spawn PTY 当首次获得活跃 Tab
  const spawnedRefs = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!activeTabId || spawnedRefs.current.has(activeTabId)) return;
    spawnedRefs.current.add(activeTabId);

    if (channelRef.current) {
      invoke('spawn_terminal', { channel: channelRef.current })
        .then(() => {
          setTerminalRunning(true);
        })
        .catch((e: Error) => {
          console.error('[BottomPanel] spawn_terminal 失败:', e);
          setTerminalRunning(false);
        });
    }
  }, [activeTabId, setTerminalRunning]);

  // 面板关闭时标记所有 PTY 未 spawned（不杀掉进程）
  useEffect(() => {
    if (!isOpen) {
      spawnedRefs.current.clear();
    }
  }, [isOpen]);

  return (
    <div
      className="flex flex-col flex-shrink-0 border-t border-gray-300 dark:border-gray-700"
      style={{
        height: isOpen ? `${panelHeight}px` : '0px',
        overflow: 'hidden',
        transition: 'height 200ms ease-in-out',
      }}
    >
      <ResizeHandle />

      {/* 面板内容 */}
      <div className="flex-1 flex flex-col min-h-0">
        {/* Tab 栏：终端模式下显示 */}
        {activePanel === 'terminal' && <TerminalTabBar />}

        {/* 面板主体 */}
        <div className="flex-1 min-h-0">
          {activePanel === 'terminal' && activeTabId && (
            <TerminalPanel
              key={activeTabId}
              terminalId={activeTabId}
              channel={channel}
              onClose={() => {
                // 关闭 Tab 由 store 处理
                const { removeTab } = useTerminalStore.getState();
                if (activeTabId) {
                  invoke('close_terminal', { id: activeTabId }).catch(() => {});
                  removeTab(activeTabId);
                }
              }}
            />
          )}

          {activePanel === 'diff' && (
            <div className="flex items-center justify-center h-full text-gray-500 dark:text-gray-400 text-sm">
              Diff 面板 — 在聊天消息中查看代码变更
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
