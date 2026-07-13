import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  auditBundleInputs,
  macDmgFileName,
  orchestrateRelease,
  recoverHeadlessMacDmg,
  resolveTauriInvocation,
  runCommand,
  sidecarFileName,
  smokeAgentSidecar,
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

test('maps Node arch to the expected macOS DMG filename', () => {
  assert.equal(macDmgFileName({ productName: 'paladin', version: '0.1.0', arch: 'arm64' }), 'paladin_0.1.0_aarch64.dmg');
  assert.equal(macDmgFileName({ productName: 'paladin', version: '0.1.0', arch: 'x64' }), 'paladin_0.1.0_x64.dmg');
});

test('falls back to create-dmg skip-jenkins when the macOS app bundle exists', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'paladin-dmg-'));
  const desktop = path.join(root, 'apps', 'desktop');
  await mkdir(path.join(desktop, 'src-tauri', 'target', 'release', 'bundle', 'dmg'), { recursive: true });
  await mkdir(path.join(desktop, 'src-tauri', 'target', 'release', 'bundle', 'macos', 'paladin.app'), { recursive: true });
  await writeFile(path.join(desktop, 'src-tauri', 'target', 'release', 'bundle', 'dmg', 'bundle_dmg.sh'), '#!/usr/bin/env bash\n');

  const calls = [];
  const recovered = await recoverHeadlessMacDmg({
    platform: 'darwin',
    desktopDir: desktop,
    arch: 'arm64',
    run: async (command, args) => calls.push([command, args]),
  });

  assert.equal(recovered, true);
  assert.equal(calls.length, 1);
  assert.match(calls[0][0], /bundle_dmg\.sh$/);
  assert.deepEqual(calls[0][1].slice(0, 2), ['--skip-jenkins', '--volname']);
  assert.ok(calls[0][1].some((arg) => arg.endsWith('paladin_0.1.0_aarch64.dmg')));
});

test('smokes packaged Agent sidecar through health endpoint and terminates it', async () => {
  const child = new EventEmitter();
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  let killed = false;
  child.kill = () => {
    killed = true;
    queueMicrotask(() => child.emit('close', null, 'SIGTERM'));
  };
  const spawnCalls = [];
  const spawnImpl = (command, args, options) => {
    spawnCalls.push([command, args, options]);
    return child;
  };
  const get = (_url, callback) => {
    const response = new EventEmitter();
    response.statusCode = 200;
    response.resume = () => {};
    queueMicrotask(() => {
      callback(response);
      response.emit('end');
    });
    return { once: () => {}, setTimeout: () => {} };
  };

  await smokeAgentSidecar({
    executable: '/tmp/paladin-agent-sidecar',
    spawnImpl,
    get,
    timeoutMs: 1000,
    env: {},
  });

  assert.equal(killed, true);
  assert.deepEqual(spawnCalls[0][1], ['serve', '--port', '19976']);
  assert.equal(spawnCalls[0][2].env.PALADIN_RUNTIME_MODE, 'packaged');
  assert.equal(spawnCalls[0][2].env.LOGFIRE_PYDANTIC_RECORD, 'off');
  assert.equal(spawnCalls[0][2].env.DEEPSEEK_API_KEY, 'paladin-buildability-smoke-placeholder');
});

test('fails packaged Agent sidecar smoke when process exits before health', async () => {
  const child = new EventEmitter();
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.kill = () => {};
  const spawnImpl = () => {
    queueMicrotask(() => {
      child.stderr.emit('data', Buffer.from('ModuleNotFoundError: hidden import missing'));
      child.emit('close', 1, null);
    });
    return child;
  };
  const get = () => {
    throw new Error('not listening yet');
  };

  await assert.rejects(
    smokeAgentSidecar({
      executable: '/tmp/paladin-agent-sidecar',
      spawnImpl,
      get,
      timeoutMs: 1000,
    }),
    /ModuleNotFoundError: hidden import missing/,
  );
});

test('preserves real Agent smoke API key and redacts placeholder from failures', async () => {
  const child = new EventEmitter();
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.kill = () => {};
  const spawnCalls = [];
  const spawnImpl = (command, args, options) => {
    spawnCalls.push([command, args, options]);
    queueMicrotask(() => {
      child.stdout.emit('data', Buffer.from('starting with paladin-buildability-smoke-placeholder'));
      child.emit('close', 1, null);
    });
    return child;
  };
  const get = () => {
    throw new Error('not listening yet');
  };

  await assert.rejects(
    smokeAgentSidecar({
      executable: '/tmp/paladin-agent-sidecar',
      spawnImpl,
      get,
      timeoutMs: 1000,
      env: { DEEPSEEK_API_KEY: 'real-ci-secret' },
    }),
    /starting with \[BUILDABILITY_SMOKE_API_KEY\]/,
  );
  assert.equal(spawnCalls[0][2].env.DEEPSEEK_API_KEY, 'real-ci-secret');
});
