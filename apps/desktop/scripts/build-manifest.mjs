import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { lstat } from 'node:fs/promises';
import path from 'node:path';

const WINDOWS_TARGET = 'x86_64-pc-windows-msvc';

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
  if (target !== WINDOWS_TARGET) throw new Error(`Unsupported target: ${target}`);
  if (!artifacts || typeof artifacts !== 'object') throw new Error('artifacts are required');

  // Validate the installer first so a misidentified upload fails with the clearest error.
  const installer = await describeArtifact('msi', artifacts.installer, /\.msi$/i, 'MSI');
  const agent = await describeArtifact(
    'agent-sidecar',
    artifacts.agent,
    /^paladin-agent-sidecar-x86_64-pc-windows-msvc\.exe$/,
    'Agent sidecar',
  );
  const server = await describeArtifact(
    'server-sidecar',
    artifacts.server,
    /^paladin-server-sidecar-x86_64-pc-windows-msvc\.exe$/,
    'Server sidecar',
  );

  return {
    schema_version: 1,
    commit_sha: commitSha,
    runner_os: runnerOs,
    architecture: 'x86_64',
    target,
    artifacts: [agent, server, installer],
  };
}
