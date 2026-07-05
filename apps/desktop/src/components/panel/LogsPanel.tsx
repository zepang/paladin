import { Button } from '@/components/ui/button';
/**
 * 日志面板 — 双 tab 流式日志视图
 *
 * 订阅 Rust supervisor emit 的 `process-log` 事件 (plan 06 LogChunk),
 * 按 payload.process 路由到 agent / server 独立 buffer,按 payload.stream
 * 给 stderr 行加视觉前缀 (⚠)。
 *
 * v1 交互 (D-03):实时滚动 (autoScroll near-bottom) + 手动暂停 (Pause/Play)
 * + 清空 (Trash2)。搜索/过滤/级别折叠 deferred 到未来 phase。
 *
 * 安全约束 (PATTERNS §2.8 + Phase 8 D-15):本组件仅消费 `process-log` event
 * 的 line 字段 (plan 05 redact_log_line + plan 06 落盘前脱敏双重保护),
 * 绝不读取 processes.json 的 env 字段或 invoke('get_runtime_config')。
 */
import { listen } from '@tauri-apps/api/event';
import { Pause, Play, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

type LogTab = 'agent' | 'server';

interface LogChunk {
  process: LogTab;
  stream: 'stdout' | 'stderr';
  line: string;
  ts: number;
}

const MAX_LINES = 5000;
const NEAR_BOTTOM_PX = 48;

export function LogsPanel() {
  const [activeTab, setActiveTab] = useState<LogTab>('agent');
  const [paused, setPaused] = useState(false);
  const buffersRef = useRef<{ agent: string[]; server: string[] }>({ agent: [], server: [] });
  const [, forceUpdate] = useState({});
  const scrollRef = useRef<HTMLDivElement>(null);
  const autoScrollRef = useRef(true);

  const isNearBottom = useCallback((el: HTMLDivElement) => {
    return el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM_PX;
  }, []);

  const handleScroll = useCallback(() => {
    if (scrollRef.current) {
      autoScrollRef.current = isNearBottom(scrollRef.current);
    }
  }, [isNearBottom]);

  useEffect(() => {
    const unlisten = listen<LogChunk>('process-log', (e) => {
      if (paused) return;
      const { process, stream, line } = e.payload;
      const prefix = stream === 'stderr' ? '⚠ ' : '';
      const buf = buffersRef.current[process];
      buf.push(prefix + line);
      if (buf.length > MAX_LINES) buf.shift();
      forceUpdate({});
      if (autoScrollRef.current && process === activeTab && scrollRef.current) {
        scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      }
    });
    return () => {
      void unlisten.then((fn) => fn());
    };
  }, [paused, activeTab]);

  const clearBuffer = () => {
    buffersRef.current[activeTab] = [];
    forceUpdate({});
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-0.5 border-b border-border px-1 h-9">
        {(['agent', 'server'] as const).map((t) => (
          <Button
            key={t}
            variant={activeTab === t ? 'secondary' : 'ghost'}
            size="sm"
            onClick={() => setActiveTab(t)}
            className="h-7 px-2 text-xs gap-1"
            title={t === 'agent' ? 'paladin-agent' : 'paladin-server'}
          >
            {t === 'agent' ? 'paladin-agent' : 'paladin-server'}
          </Button>
        ))}
        <div className="flex-1" />
        <Button
          size="icon-xs"
          variant="ghost"
          onClick={() => setPaused((p) => !p)}
          title={paused ? '继续' : '暂停'}
          aria-label={paused ? '继续' : '暂停'}
        >
          {paused ? <Play /> : <Pause />}
        </Button>
        <Button size="icon-xs" variant="ghost" onClick={clearBuffer} title="清空" aria-label="清空">
          <Trash2 />
        </Button>
      </div>
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 overflow-auto p-2 text-xs font-mono whitespace-pre-wrap break-all"
      >
        {buffersRef.current[activeTab].length > 0 ? (
          buffersRef.current[activeTab].join('\n')
        ) : (
          <span className="text-muted-foreground">暂无日志</span>
        )}
      </div>
    </div>
  );
}
