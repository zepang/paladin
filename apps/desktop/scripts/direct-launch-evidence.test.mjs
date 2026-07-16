import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  DIRECT_LAUNCHER_CLASS,
  createDirectLaunchEvidence,
  scanDirectLaunchEvidence,
  writeDirectLaunchEvidence,
} from './direct-launch-evidence.mjs';

async function fixtureDir() {
  return mkdtemp(path.join(tmpdir(), 'paladin-direct-launch-evidence-'));
}

function finderRecord(scenario) {
  return {
    schema_version: 1,
    commit_sha: '0123456789abcdef0123456789abcdef01234567',
    artifact: { filename: 'Paladin.dmg', sha256: 'a'.repeat(64) },
    launcher_class: DIRECT_LAUNCHER_CLASS.MACOS_FINDER,
    platform: 'macos',
    scenario,
    result: 'pass',
    diagnostic_class: 'go-unconfigured',
    manual_uat: 'passed',
    release_ready: true,
  };
}

test('D-09/D-10 accepts three distinct macOS Finder records without wrapper confusion', () => {
  const records = [
    finderRecord('no-ai-or-go-config'),
    finderRecord('ai-available-go-missing'),
    finderRecord('persisted-go-config-sidecars'),
  ];
  for (const record of records) {
    const evidence = createDirectLaunchEvidence(record);
    assert.equal(evidence.launcher_class, 'macos-finder');
    assert.equal(evidence.manual_uat, 'passed');
    assert.notEqual(evidence.launcher_class, DIRECT_LAUNCHER_CLASS.WRAPPER_DIAGNOSTIC);
  }
});

test('D-11 records Windows and Linux automation as pending and non-release-ready', () => {
  for (const launcherClass of [
    DIRECT_LAUNCHER_CLASS.WINDOWS_START_MENU_EXPLORER,
    DIRECT_LAUNCHER_CLASS.LINUX_DESKTOP_APPIMAGE,
  ]) {
    const evidence = createDirectLaunchEvidence({
      ...finderRecord('clean-environment-automation'),
      launcher_class: launcherClass,
      platform: launcherClass.startsWith('windows') ? 'windows' : 'linux',
      manual_uat: 'pending',
      release_ready: false,
    });
    assert.equal(evidence.manual_uat, 'pending');
    assert.equal(evidence.release_ready, false);
  }
});

test('D-12 rejects secret-bearing fixtures without printing injected sentinel values', async () => {
  const result = scanDirectLaunchEvidence({
    ...finderRecord('sentinel-scan'),
    diagnostic_class: 'db-failed phase12-evidence-db-sentinel',
    diagnostics: ['redis phase12-evidence-redis-sentinel', 'jwt phase12-evidence-jwt-sentinel'],
  });
  assert.equal(result.ok, false);
  assert.deepEqual(result.findings.map((finding) => finding.category).sort(), ['sentinel', 'sentinel', 'sentinel']);
  const output = JSON.stringify(result);
  for (const sentinel of ['phase12-evidence-db-sentinel', 'phase12-evidence-redis-sentinel', 'phase12-evidence-jwt-sentinel']) {
    assert.equal(output.includes(sentinel), false);
  }
});

test('D-12 rejects missing required schema fields and writes only scanned structured JSON', async () => {
  const result = scanDirectLaunchEvidence({ ...finderRecord('missing-artifact'), artifact: undefined });
  assert.equal(result.ok, false);
  assert.ok(result.findings.some((finding) => finding.category === 'missing-field'));

  const dir = await fixtureDir();
  const output = path.join(dir, 'finder.json');
  await writeDirectLaunchEvidence(output, finderRecord('no-ai-or-go-config'));
  const serialized = await readFile(output, 'utf8');
  assert.match(serialized, /macos-finder/);
  assert.doesNotMatch(serialized, /postgres:|redis:|jwt-secret|api-key|token/i);
  await writeFile(path.join(dir, 'required-target.txt'), serialized);
});
