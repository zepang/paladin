/// 终端面板组件 — 单个 xterm.js 终端实例
///
/// 负责初始化 Terminal、addons、Channel 数据接收和用户输入发送。
/// 使用 useRef + useEffect 模式管理 xterm 生命周期。

import { type Channel } from '@tauri-apps/api/core';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { Terminal } from '@xterm/xterm';
import { useThemeStore } from '@/stores/theme';
import { useCallback, useEffect, useRef } from 'react';

interface TerminalPanelProps {
  terminalId: string;
  channel: Channel<Uint8Array>;
  onClose: () => void;
}

// 深色主题终端配色（Dracula 风格）
const darkTheme = {
  background: '#1e1e1e',
  foreground: '#d4d4d4',
  cursor: '#ffffff',
  cursorAccent: '#1e1e1e',
  selectionBackground: '#264f78',
  black: '#000000',
  red: '#cd3131',
  green: '#0dbc79',
  yellow: '#e5e510',
  blue: '#2472c8',
  magenta: '#bc3fbc',
  cyan: '#11a8cd',
  white: '#e5e5e5',
  brightBlack: '#666666',
  brightRed: '#f14c4c',
  brightGreen: '#23d18b',
  brightYellow: '#f5f543',
  brightBlue: '#3b8eea',
  brightMagenta: '#d670d6',
  brightCyan: '#29b8db',
  brightWhite: '#ffffff',
};

// 浅色主题终端配色（Solarized Light 风格）
const lightTheme = {
  background: '#ffffff',
  foreground: '#333333',
  cursor: '#000000',
  cursorAccent: '#ffffff',
  selectionBackground: '#add6ff',
  black: '#000000',
  red: '#cd3131',
  green: '#00bc00',
  yellow: '#949800',
  blue: '#0451a5',
  magenta: '#bc05bc',
  cyan: '#0598bc',
  white: '#555555',
  brightBlack: '#666666',
  brightRed: '#cd3131',
  brightGreen: '#14ce14',
  brightYellow: '#b5ba00',
  brightBlue: '#0451a5',
  brightMagenta: '#bc05bc',
  brightCyan: '#0598bc',
  brightWhite: '#a5a5a5',
};

export function TerminalPanel({ terminalId, channel, onClose }: TerminalPanelProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon>(new FitAddon());
  const isDark = useThemeStore((s) => {
    const theme = s.theme;
    return (
      theme === 'dark' ||
      (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)
    );
  });

  // 初始化 xterm.js 实例
  useEffect(() => {
    if (!containerRef.current) return;

    const currentTheme = isDark ? darkTheme : lightTheme;

    const term = new Terminal({
      fontSize: 13,
      fontFamily: 'Menlo, Monaco, "Courier New", monospace',
      theme: currentTheme,
      scrollback: 10000,
      cursorBlink: true,
      allowProposedApi: true,
    });

    // 加载 addons
    term.loadAddon(fitAddonRef.current);
    term.loadAddon(new WebLinksAddon());

    // 挂载到 DOM
    term.open(containerRef.current);
    fitAddonRef.current.fit();

    // 接收 Channel 数据（PTY 输出）
    channel.onmessage = (data: Uint8Array) => {
      const text = new TextDecoder().decode(data);
      term.write(text);
    };

    // 用户输入 → Rust backend
    term.onData(async (data: string) => {
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        await invoke('write_to_terminal', { id: terminalId, data });
      } catch (e) {
        console.error('[TerminalPanel] 写入终端失败:', e);
      }
    });

    terminalRef.current = term;

    // 键盘事件：终端聚焦时所有输入发送给终端
    const handleKeyDown = () => {
      if (document.activeElement?.closest('.xterm-helper-textarea')) {
        // 终端已聚焦，不拦截任何键盘事件
        return;
      }
    };
    window.addEventListener('keydown', handleKeyDown);

    // 窗口 resize 自适应
    const resizeObserver = new ResizeObserver(() => {
      fitAddonRef.current.fit();
      // 通知 Rust 后端 PTY 尺寸变化
      if (term.cols > 0 && term.rows > 0) {
        import('@tauri-apps/api/core').then(({ invoke }) => {
          invoke('resize_terminal', {
            id: terminalId,
            cols: term.cols,
            rows: term.rows,
          }).catch(() => {});
        });
      }
    });
    resizeObserver.observe(containerRef.current);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      resizeObserver.disconnect();
      term.dispose();
    };
  }, [terminalId, isDark]);

  // 主题变化时更新终端配色
  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.options.theme = isDark ? darkTheme : lightTheme;
    }
  }, [isDark]);

  // 右键菜单处理
  const handleContextMenu = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      // 基础右键菜单：复制、粘贴、新建Tab、关闭Tab
      const menu = document.createElement('div');
      menu.className =
        'fixed bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg py-1 z-50';
      menu.style.left = `${e.clientX}px`;
      menu.style.top = `${e.clientY}px`;

      const items = [
        {
          label: '复制',
          action: async () => {
            const selection = terminalRef.current?.getSelection();
            if (selection) {
              await navigator.clipboard.writeText(selection);
            }
          },
        },
        {
          label: '粘贴',
          action: async () => {
            const text = await navigator.clipboard.readText();
            if (text && terminalRef.current) {
              const { invoke } = await import('@tauri-apps/api/core');
              await invoke('write_to_terminal', { id: terminalId, data: text });
            }
          },
        },
        { label: '新建 Tab', action: () => {} }, // 由父组件通过 store 处理
        { label: '关闭 Tab', action: onClose },
      ];

      for (const item of items) {
        const btn = document.createElement('button');
        btn.className =
          'w-full text-left px-3 py-1 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700';
        btn.textContent = item.label;
        btn.onclick = () => {
          document.body.removeChild(menu);
          item.action();
        };
        menu.appendChild(btn);
      }

      document.body.appendChild(menu);

      // 点击其他地方关闭菜单
      const closeMenu = () => {
        if (document.body.contains(menu)) {
          document.body.removeChild(menu);
        }
        document.removeEventListener('click', closeMenu);
      };
      setTimeout(() => document.addEventListener('click', closeMenu), 0);
    },
    [terminalId, onClose],
  );

  return (
    <div
      ref={containerRef}
      className="h-full w-full"
      onContextMenu={handleContextMenu}
    />
  );
}
