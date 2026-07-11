import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { createBuildManifest } from './build-manifest.mjs';

test('creates a deterministic non-secret Windows x86_64 artifact manifest', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'paladin-manifest-'));
  const artifacts = {
    agent: path.join(root, 'paladin-agent-sidecar-x86_64-pc-windows-msvc.exe'),
    server: path.join(root, 'paladin-server-sidecar-x86_64-pc-windows-msvc.exe'),
    installer: path.join(root, 'Paladin_0.1.0_x64_en-US.msi'),
  };
  await Promise.all([
    writeFile(artifacts.agent, 'agent'),
    writeFile(artifacts.server, 'server'),
    writeFile(artifacts.installer, 'msi'),
  ]);

  process.env.PALADIN_SECRET_FOR_TEST = 'must-not-leak';
  const input = { commitSha: 'abc123', runnerOs: 'Windows', target: 'x86_64-pc-windows-msvc', artifacts };
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

test('rejects missing files, directories, and unexpected target or filenames', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'paladin-manifest-'));
  const directory = path.join(root, 'directory.exe');
  await mkdir(directory);
  const valid = path.join(root, 'paladin-server-sidecar-x86_64-pc-windows-msvc.exe');
  const msi = path.join(root, 'Paladin_x64.msi');
  await writeFile(valid, 'server');
  await writeFile(msi, 'msi');

  const base = { commitSha: 'abc123', runnerOs: 'Windows', target: 'x86_64-pc-windows-msvc' };
  await assert.rejects(createBuildManifest({ ...base, artifacts: { agent: directory, server: valid, installer: msi } }), /regular file/);
  await assert.rejects(createBuildManifest({ ...base, artifacts: { agent: path.join(root, 'missing.exe'), server: valid, installer: msi } }), /missing|ENOENT/i);
  await assert.rejects(createBuildManifest({ ...base, target: 'aarch64-pc-windows-msvc', artifacts: { agent: valid, server: valid, installer: msi } }), /target/);
  await assert.rejects(createBuildManifest({ ...base, artifacts: { agent: valid, server: valid, installer: valid } }), /MSI filename/);
});
