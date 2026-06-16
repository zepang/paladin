import { describe, expect, it } from 'vitest';
import {
  computeStats,
  detectLanguage,
  isBinaryDiff,
  parseDiffData,
  parseFiles,
} from '../diffParser';

describe('computeStats', () => {
  it('counts additions and deletions excluding file headers', () => {
    const diff = '+++ b/a.ts\n+line\n-old';
    expect(computeStats(diff)).toEqual({ additions: 1, deletions: 1 });
  });

  it('returns zero for empty diff', () => {
    expect(computeStats('')).toEqual({ additions: 0, deletions: 0 });
  });
});

describe('parseFiles', () => {
  it('extracts paths from +++ b/{path} lines', () => {
    const diff = [
      'diff --git a/foo.ts b/foo.ts',
      '--- a/foo.ts',
      '+++ b/foo.ts',
      'diff --git a/bar.ts b/bar.ts',
      '--- a/bar.ts',
      '+++ b/bar.ts',
    ].join('\n');
    expect(parseFiles(diff, 'fallback.ts')).toEqual(['foo.ts', 'bar.ts']);
  });

  it('falls back to provided fileName when no paths found', () => {
    expect(parseFiles('no headers here', 'fallback.ts')).toEqual(['fallback.ts']);
  });
});

describe('parseDiffData', () => {
  it('extracts oldContent, newContent, and hunks from unified diff', () => {
    const diff = [
      '--- a/file.ts',
      '+++ b/file.ts',
      '@@ -1,2 +1,2 @@',
      ' unchanged',
      '-removed',
      '+added',
    ].join('\n');

    const result = parseDiffData(diff);
    expect(result.oldContent).toContain('unchanged');
    expect(result.oldContent).toContain('removed');
    expect(result.newContent).toContain('unchanged');
    expect(result.newContent).toContain('added');
    expect(result.hunks.length).toBeGreaterThan(0);
    expect(result.hunks[0]).toContain('@@');
  });
});

describe('isBinaryDiff', () => {
  it('returns true for Binary files marker', () => {
    expect(isBinaryDiff('Binary files a/image.png and b/image.png differ')).toBe(true);
  });

  it('returns true for GIT binary patch marker', () => {
    expect(isBinaryDiff('GIT binary patch')).toBe(true);
  });

  it('returns false for text diff', () => {
    expect(isBinaryDiff('+++ b/a.ts\n+line')).toBe(false);
  });
});

describe('detectLanguage', () => {
  it('maps file extensions to language ids', () => {
    expect(detectLanguage('app.ts')).toBe('typescript');
    expect(detectLanguage('main.py')).toBe('python');
    expect(detectLanguage('lib.rs')).toBe('rust');
    expect(detectLanguage('unknown.xyz')).toBe('plaintext');
  });
});
