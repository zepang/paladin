/**
 * 应用根组件
 * 三栏布局：折叠侧边栏 + 对话区域 + 右侧面板
 * 集成 CopilotKit 聊天、底部终端/Diff 面板、全局键盘快捷键
 */
import { ChatArea } from '@/components/ChatArea';
import { ConversationList } from '@/components/ConversationList';
import { SidebarToggle } from '@/components/SidebarToggle';
import { StartupMask } from '@/components/StartupMask';
import { StatusBar } from '@/components/StatusBar';
import { Titlebar } from '@/components/Titlebar';
import { RightPanel } from '@/components/layout/RightPanel';
import { Toaster } from '@/components/ui/sonner';
import { useProcessStatus } from '@/stores/process';
import { useTerminalStore } from '@/stores/terminal';
import { WIDTH_CONFIG, getBreakpoint, useUIStore } from '@/stores/ui';
import { initWindowEvents } from '@/stores/window';
import { HttpAgent } from '@ag-ui/client';
import { CopilotKitProvider } from '@copilotkit/react-core/v2';
import { invoke } from '@tauri-apps/api/core';
import { useCallback, useEffect, useMemo, useState } from 'react';
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

  // Agent 进程状态 (来自 supervisor emit process-status, plan 07.3-07)
  const agentStatus = useProcessStatus('agent');
  const agentState = agentStatus.state;

  // 运行时配置 — D-07 单一 Rust URL 真相源
  // 字段名 snake_case 对齐 Rust serde (RuntimeConfig { agent_url, server_url })
  const [runtimeConfig, setRuntimeConfig] = useState<{
    agent_url: string;
    server_url: string;
  } | null>(null);

  useEffect(() => {
    invoke<{ agent_url: string; server_url: string }>('get_runtime_config')
      .then(setRuntimeConfig)
      .catch((e) => {
        // SPEC Edge R8: 配置缺失 → 默认值 + console 警告 (业务代码 0 硬编码命中)
        console.warn('[runtime] 配置加载失败，回退默认 http://localhost:9876', e);
        setRuntimeConfig({
          agent_url: 'http://localhost:9876', // fallback default SPEC Edge R8
          server_url: 'http://localhost:9880', // fallback default SPEC Edge R8
        });
      });
  }, []);

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

  // Agent 异常/停止时显示警告 toast（带重启按钮）— agentStatus 驱动
  useEffect(() => {
    if (agentState !== 'running' && agentState !== 'starting' && agentStatus.last_error) {
      const command = agentStatus.owner === 'external' || agentState === 'conflict'
        ? 'redetect_agent'
        : 'restart_agent';
      toast.warning(agentStatus.last_error, {
        action: {
          label: command === 'redetect_agent' ? '重新检测' : '重启',
          onClick: () => {
            invoke(command).catch(() => {});
          },
        },
      });
    }
  }, [agentState, agentStatus.last_error, agentStatus.owner]);

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

  // AG-UI HttpAgent — 直连 Pydantic AI 端点 (D-07 runtimeConfig 驱动)
  const agUiAgent = useMemo(
    () => runtimeConfig && new HttpAgent({ url: `${runtimeConfig.agent_url}/copilotkit` }),
    [runtimeConfig]
  );

  // runtimeConfig 加载中 — 全屏 spinner (D-07 首次 invoke get_runtime_config)
  if (!runtimeConfig) {
    return (
      <div className="flex flex-col h-screen bg-background items-center justify-center">
        <div className="text-muted-foreground">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mb-4" />
          <p>正在加载运行时配置...</p>
        </div>
      </div>
    );
  }

  // D-05: Agent 状态 !== 'running' 时不 mount CopilotKitProvider (避免 offline fetch 卡死)
  // D-08: 遮罩生命周期对称 — starting/unhealthy/degraded/stopped 都常驻遮罩
  // D-10: StatusBar 始终渲染,状态灯永远可见
  if (agentState !== 'running') {
    return (
      <div className="flex flex-col h-screen bg-background">
        <Titlebar
          onToggleChat={handleToggleChat}
          onToggleTerminal={handleToggleTerminal}
          onToggleDiff={handleToggleDiff}
        />
        <main className="flex-1">
          <StartupMask
            agentState={agentState}
            owner={agentStatus.owner}
            health={agentStatus.health}
            error={agentStatus.last_error}
            stderrTail={agentStatus.stderr_tail}
            onRestart={() => {
              invoke('restart_agent').catch(() => {});
            }}
            onRedetect={() => {
              invoke('redetect_agent').catch(() => {});
            }}
          />
        </main>
        <StatusBar />
        <Toaster position="bottom-center" />
      </div>
    );
  }

  // 正常聊天界面 — 三栏布局
  return (
    <CopilotKitProvider
      runtimeUrl={`${runtimeConfig.agent_url}/copilotkit`}
      agents__unsafe_dev_only={{ default: agUiAgent as HttpAgent }}
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
            // 抽屉模式（<1440px）— fixed 浮层，不挤压空间，不被裁剪
            sidebarDrawerOpen && (
              <>
                {/* 遮罩 — 覆盖整个窗口 */}
                <div
                  className="fixed inset-0 bg-black/20 z-40"
                  onClick={() => setSidebarDrawerOpen(false)}
                />
                {/* 抽屉 — fixed 定位脱离父容器，高 z-index 确保在最上层 */}
                <aside
                  className="fixed left-0 top-9 bottom-7 z-50 bg-background border-r border-border overflow-y-auto shadow-xl"
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
            <SidebarToggle onClick={sidebarDrawerMode ? toggleSidebarDrawer : toggleSidebar} />
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
        <Toaster position="bottom-center" />
      </div>
    </CopilotKitProvider>
  );
}

export default App;
