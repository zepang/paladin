import { type Channel, invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { Terminal } from '@xterm/xterm';
import '@xterm/xterm/css/xterm.css';
import { useTerminalStore } from '@/stores/terminal';
import { useThemeStore } from '@/stores/theme';
import { useCallback, useEffect, useRef } from 'react';

interface TerminalPanelProps {
  terminalId: string;
  channel: Channel<Uint8Array>;
  onClose: () => void;
}

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

function isNearBottom(term: Terminal, threshold = 3): boolean {
  const buffer = term.buffer.active;
  return buffer.baseY + term.rows >= buffer.length - threshold;
}

export function TerminalPanel({ terminalId, channel, onClose }: TerminalPanelProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon>(new FitAddon());
  const autoScrollRef = useRef(true);
  const addTab = useTerminalStore((s) => s.addTab);
  const isDark = useThemeStore((s) => {
    const theme = s.theme;
    return (
      theme === 'dark' ||
      (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)
    );
  });

  useEffect(() => {
    if (!containerRef.current) return;

    const currentTheme = isDark ? darkTheme : lightTheme;

    const term = new Terminal({
      fontSize: 13,
      fontFamily: 'Menlo, Consolas, monospace',
      theme: currentTheme,
      scrollback: 10000,
      cursorBlink: true,
      allowProposedApi: true,
    });

    term.loadAddon(fitAddonRef.current);
    term.loadAddon(new WebLinksAddon());
    term.open(containerRef.current);
    fitAddonRef.current.fit();

    term.onScroll(() => {
      autoScrollRef.current = isNearBottom(term);
    });

    channel.onmessage = (data: Uint8Array) => {
      const text = new TextDecoder().decode(data);
      term.write(text, () => {
        if (autoScrollRef.current) {
          term.scrollToBottom();
        }
      });
    };

    term.onData(async (data: string) => {
      try {
        await invoke('write_to_terminal', { id: terminalId, data });
      } catch (e) {
        console.error('[TerminalPanel] 写入终端失败:', e);
      }
    });

    terminalRef.current = term;

    const resizeObserver = new ResizeObserver(() => {
      fitAddonRef.current.fit();
      if (term.cols > 0 && term.rows > 0) {
        invoke('resize_terminal', {
          id: terminalId,
          cols: term.cols,
          rows: term.rows,
        }).catch(() => {});
      }
    });
    resizeObserver.observe(containerRef.current);

    const unlistenPromises = [
      listen<string>('pty-eof', async (event) => {
        if (event.payload !== terminalId) return;
        try {
          await invoke('restart_terminal', { id: terminalId, channel });
          term.write('\r\n[进程已重启]\r\n');
        } catch (e) {
          console.error('[TerminalPanel] restart_terminal 失败:', e);
        }
      }),
      listen<string>('pty-error', async (event) => {
        if (event.payload !== terminalId) return;
        try {
          await invoke('restart_terminal', { id: terminalId, channel });
          term.write('\r\n[进程已重启]\r\n');
        } catch (e) {
          console.error('[TerminalPanel] restart_terminal 失败:', e);
        }
      }),
    ];

    return () => {
      resizeObserver.disconnect();
      term.dispose();
      terminalRef.current = null;
      void Promise.all(unlistenPromises).then((unlisteners) => {
        for (const unlisten of unlisteners) {
          unlisten();
        }
      });
    };
  }, [terminalId, channel, isDark]);

  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.options.theme = isDark ? darkTheme : lightTheme;
    }
  }, [isDark]);

  const handleContextMenu = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      const menu = document.createElement('div');
      menu.className =
        'fixed bg-background border border-border rounded-lg shadow-lg py-1 z-50';
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
            if (text) {
              await invoke('write_to_terminal', { id: terminalId, data: text });
            }
          },
        },
        {
          label: '新建 Tab',
          action: () => {
            const id = `term-${Date.now()}`;
            addTab({ id, title: 'zsh', cwd: '' });
          },
        },
        { label: '关闭 Tab', action: onClose },
      ];

      for (const item of items) {
        const btn = document.createElement('button');
        btn.className =
          'w-full text-left px-3 py-1 text-sm text-foreground hover:bg-muted';
        btn.textContent = item.label;
        btn.onclick = () => {
          document.body.removeChild(menu);
          item.action();
        };
        menu.appendChild(btn);
      }

      document.body.appendChild(menu);

      const closeMenu = () => {
        if (document.body.contains(menu)) {
          document.body.removeChild(menu);
        }
        document.removeEventListener('click', closeMenu);
      };
      setTimeout(() => document.addEventListener('click', closeMenu), 0);
    },
    [terminalId, onClose, addTab],
  );

  return (
    <div ref={containerRef} className="h-full w-full" onContextMenu={handleContextMenu} />
  );
}
