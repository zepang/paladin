export function computeStats(rawDiff: string): { additions: number; deletions: number } {
  const lines = rawDiff.split('\n');
  let additions = 0;
  let deletions = 0;
  for (const line of lines) {
    if (line.startsWith('+') && !line.startsWith('+++')) additions++;
    if (line.startsWith('-') && !line.startsWith('---')) deletions++;
  }
  return { additions, deletions };
}

export function parseFiles(rawDiff: string, fallbackName: string): string[] {
  const files: string[] = [];
  for (const line of rawDiff.split('\n')) {
    const match = line.match(/^\+\+\+ b\/(.+)$/);
    const f = match?.[1];
    if (f) files.push(f);
  }
  return files.length > 0 ? files : [fallbackName];
}

export function parseDiffData(rawDiff: string): {
  oldContent: string;
  newContent: string;
  hunks: string[];
} {
  const oldLines: string[] = [];
  const newLines: string[] = [];
  const hunks: string[] = [];
  let currentHunk = '';

  for (const line of rawDiff.split('\n')) {
    if (line.startsWith('diff --git ') || line.startsWith('index ')) continue;
    if (line.startsWith('--- ') || line.startsWith('+++ ')) continue;

    if (line.startsWith('@@')) {
      if (currentHunk) hunks.push(currentHunk);
      currentHunk = `${line}\n`;
      continue;
    }

    if (currentHunk.includes('@@')) {
      currentHunk += `${line}\n`;

      if (line.startsWith('-')) {
        oldLines.push(line.slice(1));
      } else if (line.startsWith('+')) {
        newLines.push(line.slice(1));
      } else {
        const content = line.length > 0 && line[0] === ' ' ? line.slice(1) : line;
        oldLines.push(content);
        newLines.push(content);
      }
    }
  }

  if (currentHunk) hunks.push(currentHunk);

  return {
    oldContent: oldLines.join('\n'),
    newContent: newLines.join('\n'),
    hunks,
  };
}

export function isBinaryDiff(rawDiff: string): boolean {
  return (
    rawDiff.includes('Binary files') || rawDiff.includes('GIT binary patch')
  );
}

const EXT_LANG_MAP: Record<string, string> = {
  ts: 'typescript',
  tsx: 'tsx',
  js: 'javascript',
  jsx: 'jsx',
  py: 'python',
  rs: 'rust',
  go: 'go',
  css: 'css',
  html: 'html',
  json: 'json',
  md: 'markdown',
  yaml: 'yaml',
  yml: 'yaml',
  toml: 'toml',
  sql: 'sql',
  sh: 'bash',
  bash: 'bash',
  zsh: 'bash',
};

export function detectLanguage(fileName: string): string {
  const ext = fileName.split('.').pop()?.toLowerCase();
  return EXT_LANG_MAP[ext ?? ''] ?? 'plaintext';
}
