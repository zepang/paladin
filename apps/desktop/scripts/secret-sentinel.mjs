import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { lstat, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const DEFAULT_SENTINELS = {
  apiKey: 'paladin-sentinel-openai-api-key-4f9d4f9d',
  databaseDsn: 'postgres://paladin-sentinel-user:paladin-sentinel-pass@db.invalid/paladin',
  redisUrl: 'redis://:paladin-sentinel-redis-pass@redis.invalid:6379/0',
  jwtSecret: 'paladin-sentinel-jwt-secret-8a44d8f2',
};

export const PROHIBITED_PACKAGED_GUIDANCE = [
  { token: 'developer-command', pattern: /\b(?:uv|go run|pnpm|cargo)\b/i },
  { token: 'source-config-path', pattern: /src-tauri\/processes\.json|src-tauri\\processes\.json/i },
];

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '../../..');

function defaultTargets() {
  return [
    path.join(repoRoot, 'apps/desktop/src-tauri/target/release/bundle'),
    path.join(repoRoot, 'docs/packaging.md'),
    path.join(repoRoot, '.planning/phases/10-packaging/evidence'),
  ];
}

export async function scanRequiredTargets({
  targets = defaultTargets(),
  sentinels = DEFAULT_SENTINELS,
  prohibitedPatterns = PROHIBITED_PACKAGED_GUIDANCE,
} = {}) {
  const findings = [];
  let targetsScanned = 0;
  let filesScanned = 0;
  let bytesScanned = 0;

  for (const target of targets) {
    const resolvedTarget = path.resolve(target);
    let stats;
    try {
      stats = await lstat(resolvedTarget);
    } catch {
      findings.push({ category: 'missing-target', target: labelFor(resolvedTarget) });
      continue;
    }

    if (stats.isSymbolicLink()) {
      findings.push({ category: 'symlink-target', target: labelFor(resolvedTarget) });
      continue;
    }

    const files = [];
    if (stats.isDirectory()) {
      await collectFiles(resolvedTarget, files);
    } else if (stats.isFile()) {
      files.push(resolvedTarget);
    }

    if (files.length === 0) {
      findings.push({ category: 'empty-target', target: labelFor(resolvedTarget) });
      continue;
    }

    targetsScanned += 1;
    for (const file of files) {
      const result = await scanFile(file, sentinels, prohibitedPatterns);
      filesScanned += 1;
      bytesScanned += result.bytes;
      findings.push(...result.findings);
    }
  }

  return {
    ok: findings.length === 0,
    targets_scanned: targetsScanned,
    files_scanned: filesScanned,
    bytes_scanned: bytesScanned,
    findings,
  };
}

async function collectFiles(root, files) {
  const entries = await readdir(root, { withFileTypes: true });
  for (const entry of entries) {
    const entryPath = path.join(root, entry.name);
    if (entry.isSymbolicLink()) {
      continue;
    }
    if (entry.isDirectory()) {
      await collectFiles(entryPath, files);
      continue;
    }
    if (entry.isFile()) {
      files.push(entryPath);
    }
  }
}

async function scanFile(file, sentinels, prohibitedPatterns) {
  const chunks = [];
  const hash = createHash('sha256');
  let bytes = 0;
  for await (const chunk of createReadStream(file)) {
    bytes += chunk.length;
    hash.update(chunk);
    chunks.push(chunk);
  }
  const content = Buffer.concat(chunks).toString('utf8');
  const fileLabel = labelFor(file);
  const fileHash = hash.digest('hex');
  const findings = [];

  for (const [token, sentinel] of Object.entries(sentinels)) {
    if (sentinel && content.includes(sentinel)) {
      findings.push({ category: 'sentinel', token, file: fileLabel, file_sha256: fileHash });
    }
  }

  for (const { token, pattern } of prohibitedPatterns) {
    if (pattern.test(content)) {
      findings.push({ category: 'prohibited-copy', token, file: fileLabel, file_sha256: fileHash });
    }
  }

  return { bytes, findings };
}

function labelFor(filePath) {
  const relative = path.relative(repoRoot, filePath);
  return relative && !relative.startsWith('..') ? relative : path.basename(filePath);
}

function parseArgs(argv) {
  const options = { requireAll: false, targets: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--require-all') {
      options.requireAll = true;
      continue;
    }
    if (arg === '--target') {
      const value = argv[++index];
      if (!value) throw new Error('--target requires a value');
      options.targets.push(value);
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }
  return options;
}

async function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  const result = await scanRequiredTargets({
    targets: options.targets.length > 0 ? options.targets : defaultTargets(),
  });
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok || (options.requireAll && result.targets_scanned === 0)) {
    process.exitCode = 1;
  }
}

const isDirectInvocation = process.argv[1]
  && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectInvocation) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
