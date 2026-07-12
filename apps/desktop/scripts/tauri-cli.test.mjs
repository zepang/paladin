import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';

import { resolveTauriCliInvocation } from './tauri-cli.mjs';

test('uses the Node executable and package Tauri JS CLI on Windows without a shell', () => {
  assert.deepEqual(resolveTauriCliInvocation({
    platform: 'win32',
    execPath: 'C:\\hostedtoolcache\\windows\\node\\22.23.1\\x64\\node.exe',
    scriptDir: 'D:\\a\\paladin\\paladin\\apps\\desktop\\scripts',
  }), {
    command: 'C:\\hostedtoolcache\\windows\\node\\22.23.1\\x64\\node.exe',
    argsPrefix: [
      path.win32.join(
        'D:\\a\\paladin\\paladin\\apps\\desktop',
        'node_modules',
        '@tauri-apps',
        'cli',
        'tauri.js',
      ),
    ],
  });
});

test('fails closed when Windows Node executable is not absolute or trusted', () => {
  for (const execPath of ['', 'node', 'C:\\tools\\node.bat']) {
    assert.throws(
      () => resolveTauriCliInvocation({
        platform: 'win32',
        execPath,
        scriptDir: 'D:\\a\\paladin\\paladin\\apps\\desktop\\scripts',
      }),
      /absolute Node executable/,
    );
  }
});
