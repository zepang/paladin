/**
 * 应用根组件
 * 三栏布局：折叠侧边栏 + 对话区域 + 右侧面板
 * 集成 CopilotKit 聊天、底部终端/Diff 面板、全局键盘快捷键
 */
import { ChatArea } from '@/components/ChatArea';
import { ConversationList } from '@/components/ConversationList';
import { SidebarToggle } from '@/components/SidebarToggle';
import { StatusBar } from '@/components/StatusBar';
import { Titlebar } from '@/components/Titlebar';
import { RightPanel } from '@/components/layout/RightPanel';
import { Button } from '@/components/ui/button';
import { Toaster } from '@/components/ui/sonner';
import { useAgentHealth } from '@/hooks/useAgentHealth';
import { useTerminalStore } from '@/stores/terminal';
import { getBreakpoint, useUIStore, WIDTH_CONFIG } from '@/stores/ui';
import { initWindowEvents } from '@/stores/window';
import { HttpAgent } from '@ag-ui/client';
import { CopilotKitProvider } from '@copilotkit/react-core/v2';
import { useCallback, useEffect, useMemo } from 'react';
import { toast } from 'sonner';

function App() {
  // 侧边栏折叠状态
  const sidebarCollapsed = useUIStore((s) => s.sidebarCollapsed);
  const toggleSidebar = useUIStore((s) => s.toggleSidebar);
  const sidebarDrawerMode = useUIStore((s) => s.sidebarDrawerMode);
  const sidebarDrawerOpen = useUIStore((s) => s.sidebarDrawerOpen);
  const toggleSidebarDrawer = useUIStore((s) => s.toggleSidebarDrawer);
  const setSidebarDrawerOpen = useUIStore((s) => s.setSidebarDrawerOpen);
  const setBreakpoint = useUIStore((s) => s.setBreakpoint);
  const breakpoint = useUIStore((s) => s.breakpoint);

  // Agent 健康检查
  const { isOnline, isLoading, error, retry } = useAgentHealth();

  // 终端 store
  const togglePanel = useTerminalStore((s) => s.togglePanel);
  const setActivePanel = useTerminalStore((s) => s.setActivePanel);
  const isOpen = useTerminalStore((s) => s.isOpen);
  const isFullscreen = useTerminalStore((s) => s.isFullscreen);
  const activePanel = useTerminalStore((s) => s.activePanel);
  const tabs = useTerminalStore((s) => s.tabs);
  const addTab = useTerminalStore((s) => s.addTab);

  // 响应式断点检测
  useEffect(() => {
    const updateBreakpoint = () => setBreakpoint(getBreakpoint(window.innerWidth));
    updateBreakpoint();
    window.addEventListener('resize', updateBreakpoint);
    return () => window.removeEventListener('resize', updateBreakpoint);
  }, [setBreakpoint]);

  const widths = WIDTH_CONFIG[breakpoint];

  // 统一的侧边栏切换 — 根据模式选择
  const handleToggleChat = useCallback(() => {
    if (sidebarDrawerMode) {
      toggleSidebarDrawer();
    } else {
      toggleSidebar();
    }
  }, [sidebarDrawerMode, toggleSidebarDrawer, toggleSidebar]);

  useEffect(() => {
    initWindowEvents();
  }, []);

  // 未连接时显示警告 toast（带重试按钮）
  useEffect(() => {
    if (!isOnline && !isLoading && error) {
      toast.warning(error || 'Agent 服务未启动', {
        action: { label: '重试', onClick: () => retry() },
      });
    }
  }, [isOnline, isLoading, error, retry]);

  // 终端切换回调 — 三态：关闭→打开终端 / diff面板→切换到终端 / 终端面板→关闭
  // 打开终端前先创建 Tab，避免 useEffect 延迟导致的 1-2 秒空白
  const handleToggleTerminal = useCallback(() => {
    if (!isOpen) {
      if (tabs.length === 0) {
        const id = `term-${Date.now()}`;
        addTab({ id, title: 'zsh', cwd: '' });
      }
      setActivePanel('terminal');
      togglePanel();
    } else if (activePanel !== 'terminal') {
      setActivePanel('terminal');
    } else {
      togglePanel();
    }
  }, [isOpen, activePanel, tabs.length, togglePanel, setActivePanel, addTab]);

  // Diff 面板切换回调 — 三态：关闭→打开diff / 终端面板→切换到diff / diff面板→关闭
  const handleToggleDiff = useCallback(() => {
    if (!isOpen) {
      setActivePanel('diff');
      togglePanel();
    } else if (activePanel !== 'diff') {
      setActivePanel('diff');
    } else {
      togglePanel();
    }
  }, [isOpen, activePanel, togglePanel, setActivePanel]);

  // 全局键盘快捷键
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // 终端聚焦时不拦截快捷键 — 所有按键发送给 PTY
      const isTerminalFocused = document.activeElement?.closest('.xterm-helper-textarea');
      if (isTerminalFocused) return;

      // Ctrl+` 切换终端面板
      if (e.ctrlKey && e.key === '`') {
        e.preventDefault();
        handleToggleTerminal();
        return;
      }

      // Ctrl+Shift+D 打开 Diff 面板
      if (e.ctrlKey && e.shiftKey && e.key === 'D') {
        e.preventDefault();
        handleToggleDiff();
        return;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleToggleTerminal, handleToggleDiff]);

  // CopilotKit 错误处理回调
  const handleCopilotError = useCallback(
    (event: { code: string; error: Error; context?: Record<string, unknown> }) => {
      const errorMessages: Record<string, string> = {
        runtime_info_fetch_failed: '无法连接到 Agent 服务',
        agent_connect_failed: 'Agent 连接失败，请检查服务状态',
        agent_run_failed: 'Agent 运行失败',
        agent_run_error_event: 'Agent 内部错误',
        tool_argument_parse_failed: '工具参数解析错误',
        tool_handler_failed: '工具执行失败',
      };
      const friendly = errorMessages[event.code] || event.error.message;
      console.error(`[CopilotKit ${event.code}]`, friendly, event.error);
      toast.error(friendly);
    },
    []
  );

  // AG-UI HttpAgent — 直连 Pydantic AI 端点
  const agUiAgent = useMemo(() => new HttpAgent({ url: 'http://localhost:9876/copilotkit' }), []);

  // 加载状态
  if (isLoading) {
    return (
      <div className="flex flex-col h-screen bg-background items-center justify-center">
        <div className="text-muted-foreground">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mb-4" />
          <p>正在连接到 Agent...</p>
        </div>
      </div>
    );
  }

  // Agent 未在线
  if (!isOnline) {
    return (
      <div className="flex flex-col h-screen bg-background">
        <Titlebar
          onToggleChat={handleToggleChat}
          onToggleTerminal={handleToggleTerminal}
          onToggleDiff={handleToggleDiff}
        />
        <main className="flex-1 flex items-center justify-center">
          <div className="text-center p-8">
            <div className="text-6xl mb-4">🤖</div>
            <h2 className="text-2xl font-bold text-foreground mb-2">Agent 服务未启动</h2>
            <p className="text-muted-foreground mb-6">{error || '请先启动 Agent 服务'}</p>
            <Button onClick={retry}>重试连接</Button>
          </div>
        </main>
        <StatusBar />
        <Toaster position="bottom-center" />
      </div>
    );
  }

  // 正常聊天界面 — 三栏布局
  return (
    <CopilotKitProvider
      runtimeUrl="http://localhost:9876/copilotkit"
      agents__unsafe_dev_only={{ default: agUiAgent }}
      onError={handleCopilotError}
      showDevConsole={import.meta.env.DEV}
    >
      <div className="flex flex-col h-screen bg-background text-foreground">
        <Titlebar
          onToggleChat={handleToggleChat}
          onToggleTerminal={handleToggleTerminal}
          onToggleDiff={handleToggleDiff}
        />
        <div className="flex-1 flex overflow-hidden relative">
          {/* 左侧：对话列表 */}
          {sidebarDrawerMode ? (
            // 抽屉模式（<1440px）— 浮层，不挤压空间
            sidebarDrawerOpen && (
              <>
                {/* 遮罩 */}
                <div
                  className="absolute inset-0 bg-black/20 z-20"
                  onClick={() => setSidebarDrawerOpen(false)}
                />
                <aside
                  className="absolute left-0 top-0 bottom-0 z-30 bg-muted/50 border-r border-border overflow-hidden shadow-lg"
                  style={{ width: `${widths.sidebar}px` }}
                >
                  <ConversationList />
                </aside>
              </>
            )
          ) : (
            // 正常模式 — 占据空间
            <aside
              className="border-r border-border flex-shrink-0 bg-muted/50 overflow-hidden transition-all duration-200"
              style={{
                width: sidebarCollapsed ? 0 : `${widths.sidebar}px`,
                minWidth: sidebarCollapsed ? 0 : `${widths.sidebar}px`,
              }}
            >
              <ConversationList />
            </aside>
          )}

          {/* 折叠/抽屉模式下的展开按钮 */}
          {(sidebarCollapsed || sidebarDrawerMode) && !sidebarDrawerOpen && (
            <SidebarToggle
              onClick={sidebarDrawerMode ? toggleSidebarDrawer : toggleSidebar}
            />
          )}

          {/* 中间：对话区域（全屏时隐藏） */}
          {!isFullscreen && (
            <div
              className="flex-1 flex overflow-hidden min-w-0 relative"
              style={{ minWidth: `${widths.chat}px` }}
            >
              <ChatArea />
            </div>
          )}

          {/* 最右：多视图面板（终端/文件/Diff） */}
          <RightPanel />
        </div>
        {/* 底部状态栏 */}
        <StatusBar />
      </div>
      <Toaster position="bottom-center" />
    </CopilotKitProvider>
  );
}

export default App;
