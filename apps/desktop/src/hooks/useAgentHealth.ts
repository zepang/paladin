/**
 * Agent 健康状态管理 Hook
 * 
 * 检测 Agent 服务是否在线，用于前端启动时的状态检查
 */

import { useState, useEffect, useCallback } from 'react';

export interface AgentHealthState {
  /** Agent 是否在线 */
  isOnline: boolean;
  /** 是否正在加载检测中 */
  isLoading: boolean;
  /** 错误信息 */
  error: string | null;
}

/**
 * 检查 Agent 健康状态的 Hook
 * 
 * @returns Agent 健康状态对象和重试函数
 */
export function useAgentHealth() {
  const [state, setState] = useState<AgentHealthState>({
    isOnline: false,
    isLoading: true,
    error: null,
  });

  /**
   * 执行健康检查
   */
  const checkHealth = useCallback(async () => {
    setState(prev => ({ ...prev, isLoading: true, error: null }));
    
    try {
      const response = await fetch('http://localhost:9876/health');
      
      if (response.ok) {
        setState({ isOnline: true, isLoading: false, error: null });
      } else {
        setState({ 
          isOnline: false, 
          isLoading: false, 
          error: 'Agent 服务异常' 
        });
      }
    } catch {
      setState({ 
        isOnline: false, 
        isLoading: false, 
        error: '无法连接到 Agent 服务，请先启动 Agent' 
      });
    }
  }, []);

  // 组件挂载时执行一次健康检查
  useEffect(() => {
    checkHealth();
  }, [checkHealth]);

  return {
    ...state,
    /** 手动触发健康检查重试 */
    retry: checkHealth,
  };
}