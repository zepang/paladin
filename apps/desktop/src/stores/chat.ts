/**
 * 聊天状态管理 Store
 * 管理对话列表、当前对话、消息缓存
 * 使用 Zustand persist 中间件持久化到 localStorage
 * Phase 2 自行维护对话列表，Phase 4 通过 threadId 对接 CopilotKit 线程
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// 对话数据结构
export interface Conversation {
  /** 对话唯一标识 */
  id: string;
  /** CopilotKit 线程 ID，预留 Phase 4 对接 */
  threadId: string;
  /** 对话标题，可编辑，默认 "新对话 #{N}" */
  title: string;
  /** 创建时间戳 */
  createdAt: number;
  /** 最后一条消息预览文本 */
  lastMessage: string;
  /** 消息总数 */
  messageCount: number;
}

// 消息类型（简化版，Phase 4 对接 CopilotKit Message 类型）
export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

interface ChatState {
  /** 对话列表 */
  conversations: Conversation[];
  /** 当前选中对话的 id */
  currentThreadId: string | null;
  /** 创建新对话，返回新对话 id */
  createConversation: () => string;
  /** 删除指定对话 */
  deleteConversation: (id: string) => void;
  /** 切换当前对话 */
  setCurrentThreadId: (id: string | null) => void;
  /** 更新对话标题 */
  updateConversationTitle: (id: string, title: string) => void;
  /** 缓存消息到指定对话 */
  setMessages: (threadId: string, messages: ChatMessage[]) => void;
}

// 对话计数器（不持久化，每次应用启动重新开始计数）
let conversationCounter = 1;

export const useChatStore = create<ChatState>()(
  persist(
    (set, get) => ({
      conversations: [],
      currentThreadId: null,

      createConversation: () => {
        const id = crypto.randomUUID();
        const newConv: Conversation = {
          id,
          threadId: crypto.randomUUID(),
          title: `新对话 #${conversationCounter++}`,
          createdAt: Date.now(),
          lastMessage: '',
          messageCount: 0,
        };
        set((state) => ({
          conversations: [...state.conversations, newConv],
          currentThreadId: id,
        }));
        return id;
      },

      deleteConversation: (id: string) => {
        const { conversations, currentThreadId } = get();
        const updated = conversations.filter((c) => c.id !== id);

        // 如果删除的是当前对话，切换到下一个最近对话
        let nextThreadId = currentThreadId;
        if (currentThreadId === id) {
          if (updated.length > 0) {
            // 优先选择同位置（索引不变），否则选最后一个
            const deletedIndex = conversations.findIndex((c) => c.id === id);
            const fallbackIndex = Math.min(deletedIndex, updated.length - 1);
            const fallback = updated[fallbackIndex];
            if (fallback) nextThreadId = fallback.id;
          } else {
            // 没有剩余对话，创建一个新的
            const newId = crypto.randomUUID();
            const newConv: Conversation = {
              id: newId,
              threadId: crypto.randomUUID(),
              title: `新对话 #${conversationCounter++}`,
              createdAt: Date.now(),
              lastMessage: '',
              messageCount: 0,
            };
            nextThreadId = newId;
            set({ conversations: [newConv], currentThreadId: newId });
            return;
          }
        }

        set({ conversations: updated, currentThreadId: nextThreadId });
      },

      setCurrentThreadId: (id: string | null) => {
        const { conversations } = get();
        if (id === null || conversations.some((c) => c.id === id)) {
          set({ currentThreadId: id });
        }
      },

      updateConversationTitle: (id: string, title: string) => {
        set((state) => ({
          conversations: state.conversations.map((c) =>
            c.id === id ? { ...c, title } : c,
          ),
        }));
      },

      setMessages: (_threadId: string, _messages: ChatMessage[]) => {
        // Phase 2: 消息缓存占位
        // Phase 4: 通过 CopilotKit useAgent 管理实时消息，此处提供缓存桥接
      },
    }),
    {
      name: 'paladin-chat',
      version: 0,
    },
  ),
);
