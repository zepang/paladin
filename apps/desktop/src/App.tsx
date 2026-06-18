import { ChatView } from '@/components/ChatView';
import { ConversationList } from '@/components/ConversationList';
import { Toaster } from '@/components/ui/sonner';
import { RightDrawer } from '@/components/layout/RightDrawer';
import { StatusBar } from '@/components/StatusBar';
import { Titlebar } from '@/components/Titlebar';
import { useAgentHealth } from '@/hooks/useAgentHealth';
import { initWindowEvents } from '@/stores/window';
import { useTerminalStore } from '@/stores/terminal';
import { HttpAgent } from '@ag-ui/client';
import { CopilotKitProvider, CopilotSidebar } from '@copilotkit/react-core/v2';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';

// 应用根组件
// 集成 CopilotKit 聊天、底部终端/Diff 面板、全局键盘快捷键
function App() {
  // CopilotSidebar 的 key 计数器 — 每次点击 ChatToggle 递增，强制重新挂载以同步开/关
  // 不使用 boolean state 同步，因为 CopilotSidebar 是内部管理开/关的非受控组件
  const [sidebarKey, setSidebarKey] = useState(0);

  // Agent 健康检查
  const { isOnline, isLoading, error, retry } = useAgentHealth();

  // 终端 store
  const togglePanel = useTerminalStore((s) => s.togglePanel);
  const setActivePanel = useTerminalStore((s) => s.setActivePanel);
  const isOpen = useTerminalStore((s) => s.isOpen);
  const activePanel = useTerminalStore((s) => s.activePanel);
  const tabs = useTerminalStore((s) => s.tabs);
  const addTab = useTerminalStore((s) => s.addTab);

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

  // ChatToggle 回调 — 递增 key 强制 CopilotSidebar 重新挂载以打开
  const toggleSidebar = useCallback(() => {
    setSidebarKey((prev) => prev + 1);
  }, []);

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
  const agUiAgent = useMemo(() => new HttpAgent({ url: 'http://localhost:9877/copilotkit' }), []);

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
        <Toaster position="bottom-center" />
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
          <aside className="w-64 border-r border-gray-200 dark:border-gray-700 flex-shrink-0 bg-gray-50 dark:bg-gray-800 overflow-hidden">
            <ConversationList />
          </aside>
          <div className="flex-1 flex items-center justify-center overflow-hidden min-w-0">
            <ChatView />
          </div>
          <RightDrawer />
        </div>
        {/* 底部状态栏 */}
        <StatusBar />
      </div>
      {sidebarKey > 0 && (
        <CopilotSidebar key={sidebarKey} defaultOpen={true} width={400} />
      )}
      <Toaster position="bottom-center" />
    </CopilotKitProvider>
  );
}

export default App;
