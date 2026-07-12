import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  auditBundleInputs,
  orchestrateRelease,
  resolveTauriInvocation,
  runCommand,
  sidecarFileName,
} from './release.mjs';

test('builds Agent then Server before invoking Tauri', async () => {
  const calls = [];
  await orchestrateRelease({
    buildAgent: async () => calls.push('agent'),
    buildServer: async () => calls.push('server'),
    auditBundleInputs: async () => calls.push('audit'),
    verifySidecars: async () => calls.push('verify'),
    buildTauri: async () => calls.push('tauri'),
  });
  assert.deepEqual(calls, ['agent', 'server', 'audit', 'verify', 'tauri']);
});

test('does not invoke Tauri when a sidecar is missing', async () => {
  let tauriCalled = false;
  await assert.rejects(
    orchestrateRelease({
      buildAgent: async () => {},
      buildServer: async () => {},
      auditBundleInputs: async () => {},
      verifySidecars: async () => {
        throw new Error('missing sidecar');
      },
      buildTauri: async () => {
        tauriCalled = true;
      },
    }),
    /missing sidecar/,
  );
  assert.equal(tauriCalled, false);
});

test('rejects .env files from audited input trees without exposing values', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'paladin-release-'));
  await mkdir(path.join(root, 'nested'));
  await writeFile(path.join(root, 'nested', '.env.production'), 'SECRET=do-not-print\n');
  await assert.rejects(auditBundleInputs([root]), (error) => {
    assert.match(error.message, /\.env file/);
    assert.doesNotMatch(error.message, /do-not-print/);
    return true;
  });
});

test('maps logical sidecar names to target triples and Windows suffixes', () => {
  assert.equal(
    sidecarFileName('paladin-agent-sidecar', 'aarch64-apple-darwin'),
    'paladin-agent-sidecar-aarch64-apple-darwin',
  );
  assert.equal(
    sidecarFileName('paladin-server-sidecar', 'x86_64-pc-windows-msvc'),
    'paladin-server-sidecar-x86_64-pc-windows-msvc.exe',
  );
});

test('uses the Node executable and trusted pnpm JS CLI on Windows without a shell', () => {
  assert.deepEqual(resolveTauriInvocation({
    platform: 'win32',
    execPath: 'C:\\Program Files\\nodejs\\node.exe',
    npmExecPath: 'D:\\a\\_tool\\pnpm\\pnpm.cjs',
  }), {
    command: 'C:\\Program Files\\nodejs\\node.exe',
    args: ['D:\\a\\_tool\\pnpm\\pnpm.cjs', 'tauri', 'build'],
  });
});

test('fails closed when Windows pnpm JS CLI is missing or untrusted', () => {
  for (const npmExecPath of [undefined, '', 'pnpm.cmd', 'D:\\tools\\npm-cli.js']) {
    assert.throws(
      () => resolveTauriInvocation({
        platform: 'win32',
        execPath: 'C:\\Program Files\\nodejs\\node.exe',
        npmExecPath,
      }),
      /trusted absolute pnpm JS CLI/,
    );
  }
});

test('reports the failed command when spawn itself errors', async () => {
  const fakeSpawn = () => {
    const handlers = new Map();
    queueMicrotask(() => handlers.get('error')?.(new Error('spawn EINVAL')));
    return { once: (event, handler) => handlers.set(event, handler) };
  };
  await assert.rejects(
    runCommand('C:\\Program Files\\nodejs\\node.exe', ['D:\\pnpm.cjs', 'tauri', 'build'], {
      spawnImpl: fakeSpawn,
    }),
    /node\.exe.*pnpm\.cjs.*tauri.*build.*spawn EINVAL/,
  );
});
