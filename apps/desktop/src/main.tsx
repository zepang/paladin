import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
// CopilotKit v2 样式
import '@copilotkit/react-core/v2/styles.css';
// xterm.js 终端样式
import '@xterm/xterm/css/xterm.css';
import App from './App';
import './index.css';

const root = document.getElementById('root');
if (!root) throw new Error('Root element not found');
createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>
);
