/**
 * Phase 07a — ApprovalBridge: HITL 审批状态管理层（React Context + EventSource）
 *
 * D-07 修订: 使用自定义 useApprovalBridge hook 管理审批通道
 * - EventSource 订阅 GET /approval/stream
 * - fetch POST /approval/{request_id} 回传决策
 * - React Context 暴露 pendingApprovals, current, approve, deny, isConnected
 */
import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';

// ---- Types ----

export interface ApprovalRequest {
  request_id: string;
  tool_name: string;
  args: Record<string, unknown>;
  reason: string;
}

export interface ApprovalContextValue {
  /** 待审批队列（FIFO） */
  pendingApprovals: ApprovalRequest[];
  /** 当前队首审批请求 */
  current: ApprovalRequest | null;
  /** 批准当前审批请求 */
  approve: (requestId: string) => Promise<void>;
  /** 拒绝当前审批请求 */
  deny: (requestId: string) => Promise<void>;
  /** SSE 连接状态 */
  isConnected: boolean;
}

// ---- Context ----

const ApprovalContext = createContext<ApprovalContextValue | null>(null);

export function useApprovalContext(): ApprovalContextValue {
  const ctx = useContext(ApprovalContext);
  if (!ctx) {
    throw new Error('useApprovalContext must be used within ApprovalProvider');
  }
  return ctx;
}

// ---- Provider ----

const AGENT_BASE = 'http://localhost:9876';

export function ApprovalProvider({ children }: { children: React.ReactNode }) {
  const [pendingApprovals, setPendingApprovals] = useState<ApprovalRequest[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const eventSourceRef = useRef<EventSource | null>(null);

  // SSE 连接
  useEffect(() => {
    const es = new EventSource(`${AGENT_BASE}/approval/stream`);
    eventSourceRef.current = es;

    es.onopen = () => setIsConnected(true);
    es.onerror = () => setIsConnected(false);

    es.onmessage = (msg: MessageEvent) => {
      try {
        const event: ApprovalRequest = JSON.parse(msg.data);
        if (event.request_id) {
          setPendingApprovals((prev) => [...prev, event]);
        }
      } catch {
        // ignore malformed events
      }
    };

    return () => {
      es.close();
      setIsConnected(false);
    };
  }, []);

  // 批准 / 拒绝（HTTP 回调）
  const submitDecision = useCallback(
    async (requestId: string, decision: boolean) => {
      try {
        await fetch(`${AGENT_BASE}/approval/${requestId}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ decision }),
        });
      } catch {
        // 网络错误——后端超时后会自动拒绝
      }
      // 从队列移除已处理的请求
      setPendingApprovals((prev) => prev.filter((r) => r.request_id !== requestId));
    },
    [],
  );

  const approve = useCallback((requestId: string) => submitDecision(requestId, true), [submitDecision]);
  const deny = useCallback((requestId: string) => submitDecision(requestId, false), [submitDecision]);

  const current: ApprovalRequest | null = pendingApprovals.length > 0 ? (pendingApprovals[0] ?? null) : null;

  return (
    <ApprovalContext.Provider value={{ pendingApprovals, current, approve, deny, isConnected }}>
      {children}
    </ApprovalContext.Provider>
  );
}
