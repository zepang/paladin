import { DiffMessageCard } from '@/components/diff/DiffMessageCard';
import type { Message } from '@copilotkit/react-core/v2';

interface MessageBubbleProps {
  message: Message;
}

// 检测消息文本中是否含有 diff 内容块
// 返回 { textWithoutDiff, diffBlocks }
interface DiffBlock {
  rawDiff: string;
  fileName: string;
}

function extractDiffBlocks(text: string): { cleanText: string; diffBlocks: DiffBlock[] } {
  const diffBlocks: DiffBlock[] = [];
  // 匹配代码块中的 diff 内容 (```diff ... ```)
  const diffCodeBlockRegex = /```diff\s*\n([\s\S]*?)```/g;
  let cleanText = text;
  let match;

  while ((match = diffCodeBlockRegex.exec(text)) !== null) {
    const rawDiff = match[1]?.trim();
    if (!rawDiff) continue;

    // 从 diff 头部提取文件名
    const fileMatch = rawDiff.match(/^\+\+\+ b\/(.+)$/m);
    const fileName = fileMatch?.[1] ?? 'unknown';

    diffBlocks.push({ rawDiff, fileName });

    // 从文本中移除已匹配的 diff 块
    cleanText = cleanText.replace(match[0], '');
  }

  // 检测裸 diff 输出（以 diff --git 开头，无代码块包裹）
  const bareDiffRegex = /^diff --git .+$/m;
  if (bareDiffRegex.test(cleanText.trim())) {
    const rawDiff = cleanText.trim();
    const fileMatch = rawDiff.match(/^\+\+\+ b\/(.+)$/m);
    const fileName = fileMatch?.[1] ?? 'unknown';
    diffBlocks.push({ rawDiff, fileName });
    cleanText = '';
  }

  return { cleanText: cleanText.trim(), diffBlocks };
}

/**
 * 从 AG-UI Message 中提取文本内容
 * content 类型可能是 string 或 InputContent 数组
 */
function getMessageText(content: Message['content']): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .filter((p): p is { type: 'text'; text: string } => p.type === 'text')
      .map(p => p.text)
      .join('');
  }
  return '';
}

// 用户头像 SVG
function UserAvatar() {
  return (
    <div className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
      U
    </div>
  );
}

// AI 头像 SVG
function AIAvatar() {
  return (
    <div className="w-8 h-8 rounded-full bg-purple-500 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
      AI
    </div>
  );
}

// 消息气泡组件
// 根据 role 显示对齐方向，自动检测并渲染内嵌 Diff 卡片
export function MessageBubble({ message }: MessageBubbleProps) {
  const isUser = message.role === 'user';
  const rawText = getMessageText(message.content);

  // AI 消息才检测 diff 内容
  const { cleanText, diffBlocks } = isUser
    ? { cleanText: rawText, diffBlocks: [] }
    : extractDiffBlocks(rawText);

  const hasContent = cleanText.length > 0;

  return (
    <div className={`flex gap-3 px-4 py-3 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
      {/* 头像 */}
      {isUser ? <UserAvatar /> : <AIAvatar />}

      <div className="max-w-[85%] flex flex-col gap-2">
        {/* 文本消息气泡 */}
        {hasContent && (
          <div
            className={`rounded-2xl px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap break-words ${
              isUser
                ? 'bg-blue-600 text-white rounded-tr-md'
                : 'bg-muted text-foreground rounded-tl-md'
            }`}
          >
            {cleanText}
          </div>
        )}

        {/* 内嵌 Diff 卡片 — 仅在 AI 消息且有 diff 内容时渲染 */}
        {diffBlocks.map((block, i) => (
          <DiffMessageCard
            key={`${message.id}-diff-${i}`}
            rawDiff={block.rawDiff}
            fileName={block.fileName}
          />
        ))}
      </div>
    </div>
  );
}
