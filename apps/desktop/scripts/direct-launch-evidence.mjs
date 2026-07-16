import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const DIRECT_LAUNCHER_CLASS = Object.freeze({
  MACOS_FINDER: 'macos-finder',
  WINDOWS_START_MENU_EXPLORER: 'windows-start-menu-explorer',
  LINUX_DESKTOP_APPIMAGE: 'linux-desktop-appimage',
  WRAPPER_DIAGNOSTIC: 'wrapper-diagnostic-uat',
});

const REQUIRED_FIELDS = [
  'schema_version', 'commit_sha', 'artifact', 'launcher_class', 'platform', 'scenario',
  'result', 'diagnostic_class', 'manual_uat', 'release_ready',
];
const SECRET_PATTERNS = [
  /postgres(?:ql)?:\/\//i, /redis:\/\//i, /(?:jwt[-_ ]?secret|api[-_ ]?key|token)\s*[:=]/i,
  /phase12-evidence-(?:db|redis|jwt)-sentinel/i,
];
const VALID_PLATFORMS = new Set(['macos', 'windows', 'linux']);
const VALID_RESULTS = new Set(['pass', 'fail', 'pending']);
const VALID_MANUAL_UAT = new Set(['passed', 'pending']);

function safeFinding(category, field) {
  return field ? { category, field } : { category };
}

function hasSecret(value) {
  return typeof value === 'string' && SECRET_PATTERNS.some((pattern) => pattern.test(value));
}

function checkString(record, field, findings) {
  if (typeof record[field] !== 'string' || record[field].trim() === '') {
    findings.push(safeFinding('missing-field', field));
  }
}

export function scanDirectLaunchEvidence(record) {
  const findings = [];
  if (!record || typeof record !== 'object' || Array.isArray(record)) {
    return { ok: false, findings: [safeFinding('invalid-record')] };
  }
  for (const field of REQUIRED_FIELDS) {
    if (record[field] === undefined || record[field] === null || record[field] === '') {
      findings.push(safeFinding('missing-field', field));
    }
  }
  for (const field of ['commit_sha', 'launcher_class', 'platform', 'scenario', 'result', 'diagnostic_class', 'manual_uat']) {
    if (record[field] !== undefined) checkString(record, field, findings);
  }
  if (record.schema_version !== 1) findings.push(safeFinding('invalid-schema-version'));
  if (!VALID_PLATFORMS.has(record.platform)) findings.push(safeFinding('invalid-platform'));
  if (!VALID_RESULTS.has(record.result)) findings.push(safeFinding('invalid-result'));
  if (!VALID_MANUAL_UAT.has(record.manual_uat)) findings.push(safeFinding('invalid-manual-uat'));
  if (typeof record.release_ready !== 'boolean') findings.push(safeFinding('invalid-release-ready'));
  if (!Object.values(DIRECT_LAUNCHER_CLASS).includes(record.launcher_class)) findings.push(safeFinding('invalid-launcher-class'));
  if (!record.artifact || typeof record.artifact !== 'object' || Array.isArray(record.artifact)) {
    findings.push(safeFinding('missing-field', 'artifact'));
  } else {
    checkString(record.artifact, 'filename', findings);
    if (typeof record.artifact.sha256 !== 'string' || !/^[a-f0-9]{64}$/i.test(record.artifact.sha256)) {
      findings.push(safeFinding('invalid-artifact-sha256'));
    }
  }
  const inspect = (value, field = 'record') => {
    if (typeof value === 'string' && hasSecret(value)) findings.push(safeFinding('sentinel', field));
    if (Array.isArray(value)) value.forEach((item) => inspect(item, field));
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      for (const [key, nested] of Object.entries(value)) inspect(nested, key);
    }
  };
  inspect(record);
  return { ok: findings.length === 0, findings };
}

export function createDirectLaunchEvidence(record) {
  const result = scanDirectLaunchEvidence(record);
  if (!result.ok) throw new Error(`Direct-launch evidence rejected: ${result.findings.map((finding) => finding.category).join(', ')}`);
  return JSON.parse(JSON.stringify(record));
}

export async function writeDirectLaunchEvidence(output, record) {
  const evidence = createDirectLaunchEvidence(record);
  await mkdir(path.dirname(output), { recursive: true });
  await writeFile(output, `${JSON.stringify(evidence, null, 2)}\n`, { encoding: 'utf8', flag: 'w' });
  return evidence;
}

function parseArgs(argv) {
  if (argv.length !== 2 || argv[0] !== '--validate') throw new Error('Usage: direct-launch-evidence.mjs --validate <evidence.json>');
  return argv[1];
}

async function main(argv = process.argv.slice(2)) {
  const target = parseArgs(argv);
  let record;
  try {
    record = JSON.parse(await readFile(target, 'utf8'));
  } catch {
    console.error(JSON.stringify({ ok: false, findings: [safeFinding('unreadable-record')] }));
    process.exitCode = 1;
    return;
  }
  const result = scanDirectLaunchEvidence(record);
  console.log(JSON.stringify(result));
  if (!result.ok) process.exitCode = 1;
}

const isDirectInvocation = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirectInvocation) main().catch(() => { console.error(JSON.stringify({ ok: false, findings: [safeFinding('validation-error')] })); process.exitCode = 1; });
