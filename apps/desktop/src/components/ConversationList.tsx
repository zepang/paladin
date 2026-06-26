import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useChatStore } from '@/stores/chat';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * 按创建日期分组标签
 * "今天" / "昨天" / "本周" / "更早"
 */
function getTimeGroupLabel(timestamp: number): string {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const yesterdayStart = todayStart - 86400000;
  const weekStart = todayStart - now.getDay() * 86400000;

  if (timestamp >= todayStart) return '今天';
  if (timestamp >= yesterdayStart) return '昨天';
  if (timestamp >= weekStart) return '本周';
  return '更早';
}

/**
 * 对话列表组件
 * 显示在 CopilotSidebar 内部（Phase 5）或独立侧边栏
 * 支持创建、选择、重命名、删除对话
 */
export function ConversationList() {
  const conversations = useChatStore((s) => s.conversations);
  const currentThreadId = useChatStore((s) => s.currentThreadId);
  const createConversation = useChatStore((s) => s.createConversation);
  const setCurrentThreadId = useChatStore((s) => s.setCurrentThreadId);
  const deleteConversation = useChatStore((s) => s.deleteConversation);
  const updateConversationTitle = useChatStore((s) => s.updateConversationTitle);

  // 编辑状态
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  // 删除确认对话框 — 存储待删除的对话 ID
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // 编辑模式下自动聚焦输入框
  useEffect(() => {
    if (editingId && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editingId]);

  /** 开始编辑标题 */
  const startEdit = useCallback((id: string, currentTitle: string) => {
    setEditingId(id);
    setEditValue(currentTitle);
  }, []);

  /** 提交标题编辑 */
  const commitEdit = useCallback(() => {
    if (editingId && editValue.trim()) {
      updateConversationTitle(editingId, editValue.trim());
    }
    setEditingId(null);
  }, [editingId, editValue, updateConversationTitle]);

  /** 按时间分组后的对话 */
  const grouped = conversations.reduce(
    (acc, conv) => {
      const group = getTimeGroupLabel(conv.createdAt);
      if (!acc[group]) acc[group] = [];
      acc[group].push(conv);
      return acc;
    },
    {} as Record<string, typeof conversations>
  );

  const groupOrder = ['今天', '昨天', '本周', '更早'];

  return (
    <div className="flex flex-col h-full">
      {/* 顶部操作栏 */}
      <div className="flex items-center justify-between p-3 border-b border-border">
        <h2 className="text-sm font-semibold text-foreground">对话</h2>
        <button
          type="button"
          onClick={createConversation}
          className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground"
          aria-label="新建对话"
        >
          <Plus className="size-4" />
        </button>
      </div>

      {/* 对话列表 */}
      <ScrollArea className="flex-1">
        {conversations.length === 0 ? (
          <div className="p-4 text-center text-sm text-muted-foreground/70">暂无对话</div>
        ) : (
          groupOrder.map((group) => {
            const items = grouped[group];
            if (!items || items.length === 0) return null;
            return (
              <div key={group}>
                {/* 分组标签 */}
                <div className="px-3 pt-3 pb-1 text-xs font-medium text-muted-foreground/70 uppercase tracking-wider">
                  {group}
                </div>
                {items.map((conv) => (
                  <div
                    key={conv.id}
                    className={`group flex items-center gap-2 px-3 py-2 cursor-pointer transition-colors ${
                      conv.id === currentThreadId ? 'bg-primary/10' : 'hover:bg-muted'
                    }`}
                    onClick={() => setCurrentThreadId(conv.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setCurrentThreadId(conv.id);
                      }
                    }}
                  >
                    {/* 标题区域 — 点击切换对话或编辑 */}
                    <div className="flex-1 min-w-0">
                      {editingId === conv.id ? (
                        <input
                          ref={inputRef}
                          type="text"
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          onBlur={commitEdit}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') commitEdit();
                            if (e.key === 'Escape') setEditingId(null);
                          }}
                          className="w-full text-sm bg-background border border-ring rounded px-1.5 py-0.5 outline-none text-foreground"
                          onClick={(e) => e.stopPropagation()}
                        />
                      ) : (
                        <span className="text-sm truncate block text-foreground">{conv.title}</span>
                      )}
                    </div>

                    {/* 操作按钮 — hover 时显示 */}
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          startEdit(conv.id, conv.title);
                        }}
                        className="p-1 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                        aria-label="重命名"
                      >
                        <Pencil className="size-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeleteTargetId(conv.id);
                        }}
                        className="p-1 rounded hover:bg-destructive/10 transition-colors text-muted-foreground hover:text-destructive"
                        aria-label="删除"
                      >
                        <Trash2 className="size-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            );
          })
        )}
      </ScrollArea>

      {/* 删除确认对话框 */}
      <AlertDialog
        open={deleteTargetId !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTargetId(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除对话</AlertDialogTitle>
            <AlertDialogDescription>确定删除这个对话？此操作不可撤销。</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (deleteTargetId) {
                  deleteConversation(deleteTargetId);
                  setDeleteTargetId(null);
                }
              }}
            >
              删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
