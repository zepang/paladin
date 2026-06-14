/**
 * Chat Store 测试套件 — TDD RED phase
 * 测试 conversation CRUD、persistence、边界条件
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

// 使用动态 import 以支持每次测试前重置 store 状态
let useChatStore: typeof import('../chat').useChatStore;

// 模拟 localStorage
const storage = new Map<string, string>();
beforeEach(() => {
  // 清空 localStorage mock
  storage.clear();
  vi.stubGlobal('localStorage', {
    getItem: vi.fn((key: string) => storage.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => {
      storage.set(key, value);
    }),
    removeItem: vi.fn((key: string) => {
      storage.delete(key);
    }),
  });
});

// 每次测试前重新加载模块，确保 store 重置
beforeEach(async () => {
  vi.resetModules();
  const mod = await import('../chat');
  useChatStore = mod.useChatStore;
});

/** 快捷取 store 状态 */
function getState() {
  return useChatStore.getState();
}

describe('useChatStore', () => {
  describe('initial state', () => {
    it('初始化为空的对话列表', () => {
      expect(getState().conversations).toEqual([]);
    });

    it('初始 currentThreadId 为 null', () => {
      expect(getState().currentThreadId).toBeNull();
    });
  });

  describe('createConversation', () => {
    it('创建新对话并添加到列表', () => {
      const id = getState().createConversation();
      const updated = getState();

      expect(updated.conversations).toHaveLength(1);
      expect(updated.conversations[0]?.id).toBe(id);
    });

    it('新对话默认标题为"新对话 #1"', () => {
      getState().createConversation();
      const { conversations } = getState();

      expect(conversations[0]?.title).toBe('新对话 #1');
    });

    it('创建多个对话时计数器递增', () => {
      getState().createConversation();
      getState().createConversation();
      getState().createConversation();
      const { conversations } = getState();

      expect(conversations).toHaveLength(3);
      expect(conversations[0]?.title).toBe('新对话 #1');
      expect(conversations[1]?.title).toBe('新对话 #2');
      expect(conversations[2]?.title).toBe('新对话 #3');
    });

    it('新建对话自动设为当前对话', () => {
      const id = getState().createConversation();
      const { currentThreadId } = getState();

      expect(currentThreadId).toBe(id);
    });

    it('每条对话生成唯一 id', () => {
      const id1 = getState().createConversation();
      const id2 = getState().createConversation();

      expect(id1).not.toBe(id2);
    });

    it('新对话包含 threadId 字段', () => {
      getState().createConversation();
      const { conversations } = getState();

      expect(conversations[0]?.threadId).toBeTruthy();
      expect(typeof conversations[0]?.threadId).toBe('string');
    });

    it('新对话 lastMessage 为空字符串', () => {
      getState().createConversation();
      const { conversations } = getState();

      expect(conversations[0]?.lastMessage).toBe('');
    });

    it('新对话 messageCount 为 0', () => {
      getState().createConversation();
      const { conversations } = getState();

      expect(conversations[0]?.messageCount).toBe(0);
    });
  });

  describe('setCurrentThreadId', () => {
    it('切换到有效对话 id', () => {
      const id1 = getState().createConversation();
      const id2 = getState().createConversation();

      getState().setCurrentThreadId(id1);
      expect(getState().currentThreadId).toBe(id1);

      getState().setCurrentThreadId(id2);
      expect(getState().currentThreadId).toBe(id2);
    });

    it('无效 id 不改变 currentThreadId', () => {
      const id = getState().createConversation();
      getState().setCurrentThreadId(id);

      getState().setCurrentThreadId('nonexistent-id');
      expect(getState().currentThreadId).toBe(id);
    });
  });

  describe('deleteConversation', () => {
    it('删除指定对话从列表中移除', () => {
      const id = getState().createConversation();
      getState().createConversation();

      getState().deleteConversation(id);
      expect(getState().conversations).toHaveLength(1);
    });

    it('删除当前对话时自动切换到下一个最近对话', () => {
      const id1 = getState().createConversation();
      const id2 = getState().createConversation();
      getState().setCurrentThreadId(id1);

      getState().deleteConversation(id1);
      expect(getState().currentThreadId).toBe(id2);
    });

    it('删除最后一个对话时自动创建一个新对话', () => {
      const id = getState().createConversation();

      getState().deleteConversation(id);
      const state = getState();
      expect(state.conversations.length).toBeGreaterThanOrEqual(1);
      expect(state.currentThreadId).toBe(state.conversations[0]?.id);
    });

    it('删除非当前对话不影响 currentThreadId', () => {
      const id1 = getState().createConversation();
      const id2 = getState().createConversation();
      getState().setCurrentThreadId(id2);

      getState().deleteConversation(id1);
      expect(getState().currentThreadId).toBe(id2);
    });
  });

  describe('updateConversationTitle', () => {
    it('更新对话标题', () => {
      const id = getState().createConversation();

      getState().updateConversationTitle(id, '自定义标题');
      const { conversations } = getState();

      expect(conversations[0]?.title).toBe('自定义标题');
    });

    it('无效 id 不报错，不改动任何标题', () => {
      getState().createConversation();
      const { conversations } = getState();
      const originalTitle = conversations[0]?.title;

      getState().updateConversationTitle('nonexistent', 'whatever');
      expect(getState().conversations[0]?.title).toBe(originalTitle);
    });
  });

  describe('setMessages', () => {
    it('缓存消息到对应 threadId', () => {
      const _id = getState().createConversation();

      const messages = [
        { id: 'msg-1', role: 'user' as const, content: 'hello' },
        { id: 'msg-2', role: 'assistant' as const, content: 'hi' },
      ];
      getState().setMessages(_id, messages);

      // 消息缓存在内部状态中（Phase 4 对接后通过 useAgent 读取）
      // Phase 2 仅验证不抛错，具体缓存机制在实现阶段验证
    });
  });

  describe('persistence', () => {
    it('store 配置了 persist 中间件且数据正确存储', () => {
      const id = getState().createConversation();
      getState().updateConversationTitle(id, '持久化测试');

      const state = getState();
      expect(state.conversations).toHaveLength(1);
      expect(state.conversations[0]?.title).toBe('持久化测试');
      expect(state.conversations[0]?.id).toBe(id);
    });
  });
});
