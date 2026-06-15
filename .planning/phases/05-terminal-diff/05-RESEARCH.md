# Phase 5: Terminal + Diff — Research

**Researched:** 2026-06-15
**Phase:** 05-terminal-diff
**Requirements:** TRM-01~04, DIF-01~03

## Executive Summary

Phase 5 需交付内嵌终端（Rust portable-pty + Tauri Channel + xterm.js）和代码 Diff（@git-diff-view/react）。研究确认了技术可行性，关键发现：

1. **portable-pty** 直接集成到 Tauri 2 的 Rust 后端，通过 CommandBuilder 创建 PTY，spawn 线程读取输出
2. **Tauri Channel** 是官方推荐的终端流式数据传输方案，避免 Events 的 JSON 序列化瓶颈
3. **xterm.js v6** + FitAddon 是标准方案，React 集成通过 useRef + useEffect 模式
4. **@git-diff-view/react** 是性能最优的 Diff 组件（虚拟滚动 + 语法高亮 + Split/Unified 视图）

---

## 1. Rust PTY Backend

### 1.1 portable-pty 集成方案

**Crate:** `portable-pty` (latest 2025)

**核心流程:**
```
NativePtySystem::default()
  → openpty(PtySize { rows, cols, ... })
  → PtyPair { master, slave }
  → CommandBuilder::new(shell).args(args).cwd(dir)
  → slave.spawn_command(cmd)
  → drop(slave)              // 释放 slave，让 master 可接收 EOF
  → master.try_clone_reader() // 获取输出流
  → master.take_writer()      // 获取输入流
```

**关键注意事项：**
- 必须在 spawn 后立即 `drop(slave)`，否则 master 永远收不到 EOF
- PTY reader 运行在独立线程（非 tokio task），因为 PTY I/O 是同步的
- 输入通过 `writer.write_all(data.as_bytes())` 发送

**Cargo.toml 新增依赖:**
```toml
portable-pty = "0.8"
```

### 1.2 在 Tauri 2 中的架构位置

当前 `apps/desktop/src-tauri/src/lib.rs` 包含基础 Tauri 配置（tray、window events、greet 命令）。Phase 5 需新增：

- **src-tauri/src/terminal/** — PTY 管理模块
  - `mod.rs` — TerminalManager（管理多个 PTY 实例）
  - `commands.rs` — Tauri commands（前端调用入口）
- 在 `lib.rs` 的 `invoke_handler` 中注册新 commands

### 1.3 替代方案评估

| 方案 | 优点 | 缺点 | 结论 |
|------|------|------|------|
| 直接使用 portable-pty | 完全控制、无额外依赖 | 需手写 PTY 生命周期管理 | **推荐** |
| tauri-plugin-pty (v0.1.0) | 现成 Tauri 插件 | 版本 0.1.0，602 SLoC，开发中 | 功能不完整，不推荐 |
| dscode-terminal | TerminalManager + EventSender 设计良好 | 依赖 Tauri v1 概念 | 参考其设计模式 |

**结论：** 直接使用 `portable-pty`，参考 `dscode-terminal` 的 TerminalManager 设计模式。

### 1.4 PTY 生命周期管理

```rust
// 数据结构设计（参考 dscode-terminal）
struct TerminalInstance {
    id: String,
    shell_name: String,
    cwd: String,
    state: TerminalState, // Created | Running | ShuttingDown | Closed
    master: Box<dyn MasterPty + Send>,
    shutdown_flag: AtomicBool,
}

struct TerminalManager {
    terminals: HashMap<String, TerminalInstance>,
    app_handle: AppHandle,
}
```

**安全关闭流程：**
1. 设置 `shutdown_flag = true`
2. 发送 `exit\n` 到 PTY writer
3. Reader 线程检测到 flag 或 EOF 后退出
4. Drop 时 `close_all()` 确保资源释放

### 1.5 跨平台 Shell 检测

```rust
// macOS: /bin/zsh, Windows: powershell.exe, Linux: /bin/bash
fn get_default_shell() -> &'static str {
    if cfg!(target_os = "windows") {
        "powershell.exe"
    } else if cfg!(target_os = "macos") {
        "/bin/zsh"
    } else {
        "/bin/bash"
    }
}
```

**注意：** `cfg!()` 是编译期宏，二进制在目标平台编译，运行时无需判断。

---

## 2. Tauri Channel 终端流式传输

### 2.1 Channel vs Events

| 特性 | Channel | Events |
|------|---------|--------|
| 数据格式 | 二进制（Vec\<u8\>） | JSON 字符串 |
| 吞吐量 | 高（无序列化开销） | 中（JSON 编码/解码） |
| 适用场景 | 流式数据 | 离散通知 |
| 官方推荐 | 子进程输出、下载进度 | 推送通知 |

**结论：** 终端输出是高频流式数据，必须使用 Channel。

### 2.2 Rust 端实现

```rust
use tauri::ipc::Channel;

#[tauri::command]
fn spawn_terminal(
    channel: Channel<Vec<u8>>,
    app: AppHandle,
) -> Result<String, String> {
    let terminal_id = uuid();
    
    // 创建 PTY
    let pty_system = NativePtySystem::default();
    let pair = pty_system.openpty(PtySize { rows: 24, cols: 80, ... })?;
    
    // spawn shell
    let mut cmd = CommandBuilder::new(get_default_shell());
    let child = pair.slave.spawn_command(cmd)?;
    drop(pair.slave);
    
    let mut reader = pair.master.try_clone_reader()?;
    
    // 启动 reader 线程
    std::thread::spawn(move || {
        let mut buf = [0u8; 4096];
        loop {
            match reader.read(&mut buf) {
                Ok(0) => break, // EOF
                Ok(n) => {
                    if let Err(_) = channel.send(buf[..n].to_vec()) {
                        break; // Channel closed
                    }
                }
                Err(_) => break,
            }
        }
    });
    
    Ok(terminal_id)
}
```

### 2.3 前端接收

```typescript
// 前端调用
import { Channel, invoke } from '@tauri-apps/api/core';

const channel = new Channel<Uint8Array>();
channel.onmessage = (data) => {
  terminal.write(new TextDecoder().decode(data));
};

const terminalId = await invoke('spawn_terminal', {
  channel: channel,
});
```

### 2.4 前端输入发送

```typescript
// terminal.onData 回调集成
terminal.onData((data) => {
  invoke('write_to_terminal', { terminalId, data });
});
```

```rust
#[tauri::command]
fn write_to_terminal(terminal_id: String, data: String, 
    state: State<TerminalState>) -> Result<(), String> {
    let mgr = state.terminals.lock().unwrap();
    let instance = mgr.get(&terminal_id)?;
    instance.writer.write_all(data.as_bytes())?;
    Ok(())
}
```

---

## 3. xterm.js 前端集成

### 3.1 版本与包

**npm 包（2025 年最新）：**
```json
{
  "@xterm/xterm": "^6.0.0",
  "@xterm/addon-fit": "^0.11.0",
  "@xterm/addon-web-links": "^0.12.0"
}
```

**导入路径：**
```typescript
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import '@xterm/xterm/css/xterm.css';
```

### 3.2 React 集成模式

```typescript
// TerminalView.tsx — 标准 React + xterm.js 模式
function TerminalView({ channel }: { channel: Channel<Uint8Array> }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon>(new FitAddon());

  useEffect(() => {
    const term = new Terminal({
      fontSize: 13,
      fontFamily: 'Menlo, Consolas, monospace',
      theme: getTheme(), // 跟随深色/浅色模式
      scrollback: 10000,
      cursorBlink: true,
    });

    term.loadAddon(fitAddonRef.current);
    term.loadAddon(new WebLinksAddon());
    term.open(containerRef.current!);
    fitAddonRef.current.fit();

    // Channel 数据流
    channel.onmessage = (data) => {
      term.write(new TextDecoder().decode(data));
    };

    // 用户输入 → Rust
    term.onData((data) => {
      invoke('write_to_terminal', { terminalId, data });
    });

    terminalRef.current = term;

    return () => {
      term.dispose();
    };
  }, []);

  return <div ref={containerRef} className="h-full" />;
}
```

### 3.3 FitAddon Resize 处理

```typescript
// 窗口/面板 resize 时通知 PTY
const observer = new ResizeObserver(() => {
  fitAddonRef.current.fit();
  invoke('resize_terminal', {
    terminalId,
    cols: term.cols,
    rows: term.rows,
  });
});
observer.observe(containerRef.current!);
```

**Rust 端：**
```rust
#[tauri::command]
fn resize_terminal(terminal_id: String, cols: u16, rows: u16, ...) {
    let mgr = terminals.lock().unwrap();
    let instance = mgr.get(&terminal_id)?;
    instance.master.resize(PtySize { rows, cols, ... })?;
}
```

### 3.4 深色/浅色主题切换

```typescript
// 从 Zustand theme store 读取
const isDark = useThemeStore((s) => s.mode === 'dark');

const theme = {
  background: isDark ? '#1e1e1e' : '#ffffff',
  foreground: isDark ? '#d4d4d4' : '#333333',
  cursor: isDark ? '#ffffff' : '#000000',
  selectionBackground: isDark ? '#264f78' : '#add6ff',
  // ...ANSI 颜色
};

// 主题变化时更新
useEffect(() => {
  terminalRef.current?.options.theme = theme;
}, [isDark]);
```

---

## 4. @git-diff-view/react Diff 组件

### 4.1 包安装

```json
{
  "@git-diff-view/react": "^0.0.1",
  "@git-diff-view/lowlight": "^0.0.1"
}
```

CSS:
```typescript
import '@git-diff-view/react/styles/diff-view.css';
```

### 4.2 基本用法

```typescript
import { DiffView, DiffModeEnum } from '@git-diff-view/react';
import { generateDiffFile } from '@git-diff-view/file';

// 从 unified diff 生成 DiffFile
function renderDiff(gitDiffText: string, fileName: string, language: string) {
  const file = generateDiffFile(
    fileName,        // oldFileName
    oldContent,      // oldContent
    fileName,        // newFileName
    newContent,      // newContent
    language,        // oldLanguage (如 'typescript', 'python')
    language,        // newLanguage
  );

  file.initTheme('dark'); // 或 'light'
  file.init();
  file.buildSplitDiffLines();

  return (
    <DiffView
      diffFile={file}
      diffViewMode={DiffModeEnum.Unified}
      diffViewTheme="dark"
      diffViewHighlight={true}
      diffViewWrap={false}       // 水平滚动
      diffViewAddWidget
    />
  );
}
```

### 4.3 从 unified diff 文本创建

如果需要从 Agent 返回的 unified diff 文本创建 DiffView：

```typescript
import { DiffFile } from '@git-diff-view/file';

// 方案 A: 使用 DiffFile 的 parse 方法
const diffFile = DiffFile.createInstance({
  oldFile: { fileName: 'old.ts', content: oldContent },
  newFile: { fileName: 'new.ts', content: newContent },
  hunks: [], // 从 parsed diff 获取
  // ...
});
```

**注意：** `@git-diff-view/react` 的 `DiffView` 组件需要 `diffFile` prop（而非直接的 patch 字符串）。需要先用 `generateDiffFile` 生成 DiffFile 对象。

### 4.4 虚拟滚动性能

`@git-diff-view/react` 内置虚拟滚动，处理大文件 Diff 无需额外集成 react-virtuoso。具体限制：
- 单文件 >1000 行变更建议折叠（默认展示 500 行上下文）
- split 模式每行渲染两个单元格，性能略低于 unified

### 4.5 紧凑摘要展示（消息内嵌）

```typescript
// DiffSummary.tsx — 聊天消息中的紧凑摘要
function DiffSummary({ hunks }: { hunks: DiffHunk[] }) {
  const stats = computeStats(hunks); // { additions, deletions, files }
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="border rounded-lg p-3">
      <div 
        className="flex items-center gap-2 cursor-pointer"
        onClick={() => setExpanded(!expanded)}
      >
        <span className="text-green-600">+{stats.additions}</span>
        <span className="text-red-600">-{stats.deletions}</span>
        <span className="text-gray-500 text-sm">
          修改了 {stats.files.length} 个文件
        </span>
        <ChevronIcon expanded={expanded} />
      </div>
      {expanded && (
        <DiffView diffFile={diffFile} diffViewMode={DiffModeEnum.Unified} />
      )}
    </div>
  );
}
```

### 4.6 主题切换

```typescript
// Diff 组件跟随应用主题（来自 CONTEXT.md D-28）
const isDark = useThemeStore((s) => s.mode === 'dark');
<DiffView diffViewTheme={isDark ? 'dark' : 'light'} />
```

---

## 5. Zustand 状态管理设计

### 5.1 Terminal Store

```typescript
// src/stores/terminal.ts
interface TerminalState {
  isOpen: boolean;           // 底部面板开关
  panelHeight: number;       // 面板高度 (px)
  activeTabId: string | null; // 当前活跃 Tab
  tabs: TerminalTab[];       // Tab 列表
  isTerminalRunning: boolean; // 后台运行状态
  activePanel: 'terminal' | 'diff'; // 面板内 Tab 切换
}

interface TerminalTab {
  id: string;
  title: string;      // shell 名称
  cwd: string;        // 当前工作目录
  terminalPid: number; // PTY 进程 ID
}
```

### 5.2 Diff Store

```typescript
// src/stores/diff.ts
interface DiffState {
  diffs: Map<string, DiffEntry>; // messageId → diff 数据
}

interface DiffEntry {
  rawDiff: string;     // Agent 返回的 unified diff 文本
  files: string[];     // 变更文件列表
  stats: { additions: number; deletions: number };
  expanded: boolean;   // 是否展开显示
}
```

---

## 6. 架构总览

```
┌─────────────────────────────────────────────────────┐
│                    React Frontend                    │
│  ┌──────────┐  ┌──────────────┐  ┌───────────────┐  │
│  │ Chat UI  │  │ TerminalView │  │  DiffSummary  │  │
│  │(existing)│  │  (xterm.js)  │  │(@git-diff-view)│ │
│  └──────────┘  └──────┬───────┘  └───────────────┘  │
│                       │ onData/channel               │
├───────────────────────┼─────────────────────────────┤
│              Tauri IPC│ (Channel + invoke)            │
├───────────────────────┼─────────────────────────────┤
│              Rust Backend                            │
│  ┌────────────────────┴────────────────────────────┐ │
│  │              TerminalManager                     │ │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐      │ │
│  │  │ PTY Tab1 │  │ PTY Tab2 │  │ PTY Tab3 │ ...  │ │
│  │  │ (reader) │  │ (reader) │  │ (reader) │      │ │
│  │  │ (writer) │  │ (writer) │  │ (writer) │      │ │
│  │  └──────────┘  └──────────┘  └──────────┘      │ │
│  └─────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────┘
```

---

## 7. 风险与缓解

| 风险 | 影响 | 缓解措施 |
|------|------|---------|
| PTY 跨平台兼容 | Windows/macOS 行为差异 | 使用 portable-pty 抽象层 + 编译期 cfg!() |
| 大文件 Diff 性能 | 渲染卡顿 | @git-diff-view 内置虚拟滚动 + 默认折叠 |
| Channel 断开 | 崩溃恢复 | Rust 端检测 send 错误，自动重启 PTY |
| IPC 阻塞 | UI 卡顿 | Channel 异步非阻塞，reader 独立线程 |
| 内存泄漏 | 长期运行增长 | xterm.js scrollback 限制 10000 行 |

---

## 8. 未解决的问题

以下问题适合在规划阶段解决：
- TerminalManager 的生命周期与 Tauri State 的精确绑定方式
- 按钮快捷键注册（全局键盘事件 vs Tauri global shortcuts）
- @git-diff-view/react 从 unified diff 文本创建 DiffFile 的具体 API（需要验证 v0.x API 稳定性）
- xterm.js 的 WebGL addon 是否需要集成（当前不需要，渲染性能已足够）

---

*Research completed: 2026-06-15*
*Sources: portable-pty docs, Tauri 2 Channel API, xterm.js v6 npm, @git-diff-view/react GitHub, dscode-terminal pattern*
