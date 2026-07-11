import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const LOGICAL_SIDECARS = new Set(['paladin-agent-sidecar', 'paladin-server-sidecar']);

export function sidecarFileName(logicalName, targetTriple) {
  if (!LOGICAL_SIDECARS.has(logicalName)) {
    throw new Error(`Unknown sidecar logical name: ${logicalName}`);
  }
  if (!/^[A-Za-z0-9_.-]+$/.test(targetTriple)) {
    throw new Error('Invalid target triple');
  }
  const suffix = targetTriple.includes('windows') ? '.exe' : '';
  return `${logicalName}-${targetTriple}${suffix}`;
}

export async function auditBundleInputs(inputRoots) {
  for (const root of inputRoots) {
    await auditTree(path.resolve(root), path.resolve(root));
  }
}

async function auditTree(root, current) {
  const entries = await readdir(current, { withFileTypes: true });
  for (const entry of entries) {
    const entryPath = path.join(current, entry.name);
    if (entry.isSymbolicLink()) {
      continue;
    }
    if (entry.isDirectory()) {
      await auditTree(root, entryPath);
      continue;
    }
    if (entry.name === '.env' || entry.name.startsWith('.env.')) {
      throw new Error(`Release input contains a forbidden .env file: ${path.relative(root, entryPath)}`);
    }
  }
}

export async function orchestrateRelease(steps) {
  await steps.buildAgent();
  await steps.buildServer();
  await steps.auditBundleInputs();
  await steps.verifySidecars();
  await steps.buildTauri();
}

const isDirectInvocation = process.argv[1]
  && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectInvocation) {
  console.error('Release build steps are not configured yet.');
  process.exitCode = 1;
}
