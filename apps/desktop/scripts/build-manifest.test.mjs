import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { promisify } from 'node:util';

import { createBuildManifest } from './build-manifest.mjs';

const execFileAsync = promisify(execFile);

async function writeArtifacts(root, names) {
  const entries = Object.entries(names);
  await Promise.all(entries.map(([_key, filename]) => writeFile(path.join(root, filename), filename)));
  return Object.fromEntries(entries.map(([key, filename]) => [key, path.join(root, filename)]));
}

test('creates a deterministic non-secret Windows x86_64 artifact manifest', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'paladin-manifest-'));
  const artifacts = await writeArtifacts(root, {
    agent: 'paladin-agent-sidecar-x86_64-pc-windows-msvc.exe',
    server: 'paladin-server-sidecar-x86_64-pc-windows-msvc.exe',
    msi: 'Paladin_0.1.0_x64_en-US.msi',
  });

  process.env.PALADIN_SECRET_FOR_TEST = 'must-not-leak';
  const input = {
    commitSha: 'abc123',
    runnerOs: 'Windows',
    target: 'x86_64-pc-windows-msvc',
    artifacts: { agent: artifacts.agent, server: artifacts.server, installers: [artifacts.msi] },
  };
  const first = await createBuildManifest(input);
  const second = await createBuildManifest(input);

  assert.deepEqual(first, second);
  assert.equal(first.schema_version, 1);
  assert.equal(first.commit_sha, 'abc123');
  assert.equal(first.runner_os, 'Windows');
  assert.equal(first.architecture, 'x86_64');
  assert.equal(first.target, 'x86_64-pc-windows-msvc');
  assert.deepEqual(first.artifacts.map(({ role }) => role), ['agent-sidecar', 'server-sidecar', 'msi']);
  for (const artifact of first.artifacts) {
    assert.match(artifact.filename, /\.(exe|msi)$/);
    assert.ok(artifact.size > 0);
    assert.match(artifact.sha256, /^[a-f0-9]{64}$/);
  }
  assert.doesNotMatch(JSON.stringify(first), /must-not-leak|PALADIN_SECRET_FOR_TEST/);
});

test('creates a macOS aarch64 DMG manifest with non-exe sidecars', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'paladin-manifest-'));
  const artifacts = await writeArtifacts(root, {
    agent: 'paladin-agent-sidecar-aarch64-apple-darwin',
    server: 'paladin-server-sidecar-aarch64-apple-darwin',
    dmg: 'paladin_0.1.0_aarch64.dmg',
  });

  const manifest = await createBuildManifest({
    commitSha: 'abc123',
    runnerOs: 'macOS',
    target: 'aarch64-apple-darwin',
    artifacts: { agent: artifacts.agent, server: artifacts.server, installers: [artifacts.dmg] },
  });

  assert.equal(manifest.architecture, 'aarch64');
  assert.equal(manifest.target, 'aarch64-apple-darwin');
  assert.deepEqual(manifest.artifacts.map(({ role }) => role), ['agent-sidecar', 'server-sidecar', 'dmg']);
  assert.ok(manifest.artifacts.every(({ filename }) => !filename.endsWith('.exe')));
});

test('creates a Linux x86_64 AppImage and deb manifest', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'paladin-manifest-'));
  const artifacts = await writeArtifacts(root, {
    agent: 'paladin-agent-sidecar-x86_64-unknown-linux-gnu',
    server: 'paladin-server-sidecar-x86_64-unknown-linux-gnu',
    appimage: 'paladin_0.1.0_amd64.AppImage',
    deb: 'paladin_0.1.0_amd64.deb',
  });

  const manifest = await createBuildManifest({
    commitSha: 'abc123',
    runnerOs: 'Linux',
    target: 'x86_64-unknown-linux-gnu',
    artifacts: {
      agent: artifacts.agent,
      server: artifacts.server,
      installers: [artifacts.appimage, artifacts.deb],
    },
  });

  assert.equal(manifest.architecture, 'x86_64');
  assert.equal(manifest.target, 'x86_64-unknown-linux-gnu');
  assert.deepEqual(
    manifest.artifacts.map(({ role }) => role),
    ['agent-sidecar', 'server-sidecar', 'appimage', 'deb'],
  );
});

test('writes repeatable installer CLI arguments in order', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'paladin-manifest-'));
  const output = path.join(root, 'build-manifest.json');
  const artifacts = await writeArtifacts(root, {
    agent: 'paladin-agent-sidecar-x86_64-unknown-linux-gnu',
    server: 'paladin-server-sidecar-x86_64-unknown-linux-gnu',
    appimage: 'paladin_0.1.0_amd64.AppImage',
    deb: 'paladin_0.1.0_amd64.deb',
  });

  await execFileAsync(process.execPath, [
    'apps/desktop/scripts/build-manifest.mjs',
    '--commit', 'abc123',
    '--runner-os', 'Linux',
    '--target', 'x86_64-unknown-linux-gnu',
    '--agent', artifacts.agent,
    '--server', artifacts.server,
    '--installer', artifacts.appimage,
    '--installer', artifacts.deb,
    '--output', output,
  ]);

  const manifest = JSON.parse(await import('node:fs/promises').then(({ readFile }) => readFile(output, 'utf8')));
  assert.deepEqual(manifest.artifacts.map(({ role }) => role), ['agent-sidecar', 'server-sidecar', 'appimage', 'deb']);
});

test('rejects missing files, directories, unexpected target, and bad filenames', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'paladin-manifest-'));
  const directory = path.join(root, 'paladin-agent-sidecar-x86_64-pc-windows-msvc.exe');
  await mkdir(directory);
  const artifacts = await writeArtifacts(root, {
    server: 'paladin-server-sidecar-x86_64-pc-windows-msvc.exe',
    msi: 'Paladin_x64.msi',
    macAgent: 'paladin-agent-sidecar-aarch64-apple-darwin',
    macServer: 'paladin-server-sidecar-aarch64-apple-darwin',
    dmg: 'paladin_0.1.0_aarch64.dmg',
    linuxAgent: 'paladin-agent-sidecar-x86_64-unknown-linux-gnu',
    linuxServer: 'paladin-server-sidecar-x86_64-unknown-linux-gnu',
    appimage: 'paladin_0.1.0_amd64.AppImage',
    deb: 'paladin_0.1.0_amd64.deb',
  });

  const windows = { commitSha: 'abc123', runnerOs: 'Windows', target: 'x86_64-pc-windows-msvc' };
  await assert.rejects(createBuildManifest({ ...windows, artifacts: { agent: directory, server: artifacts.server, installers: [artifacts.msi] } }), /regular file/);
  await assert.rejects(createBuildManifest({ ...windows, artifacts: { agent: path.join(root, 'missing.exe'), server: artifacts.server, installers: [artifacts.msi] } }), /missing|ENOENT/i);
  await assert.rejects(createBuildManifest({ ...windows, target: 'aarch64-pc-windows-msvc', artifacts: { agent: artifacts.server, server: artifacts.server, installers: [artifacts.msi] } }), /target/);
  await assert.rejects(createBuildManifest({ ...windows, artifacts: { agent: artifacts.server, server: artifacts.server, installers: [artifacts.server] } }), /MSI filename|msi/i);
  await assert.rejects(createBuildManifest({ ...windows, artifacts: { agent: artifacts.macAgent, server: artifacts.server, installers: [artifacts.msi] } }), /Agent sidecar filename/);

  const macos = { commitSha: 'abc123', runnerOs: 'macOS', target: 'aarch64-apple-darwin' };
  await assert.rejects(createBuildManifest({ ...macos, artifacts: { agent: artifacts.macAgent, server: artifacts.macServer, installers: [artifacts.msi] } }), /DMG filename|dmg/i);
  await assert.rejects(createBuildManifest({ ...macos, artifacts: { agent: artifacts.macAgent, server: artifacts.macServer, installers: [artifacts.dmg, artifacts.dmg] } }), /dmg.*exactly one|exactly one.*dmg/i);

  const linux = { commitSha: 'abc123', runnerOs: 'Linux', target: 'x86_64-unknown-linux-gnu' };
  await assert.rejects(createBuildManifest({ ...linux, artifacts: { agent: artifacts.linuxAgent, server: artifacts.linuxServer, installers: [artifacts.appimage] } }), /deb/i);
  await assert.rejects(createBuildManifest({ ...linux, artifacts: { agent: artifacts.linuxAgent, server: artifacts.linuxServer, installers: [artifacts.deb] } }), /appimage/i);
  await assert.rejects(createBuildManifest({ ...linux, artifacts: { agent: artifacts.linuxAgent, server: artifacts.linuxServer, installers: [artifacts.appimage, artifacts.deb, artifacts.deb] } }), /deb.*exactly one|exactly one.*deb/i);
});
