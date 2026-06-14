import { CopilotKitProvider, CopilotSidebar } from '@copilotkit/react-core/v2';
import { Titlebar } from '@/components/Titlebar';
import { ChatView } from '@/components/ChatView';
import { ConversationList } from '@/components/ConversationList';
import { initWindowEvents } from '@/stores/window';
import { useEffect, useState, useCallback } from 'react';

/**
 * 应用根组件
 * CopilotKitProvider 包裹整个应用，提供聊天上下文的 React hooks
 * CopilotSidebar 提供可折叠的聊天侧边栏（Phase 2 使用占位 runtimeUrl）
 * sidebarOpen + key 机制强制 CopilotSidebar 重新挂载以响应外部开关
 */
function App() {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    initWindowEvents();
  }, []);

  // ChatToggle 回调 — 切换侧边栏开关状态
  const toggleSidebar = useCallback(() => {
    setSidebarOpen((prev) => !prev);
  }, []);

  return (
    <CopilotKitProvider runtimeUrl="http://localhost:9876/copilotkit">
      <div className="flex flex-col h-screen bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100">
        <Titlebar onToggleChat={toggleSidebar} />
        <main className="flex-1 flex overflow-hidden">
          {/* 对话列表侧边栏 */}
          <aside className="w-64 border-r border-gray-200 dark:border-gray-700 flex-shrink-0 bg-gray-50 dark:bg-gray-850 overflow-hidden">
            <ConversationList />
          </aside>
          {/* 主内容区域 */}
          <div className="flex-1 flex items-center justify-center">
            <ChatView />
          </div>
        </main>
      </div>
      <CopilotSidebar
        key={sidebarOpen ? 'open' : 'closed'}
        defaultOpen={sidebarOpen}
        width={400}
      />
    </CopilotKitProvider>
  );
}

export default App;
