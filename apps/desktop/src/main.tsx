import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
// CopilotKit v2 样式
import '@copilotkit/react-core/v2/styles.css';
// xterm.js 终端样式
import '@xterm/xterm/css/xterm.css';
import App from './App';
import './index.css';
import { initProcessListeners } from '@/stores/process';

const root = document.getElementById('root');
if (!root) throw new Error('Root element not found');

// 全局订阅 supervisor emit 的 process-status 事件一次 (plan 07.3-07)
// 拉一次 get_process_status 初值 + listen 后续 transition emit
// 失败时 console.warn 不阻塞渲染 (前端进入 fallback starting 状态,遮罩常驻)
let unlistenProcess: (() => void) | undefined;
initProcessListeners()
  .then((fn) => {
    unlistenProcess = fn;
  })
  .catch((e) => {
    console.warn('[process] init listeners failed', e);
  });

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>
);

// SPA 实际不卸载,但仍暴露 cleanup 钩子 (HMR / 测试场景)
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    unlistenProcess?.();
  });
}
