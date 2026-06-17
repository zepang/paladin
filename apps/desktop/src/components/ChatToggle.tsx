/**
 * 聊天面板开关按钮
 * 放在 Titlebar 右侧，与 ThemeToggle 同排
 * 点击切换 CopilotSidebar 的打开/关闭状态
 */
import { Button } from '@/components/ui/button';
import { MessageSquare } from 'lucide-react';

interface ChatToggleProps {
  onClick: () => void;
}

export function ChatToggle({ onClick }: ChatToggleProps) {
  return (
    <Button variant="ghost" size="icon" onClick={onClick} aria-label="Toggle Chat">
      <MessageSquare className="size-4" />
    </Button>
  );
}
