import { ResizeHandle } from '@/components/layout/ResizeHandle';
import { TerminalPanel } from '@/components/terminal/TerminalPanel';
import { TerminalTabBar } from '@/components/terminal/TerminalTabBar';
import { useTerminalStore } from '@/stores/terminal';
import { Channel, invoke } from '@tauri-apps/api/core';
import { useEffect, useMemo, useRef } from 'react';

// 右侧面板容器 — 终端 + Diff 可切换面板

export function RightDrawer() {
  const isOpen = useTerminalStore((s) => s.isOpen);
  const panelWidth = useTerminalStore((s) => s.panelWidth);
  const activePanel = useTerminalStore((s) => s.activePanel);
  const tabs = useTerminalStore((s) => s.tabs);
  const activeTabId = useTerminalStore((s) => s.activeTabId);
  const addTab = useTerminalStore((s) => s.addTab);
  const setTerminalRunning = useTerminalStore((s) => s.setTerminalRunning);

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

  useEffect(() => {
    if (isOpen && tabs.length === 0 && activePanel === 'terminal') {
      const id = `term-${Date.now()}`;
      addTab({ id, title: 'zsh', cwd: '' });
    }
  }, [isOpen, tabs.length, activePanel, addTab]);

  const channelRef = useRef<Channel<Uint8Array> | null>(null);
  const channel = useMemo(() => {
    const ch = new Channel<Uint8Array>();
    channelRef.current = ch;
    return ch;
  }, [activeTabId]);

  const spawnedRefs = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!activeTabId || spawnedRefs.current.has(activeTabId)) return;
    spawnedRefs.current.add(activeTabId);

    if (channelRef.current) {
      invoke('spawn_terminal', { id: activeTabId, channel: channelRef.current })
        .then(() => {
          setTerminalRunning(true);
        })
        .catch((e: Error) => {
          console.error('[RightDrawer] spawn_terminal 失败:', e);
          spawnedRefs.current.delete(activeTabId);
          setTerminalRunning(false);
        });
    }
  }, [activeTabId, setTerminalRunning]);

  const handleCloseTab = (tabId: string) => {
    invoke('close_terminal', { id: tabId }).catch(() => {});
    spawnedRefs.current.delete(tabId);
    useTerminalStore.getState().removeTab(tabId);
    if (spawnedRefs.current.size === 0) {
      setTerminalRunning(false);
    }
  };

  return (
    <div
      className="flex flex-shrink-0 border-l border-gray-300 dark:border-gray-700 overflow-hidden"
      style={{
        width: isOpen ? `${panelWidth}px` : '0px',
        transition: 'width 200ms ease-in-out',
      }}
    >
      {isOpen && (
        <>
          <ResizeHandle />
          <div className="flex-1 flex flex-col min-w-0">
            {activePanel === 'terminal' && <TerminalTabBar onCloseTab={handleCloseTab} />}

            <div className="flex-1 min-h-0">
              {activePanel === 'terminal' && activeTabId && (
                <TerminalPanel
                  key={activeTabId}
                  terminalId={activeTabId}
                  channel={channel}
                  onClose={() => handleCloseTab(activeTabId)}
                />
              )}

              {activePanel === 'diff' && (
                <div className="flex items-center justify-center h-full text-gray-500 dark:text-gray-400 text-sm p-4 text-center">
                  Diff 面板 — 在聊天消息中查看代码变更
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
