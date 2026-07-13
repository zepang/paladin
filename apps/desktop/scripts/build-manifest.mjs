import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { lstat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const TARGET_RULES = {
  'x86_64-pc-windows-msvc': {
    architecture: 'x86_64',
    sidecars: {
      agent: /^paladin-agent-sidecar-x86_64-pc-windows-msvc\.exe$/,
      server: /^paladin-server-sidecar-x86_64-pc-windows-msvc\.exe$/,
    },
    installers: [
      { role: 'msi', pattern: /\.msi$/i, label: 'MSI' },
    ],
  },
  'aarch64-apple-darwin': {
    architecture: 'aarch64',
    sidecars: {
      agent: /^paladin-agent-sidecar-aarch64-apple-darwin$/,
      server: /^paladin-server-sidecar-aarch64-apple-darwin$/,
    },
    installers: [
      { role: 'dmg', pattern: /\.dmg$/i, label: 'DMG' },
    ],
  },
  'x86_64-unknown-linux-gnu': {
    architecture: 'x86_64',
    sidecars: {
      agent: /^paladin-agent-sidecar-x86_64-unknown-linux-gnu$/,
      server: /^paladin-server-sidecar-x86_64-unknown-linux-gnu$/,
    },
    installers: [
      { role: 'appimage', pattern: /\.AppImage$/, label: 'AppImage' },
      { role: 'deb', pattern: /\.deb$/i, label: 'deb' },
    ],
  },
};

async function describeArtifact(role, artifactPath, filenamePattern, filenameLabel) {
  if (typeof artifactPath !== 'string' || artifactPath.length === 0) {
    throw new Error(`${role} artifact path is missing`);
  }
  const filename = path.basename(artifactPath);
  if (!filenamePattern.test(filename)) {
    throw new Error(`${filenameLabel} filename is invalid: ${filename}`);
  }

  let stats;
  try {
    stats = await lstat(artifactPath);
  } catch (error) {
    throw new Error(`${role} artifact is missing: ${filename}`, { cause: error });
  }
  if (!stats.isFile()) {
    throw new Error(`${role} artifact must be a regular file: ${filename}`);
  }

  const hash = createHash('sha256');
  for await (const chunk of createReadStream(artifactPath)) hash.update(chunk);
  return { role, filename, size: stats.size, sha256: hash.digest('hex') };
}

export async function createBuildManifest({ commitSha, runnerOs, target, artifacts } = {}) {
  if (typeof commitSha !== 'string' || commitSha.length === 0) throw new Error('commitSha is required');
  if (typeof runnerOs !== 'string' || runnerOs.length === 0) throw new Error('runnerOs is required');
  const targetRule = TARGET_RULES[target];
  if (!targetRule) throw new Error(`Unsupported target: ${target}`);
  if (!artifacts || typeof artifacts !== 'object') throw new Error('artifacts are required');

  const installers = Array.isArray(artifacts.installers)
    ? artifacts.installers
    : [artifacts.installer].filter(Boolean);
  const installerArtifacts = await describeInstallers(installers, targetRule.installers);
  const agent = await describeArtifact(
    'agent-sidecar',
    artifacts.agent,
    targetRule.sidecars.agent,
    'Agent sidecar',
  );
  const server = await describeArtifact(
    'server-sidecar',
    artifacts.server,
    targetRule.sidecars.server,
    'Server sidecar',
  );

  return {
    schema_version: 1,
    commit_sha: commitSha,
    runner_os: runnerOs,
    architecture: targetRule.architecture,
    target,
    artifacts: [agent, server, ...installerArtifacts],
  };
}

async function describeInstallers(installerPaths, installerRules) {
  if (!Array.isArray(installerPaths) || installerPaths.length === 0) {
    throw new Error('installer artifacts are required');
  }

  const matchedInstallers = installerPaths.map((installerPath) => {
    const filename = path.basename(installerPath ?? '');
    const rule = installerRules.find(({ pattern }) => pattern.test(filename));
    if (!rule) {
      const label = installerRules.map(({ label }) => label).join(' or ');
      throw new Error(`${label} filename is invalid: ${filename}`);
    }
    return { rule, installerPath };
  });

  for (const rule of installerRules) {
    const count = matchedInstallers.filter((installer) => installer.rule.role === rule.role).length;
    if (count !== 1) {
      throw new Error(`${rule.role} installer requires exactly one ${rule.label}; found ${count}`);
    }
  }

  return Promise.all(matchedInstallers.map(({ rule, installerPath }) => (
    describeArtifact(rule.role, installerPath, rule.pattern, rule.label)
  )));
}

function parseArgs(argv) {
  const options = { installers: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key?.startsWith('--') || value === undefined) throw new Error(`Invalid argument: ${key ?? ''}`);
    index += 1;
    if (key === '--installer') {
      options.installers.push(value);
    } else {
      options[key.slice(2)] = value;
    }
  }
  return options;
}

async function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  if (!options.output) throw new Error('--output is required');
  const manifest = await createBuildManifest({
    commitSha: options.commit,
    runnerOs: options['runner-os'],
    target: options.target,
    artifacts: { agent: options.agent, server: options.server, installers: options.installers },
  });
  await writeFile(options.output, `${JSON.stringify(manifest, null, 2)}\n`, { flag: 'wx' });
}

const isDirectInvocation = process.argv[1]
  && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectInvocation) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
