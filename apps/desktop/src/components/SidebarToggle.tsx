/**
 * 侧边栏展开按钮
 * 仅在侧边栏折叠时显示，点击展开对话列表
 */
import { Button } from '@/components/ui/button';
import { PanelLeft } from 'lucide-react';

interface SidebarToggleProps {
  onClick: () => void;
}

export function SidebarToggle({ onClick }: SidebarToggleProps) {
  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={onClick}
      aria-label="展开对话列表"
      title="展开对话列表"
      className="absolute left-1 top-1 z-10"
    >
      <PanelLeft className="size-4" />
    </Button>
  );
}
