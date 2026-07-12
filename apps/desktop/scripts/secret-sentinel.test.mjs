import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  DEFAULT_SENTINELS,
  PROHIBITED_PACKAGED_GUIDANCE,
  scanRequiredTargets,
} from './secret-sentinel.mjs';

async function fixtureDir() {
  return mkdtemp(path.join(tmpdir(), 'paladin-sentinel-'));
}

test('fails when any sentinel appears without echoing the secret value', async () => {
  const root = await fixtureDir();
  await writeFile(path.join(root, 'visible.log'), `startup ok\n${DEFAULT_SENTINELS.apiKey}\n`);

  const result = await scanRequiredTargets({ targets: [root] });

  assert.equal(result.ok, false);
  assert.equal(result.findings.length, 1);
  assert.equal(result.findings[0].category, 'sentinel');
  assert.equal(result.findings[0].token, 'apiKey');
  assert.doesNotMatch(JSON.stringify(result), new RegExp(DEFAULT_SENTINELS.apiKey));
});

test('fails closed when a required target is missing or empty', async () => {
  const root = await fixtureDir();
  await mkdir(path.join(root, 'empty'));

  const result = await scanRequiredTargets({
    targets: [path.join(root, 'missing'), path.join(root, 'empty')],
  });

  assert.equal(result.ok, false);
  assert.deepEqual(
    result.findings.map((finding) => finding.category).sort(),
    ['empty-target', 'missing-target'],
  );
});

test('detects prohibited installed-app developer guidance', async () => {
  const root = await fixtureDir();
  await writeFile(path.join(root, 'diagnostic.txt'), '请运行 pnpm release 后编辑 src-tauri/processes.json');

  const result = await scanRequiredTargets({
    targets: [root],
    prohibitedPatterns: PROHIBITED_PACKAGED_GUIDANCE,
  });

  assert.equal(result.ok, false);
  assert.equal(result.findings[0].category, 'prohibited-copy');
  assert.equal(result.findings[0].token, 'developer-command');
  assert.doesNotMatch(JSON.stringify(result), /pnpm release/);
});

test('passes for non-empty targets without sentinel or prohibited copy', async () => {
  const root = await fixtureDir();
  await writeFile(path.join(root, 'safe.txt'), 'Windows buildability-only. OPENAI_API_KEY is a variable name.');

  const result = await scanRequiredTargets({ targets: [root] });

  assert.equal(result.ok, true);
  assert.deepEqual(result.findings, []);
  assert.equal(result.targets_scanned, 1);
  assert.equal(result.files_scanned, 1);
});
