import { ChatView } from '@/components/ChatView';
import { ConversationList } from '@/components/ConversationList';
import { ErrorToast } from '@/components/ErrorToast';
import { BottomPanel } from '@/components/layout/BottomPanel';
import { StatusBar } from '@/components/StatusBar';
import { Titlebar } from '@/components/Titlebar';
import { useAgentHealth } from '@/hooks/useAgentHealth';
import { initWindowEvents } from '@/stores/window';
import { useTerminalStore } from '@/stores/terminal';
import { HttpAgent } from '@ag-ui/client';
import { CopilotKitProvider, CopilotSidebar } from '@copilotkit/react-core/v2';
import { useCallback, useEffect, useMemo, useState } from 'react';

// 应用根组件
// 集成 CopilotKit 聊天、底部终端/Diff 面板、全局键盘快捷键
function App() {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Agent 健康检查
  const { isOnline, isLoading, error, retry } = useAgentHealth();

  // 终端 store
  const togglePanel = useTerminalStore((s) => s.togglePanel);
  const setActivePanel = useTerminalStore((s) => s.setActivePanel);
  const isOpen = useTerminalStore((s) => s.isOpen);

  useEffect(() => {
    initWindowEvents();
  }, []);

  // ChatToggle 回调 — 切换侧边栏开关状态
  const toggleSidebar = useCallback(() => {
    setSidebarOpen((prev) => !prev);
  }, []);

  // 终端切换回调
  const handleToggleTerminal = useCallback(() => {
    togglePanel();
  }, [togglePanel]);

  // Diff 面板切换回调
  const handleToggleDiff = useCallback(() => {
    if (!isOpen) {
      togglePanel();
    }
    setActivePanel('diff');
  }, [isOpen, togglePanel, setActivePanel]);

  // 全局键盘快捷键
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // 终端聚焦时不拦截快捷键 — 所有按键发送给 PTY
      const isTerminalFocused = document.activeElement?.closest('.xterm-helper-textarea');
      if (isTerminalFocused) return;

      // Ctrl+` 切换终端面板
      if (e.ctrlKey && e.key === '`') {
        e.preventDefault();
        setActivePanel('terminal');
        togglePanel();
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
  }, [togglePanel, setActivePanel, handleToggleDiff]);

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
    },
    [],
  );

  // AG-UI HttpAgent — 直连 Pydantic AI 端点
  const agUiAgent = useMemo(
    () => new HttpAgent({ url: 'http://localhost:9877/copilotkit' }),
    [],
  );

  // 加载状态
  if (isLoading) {
    return (
      <div className="flex flex-col h-screen bg-white dark:bg-gray-900 items-center justify-center">
        <div className="text-gray-500 dark:text-gray-400">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mb-4" />
          <p>正在连接到 Agent...</p>
        </div>
      </div>
    );
  }

  // Agent 未在线
  if (!isOnline) {
    return (
      <div className="flex flex-col h-screen bg-white dark:bg-gray-900">
        <Titlebar
          onToggleChat={toggleSidebar}
          onToggleTerminal={handleToggleTerminal}
          onToggleDiff={handleToggleDiff}
        />
        <main className="flex-1 flex items-center justify-center">
          <div className="text-center p-8">
            <div className="text-6xl mb-4">🤖</div>
            <h2 className="text-2xl font-bold text-gray-800 dark:text-gray-100 mb-2">
              Agent 服务未启动
            </h2>
            <p className="text-gray-500 dark:text-gray-400 mb-6">
              {error || '请先启动 Agent 服务'}
            </p>
            <button
              onClick={retry}
              className="bg-blue-500 hover:bg-blue-600 text-white px-6 py-2 rounded-lg font-medium transition-colors"
            >
              重试连接
            </button>
          </div>
        </main>
        <StatusBar />
        <ErrorToast message={error || 'Agent 服务未启动'} type="warning" onRetry={retry} />
      </div>
    );
  }

  // 正常聊天界面 + 终端面板
  return (
    <CopilotKitProvider
      runtimeUrl="http://localhost:9877/copilotkit"
      agents__unsafe_dev_only={{ default: agUiAgent }}
      onError={handleCopilotError}
      showDevConsole={import.meta.env.DEV}
    >
      <div className="flex flex-col h-screen bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100">
        <Titlebar
          onToggleChat={toggleSidebar}
          onToggleTerminal={handleToggleTerminal}
          onToggleDiff={handleToggleDiff}
        />
        <div className="flex-1 flex overflow-hidden">
          {/* 对话列表侧边栏 */}
          <aside className="w-64 border-r border-gray-200 dark:border-gray-700 flex-shrink-0 bg-gray-50 dark:bg-gray-800 overflow-hidden">
            <ConversationList />
          </aside>
          {/* 主内容区域：聊天 + 终端面板 */}
          <div className="flex-1 flex flex-col min-w-0">
            <div className="flex-1 flex items-center justify-center overflow-hidden">
              <ChatView />
            </div>
            {/* 底部终端/Diff 面板 */}
            <BottomPanel />
          </div>
        </div>
        {/* 底部状态栏 */}
        <StatusBar />
      </div>
      <CopilotSidebar key={sidebarOpen ? 'open' : 'closed'} defaultOpen={sidebarOpen} width={400} />
    </CopilotKitProvider>
  );
}

export default App;
