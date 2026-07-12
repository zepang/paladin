import { spawn } from 'node:child_process';
import { access, copyFile, lstat, mkdir, readdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const LOGICAL_SIDECARS = new Set(['paladin-agent-sidecar', 'paladin-server-sidecar']);
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '../../..');
const agentDir = path.join(repoRoot, 'apps/agent');
const serverDir = path.join(repoRoot, 'apps/server');
const desktopDir = path.join(repoRoot, 'apps/desktop');
const binariesDir = path.join(desktopDir, 'src-tauri/binaries');

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
    const resolved = path.resolve(root);
    const stats = await lstat(resolved);
    if (stats.isFile()) {
      assertAllowedInput(path.basename(resolved), resolved, resolved);
    } else {
      await auditTree(resolved, resolved);
    }
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
    assertAllowedInput(entry.name, root, entryPath);
  }
}

function assertAllowedInput(name, root, inputPath) {
  if (name === '.env' || name.startsWith('.env.')) {
    throw new Error(`Release input contains a forbidden .env file: ${path.relative(root, inputPath)}`);
  }
}

export async function orchestrateRelease(steps) {
  await steps.buildAgent();
  await steps.buildServer();
  await steps.auditBundleInputs();
  await steps.verifySidecars();
  await steps.buildTauri();
}

export async function runCommand(command, args, options = {}) {
  await new Promise((resolve, reject) => {
    const spawnImpl = options.spawnImpl ?? spawn;
    const commandDescription = [command, ...args].map((part) => JSON.stringify(part)).join(' ');
    const child = spawnImpl(command, args, {
      cwd: options.cwd,
      env: options.env ?? process.env,
      stdio: 'inherit',
      shell: false,
    });
    child.once('error', (error) => {
      reject(new Error(`Failed to start command ${commandDescription}: ${error.message}`, {
        cause: error,
      }));
    });
    child.once('close', (code, signal) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Command ${commandDescription} failed (${signal ?? `exit ${code ?? 'unknown'}`})`));
      }
    });
  });
}

export function resolveTauriInvocation({
  platform = process.platform,
  execPath = process.execPath,
  npmExecPath = process.env.npm_execpath,
} = {}) {
  if (platform !== 'win32') {
    return { command: 'pnpm', args: ['tauri', 'build'] };
  }

  const isAbsolute = path.win32.isAbsolute(npmExecPath ?? '');
  const cliName = path.win32.basename(npmExecPath ?? '');
  const isPnpmJavaScriptCli = /^pnpm\.(?:c|m)?js$/i.test(cliName);
  if (!isAbsolute || !isPnpmJavaScriptCli) {
    throw new Error('Windows release requires npm_execpath to identify a trusted absolute pnpm JS CLI path');
  }
  if (!path.win32.isAbsolute(execPath) || !/node(?:\.exe)?$/i.test(path.win32.basename(execPath))) {
    throw new Error('Windows release requires process.execPath to identify an absolute Node executable');
  }

  return {
    command: execPath,
    args: [npmExecPath, 'tauri', 'build'],
  };
}

export function macDmgFileName({
  productName = 'paladin',
  version = '0.1.0',
  arch = process.arch,
} = {}) {
  const dmgArch = arch === 'arm64' ? 'aarch64' : arch;
  return `${productName}_${version}_${dmgArch}.dmg`;
}

export async function recoverHeadlessMacDmg({
  platform = process.platform,
  desktopDir: appDesktopDir = desktopDir,
  arch = process.arch,
  run = runCommand,
} = {}) {
  if (platform !== 'darwin') {
    return false;
  }

  const bundleDir = path.join(appDesktopDir, 'src-tauri/target/release/bundle');
  const dmgDir = path.join(bundleDir, 'dmg');
  const macosDir = path.join(bundleDir, 'macos');
  const script = path.join(dmgDir, 'bundle_dmg.sh');
  const appBundle = path.join(macosDir, 'paladin.app');
  try {
    await access(script);
    await access(appBundle);
  } catch {
    return false;
  }

  const dmgName = macDmgFileName({ arch });
  await rm(path.join(dmgDir, dmgName), { force: true });
  for (const entry of await readdir(dmgDir)) {
    if (entry.startsWith('rw.') && entry.endsWith(dmgName)) {
      await rm(path.join(dmgDir, entry), { force: true });
    }
  }
  for (const entry of await readdir(macosDir)) {
    if (entry.startsWith('rw.') && entry.endsWith(dmgName)) {
      await rm(path.join(macosDir, entry), { force: true });
    }
  }

  await run(script, [
    '--skip-jenkins',
    '--volname', 'paladin',
    '--icon', 'paladin.app', '180', '170',
    '--app-drop-link', '480', '170',
    path.join(dmgDir, dmgName),
    macosDir,
  ]);
  return true;
}

export async function currentTargetTriple() {
  let stdout = '';
  await new Promise((resolve, reject) => {
    const child = spawn('rustc', ['-vV'], { shell: false, stdio: ['ignore', 'pipe', 'inherit'] });
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.once('error', reject);
    child.once('close', (code) => code === 0 ? resolve() : reject(new Error('rustc -vV failed')));
  });
  const target = stdout.match(/^host:\s*(\S+)$/m)?.[1];
  if (!target) {
    throw new Error('Unable to determine current target triple');
  }
  return target;
}

export async function buildAgent({ run = runCommand } = {}) {
  await rm(path.join(agentDir, 'dist'), { recursive: true, force: true });
  await run('uv', ['run', 'pyinstaller', '--noconfirm', '--clean', 'paladin-agent-sidecar.spec'], {
    cwd: agentDir,
  });
  return path.join(agentDir, 'dist', process.platform === 'win32'
    ? 'paladin-agent-sidecar.exe'
    : 'paladin-agent-sidecar');
}

export async function buildServer({ targetTriple, run = runCommand } = {}) {
  const output = path.join(serverDir, process.platform === 'win32'
    ? 'paladin-server-sidecar.exe'
    : 'paladin-server-sidecar');
  await run('go', ['build', '-trimpath', '-o', output, './cmd/server'], { cwd: serverDir });
  return output;
}

async function stageSidecar(source, logicalName, targetTriple) {
  await access(source);
  await mkdir(binariesDir, { recursive: true });
  const destination = path.join(binariesDir, sidecarFileName(logicalName, targetTriple));
  await copyFile(source, destination);
  return destination;
}

async function verifySidecars(paths) {
  for (const sidecarPath of paths) {
    await access(sidecarPath);
  }
}

function parseArgs(argv) {
  const options = { sidecarsOnly: false, target: 'current', verify: false };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--') continue;
    if (argument === '--sidecars-only') options.sidecarsOnly = true;
    else if (argument === '--verify') options.verify = true;
    else if (argument === '--target') options.target = argv[++index];
    else throw new Error(`Unknown release argument: ${argument}`);
  }
  if (!options.target) throw new Error('--target requires a value');
  return options;
}

export async function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  const targetTriple = options.target === 'current' ? await currentTargetTriple() : options.target;
  let agentArtifact;
  let serverArtifact;
  let staged = [];
  await orchestrateRelease({
    buildAgent: async () => { agentArtifact = await buildAgent(); },
    buildServer: async () => { serverArtifact = await buildServer({ targetTriple }); },
    auditBundleInputs: async () => auditBundleInputs([
      path.join(agentDir, 'src'),
      path.join(agentDir, 'config'),
      path.join(agentDir, 'prompts'),
      path.join(agentDir, 'skills'),
      path.join(desktopDir, 'src'),
      path.join(desktopDir, 'src-tauri/tauri.conf.json'),
    ]),
    verifySidecars: async () => {
      staged = [
        await stageSidecar(agentArtifact, 'paladin-agent-sidecar', targetTriple),
        await stageSidecar(serverArtifact, 'paladin-server-sidecar', targetTriple),
      ];
      await verifySidecars(staged);
    },
    buildTauri: async () => {
      if (!options.sidecarsOnly) {
        const invocation = resolveTauriInvocation();
        try {
          await runCommand(invocation.command, invocation.args, {
            cwd: desktopDir,
          });
        } catch (error) {
          if (await recoverHeadlessMacDmg()) {
            console.warn(`Recovered macOS DMG build after Tauri bundler failure: ${error.message}`);
          } else {
            throw error;
          }
        }
      }
    },
  });
  if (options.verify) {
    console.log(`Verified ${staged.length} staged sidecars for ${targetTriple}.`);
  }
  return { targetTriple, staged };
}

const isDirectInvocation = process.argv[1]
  && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectInvocation) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
