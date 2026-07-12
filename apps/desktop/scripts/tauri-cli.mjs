import { execFileSync, spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));

export function resolveTauriCliInvocation({
  platform = process.platform,
  execPath = process.execPath,
  scriptDir: invocationScriptDir = scriptDir,
} = {}) {
  if (platform !== 'win32') {
    return { command: 'tauri', argsPrefix: [] };
  }

  if (!path.win32.isAbsolute(execPath ?? '') || !/node(?:\.exe)?$/i.test(path.win32.basename(execPath ?? ''))) {
    throw new Error('Windows Tauri CLI requires process.execPath to identify an absolute Node executable');
  }

  return {
    command: execPath,
    argsPrefix: [
      path.win32.join(
        path.win32.dirname(invocationScriptDir),
        'node_modules',
        '@tauri-apps',
        'cli',
        'tauri.js',
      ),
    ],
  };
}

export function runTauriCli(args = process.argv.slice(2), {
  env = process.env,
  spawnImpl = spawn,
  exit = process.exit,
} = {}) {
  const devPorts = [9876, 9880];
  const shouldCleanupDevSidecars = args[0] === 'dev';
  const initialListeners = shouldCleanupDevSidecars ? snapshotListeners(devPorts) : new Map();
  let interrupted = false;
  let exiting = false;

  const invocation = resolveTauriCliInvocation();
  const child = spawnImpl(invocation.command, [...invocation.argsPrefix, ...args], {
    stdio: 'inherit',
    env,
    shell: false,
  });

  child.on('error', (error) => {
    console.error(error.message);
    exit(1);
  });

  process.on('SIGINT', () => {
    interrupted = true;
    if (!child.killed) {
      child.kill('SIGINT');
    }
  });

  process.on('SIGTERM', () => {
    interrupted = true;
    if (!child.killed) {
      child.kill('SIGTERM');
    }
  });

  child.on('close', (code, signal) => {
    if (interrupted || signal === 'SIGINT' || signal === 'SIGTERM' || code === 130 || code === 143) {
      void exitAfterCleanup(0);
      return;
    }
    void exitAfterCleanup(code ?? 1);
  });

  async function exitAfterCleanup(code) {
    if (exiting) {
      return;
    }
    exiting = true;
    if (shouldCleanupDevSidecars && interrupted) {
      await cleanupNewListeners(devPorts, initialListeners);
    }
    exit(code);
  }

  return child;
}

function snapshotListeners(ports) {
  const snapshot = new Map();
  for (const port of ports) {
    snapshot.set(port, new Set(listenerPids(port)));
  }
  return snapshot;
}

function listenerPids(port) {
  try {
    const output = execFileSync('lsof', ['-tiTCP:' + port, '-sTCP:LISTEN'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return output
      .split(/\s+/)
      .map((value) => Number(value))
      .filter((value) => Number.isInteger(value) && value > 0);
  } catch {
    return [];
  }
}

async function cleanupNewListeners(ports, beforeSnapshot) {
  await sleep(300);
  const pids = new Set();
  for (const port of ports) {
    const before = beforeSnapshot.get(port) ?? new Set();
    for (const pid of listenerPids(port)) {
      if (!before.has(pid)) {
        pids.add(pid);
      }
    }
  }

  if (pids.size === 0) {
    return;
  }

  terminatePids([...pids], 'SIGTERM');
  await waitForExit([...pids], 5000);

  const remaining = [...pids].filter(isRunning);
  if (remaining.length > 0) {
    terminatePids(remaining, 'SIGKILL');
    await waitForExit(remaining, 1000);
  }
}

function terminatePids(pids, signal) {
  if (process.platform === 'win32') {
    for (const pid of pids) {
      try {
        const args = ['/PID', String(pid), '/T'];
        if (signal === 'SIGKILL') {
          args.push('/F');
        }
        execFileSync('taskkill', args, { stdio: 'ignore' });
      } catch {}
    }
    return;
  }

  for (const pgid of processGroupsFor(pids)) {
    try {
      process.kill(-pgid, signal);
    } catch {}
  }
  for (const pid of pids) {
    try {
      process.kill(pid, signal);
    } catch {}
  }
}

function processGroupsFor(pids) {
  const groups = new Set();
  for (const pid of pids) {
    try {
      const output = execFileSync('ps', ['-o', 'pgid=', '-p', String(pid)], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      }).trim();
      const pgid = Number(output);
      if (Number.isInteger(pgid) && pgid > 0) {
        groups.add(pgid);
      }
    } catch {}
  }
  return groups;
}

async function waitForExit(pids, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (pids.every((pid) => !isRunning(pid))) {
      return;
    }
    await sleep(100);
  }
}

function isRunning(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const isDirectInvocation = process.argv[1]
  && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectInvocation) {
  runTauriCli();
}
