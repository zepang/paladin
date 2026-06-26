import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { TerminalPanel } from '@/components/terminal/TerminalPanel';
import { TerminalTabBar } from '@/components/terminal/TerminalTabBar';
import { useTerminalStore } from '@/stores/terminal';
import { Channel, invoke } from '@tauri-apps/api/core';
import { useEffect, useMemo, useRef } from 'react';

// 右侧面板容器 — 终端 + Diff 可切换面板
// 使用 shadcn Sheet 组件，modal={false} 避免拦截终端键盘输入

export function RightDrawer() {
  const isOpen = useTerminalStore((s) => s.isOpen);
  const activePanel = useTerminalStore((s) => s.activePanel);
  const activeTabId = useTerminalStore((s) => s.activeTabId);
  const setTerminalRunning = useTerminalStore((s) => s.setTerminalRunning);
  const closePanel = useTerminalStore((s) => s.closePanel);

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
    <Sheet
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) closePanel();
      }}
      modal={false}
    >
      <SheetContent side="right" className="w-[400px] sm:max-w-[600px] p-0 flex flex-col">
        <SheetHeader className="px-3 py-2 border-b border-border">
          <SheetTitle className="text-xs font-medium">
            {activePanel === 'terminal' ? '终端' : '代码变更'}
          </SheetTitle>
        </SheetHeader>
        <div className="flex-1 flex flex-col min-h-0">
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
              <div className="flex items-center justify-center h-full text-muted-foreground text-sm p-4 text-center">
                Diff 面板 — 在聊天消息中查看代码变更
              </div>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
