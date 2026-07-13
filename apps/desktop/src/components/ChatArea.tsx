/**
 * 对话区域容器
 * 用 CopilotKit v2 CopilotChat + 内嵌审批卡片
 * ApprovalCard 使用 sticky 定位固定在消息区域底部，随消息流自然呈现
 * ChatToolbar 嵌入内部右侧，与对话区域视觉一体化
 */
import { ChatToolbar } from '@/components/ChatToolbar';
import { AguiApprovalInterrupt } from '@/components/approval/AguiApprovalInterrupt';
import { Button } from '@/components/ui/button';
import { useAiProviderStore } from '@/stores/aiProvider';
import { useChatStore } from '@/stores/chat';
import { useTerminalStore } from '@/stores/terminal';
import { CopilotChat } from '@copilotkit/react-core/v2';
import { Settings } from 'lucide-react';

export function ChatArea() {
  const currentThreadId = useChatStore((s) => s.currentThreadId);
  const conversations = useChatStore((s) => s.conversations);
  const rightPanelOpen = useTerminalStore((s) => s.isOpen);
  const openProviderSettings = useAiProviderStore((s) => s.openSettingsPanel);
  const providerReadiness = useAiProviderStore((s) => s.readiness);
  const providerError = useAiProviderStore((s) => s.lastProviderError);

  // 查找当前对话，获取 CopilotKit threadId
  const currentConversation = conversations.find((c) => c.id === currentThreadId);
  const providerNeedsConfiguration =
    providerReadiness === 'unconfigured' ||
    providerReadiness === 'invalid' ||
    providerError?.type === 'provider-not-configured' ||
    providerError?.type === 'provider-invalid';

  // 无选中对话 → 简单欢迎提示
  if (!currentThreadId || !currentConversation) {
    return (
      <div className="flex-1 flex min-w-0">
        <div className="flex-1 flex flex-col items-center justify-center gap-4 p-8">
          <h1 className="text-2xl font-bold text-foreground">Paladin</h1>
          <p className="text-muted-foreground text-center max-w-md">
            AI 编程伙伴。从左侧选择对话或创建新对话开始。
          </p>
        </div>
        {!rightPanelOpen && <ChatToolbar />}
      </div>
    );
  }

  if (providerNeedsConfiguration) {
    return (
      <div className="flex-1 flex min-w-0">
        <div className="flex-1 flex flex-col items-center justify-center gap-4 p-8 text-center">
          <div className="flex flex-col items-center gap-2">
            <h1 className="text-2xl font-semibold text-foreground">尚未配置 AI provider</h1>
            <p className="text-sm text-muted-foreground max-w-md">
              配置 DeepSeek、OpenAI 兼容服务或 LM Studio 后即可开始对话。
            </p>
          </div>
          <Button onClick={openProviderSettings}>
            <Settings className="h-4 w-4" aria-hidden="true" />
            配置 AI provider
          </Button>
        </div>
        {!rightPanelOpen && <ChatToolbar />}
      </div>
    );
  }

  return (
    <div className="flex-1 flex min-w-0">
      <div className="flex flex-1 min-w-0">
        <AguiApprovalInterrupt />
        <CopilotChat
          className="flex-1 min-w-0"
          threadId={currentConversation.threadId}
          labels={{
            welcomeMessageText: 'Paladin — AI 编程伙伴',
            chatInputPlaceholder: '输入消息...',
          }}
        />
      </div>
      {!rightPanelOpen && <ChatToolbar />}
    </div>
  );
}
