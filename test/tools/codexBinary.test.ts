import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { resolveCodexBinary } from '../../src/tools/codexBinary';

function makeChatgptFolder(
  extensionsDir: string,
  version: string,
  opts: { folderSuffix: string; binSubfolder: string; binaryName: string; withBinary?: boolean },
): void {
  const dir = path.join(extensionsDir, `openai.chatgpt-${version}-${opts.folderSuffix}`, 'bin', opts.binSubfolder);
  fs.mkdirSync(dir, { recursive: true });
  if (opts.withBinary ?? true) fs.writeFileSync(path.join(dir, opts.binaryName), 'fake-binary');
}

function makeWin32Folder(extensionsDir: string, version: string, withBinary = true): void {
  makeChatgptFolder(extensionsDir, version, { folderSuffix: 'win32-x64', binSubfolder: 'windows-x86_64', binaryName: 'codex.exe', withBinary });
}

function makeLinuxFolder(extensionsDir: string, version: string, binSubfolder = 'linux-x64', withBinary = true): void {
  makeChatgptFolder(extensionsDir, version, { folderSuffix: 'linux-x64', binSubfolder, binaryName: 'codex', withBinary });
}

describe('resolveCodexBinary on win32', () => {
  let dir: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agentswitch-test-'));
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('resolves the codex.exe path when exactly one chatgpt extension version is installed', () => {
    makeWin32Folder(dir, '26.5810.52044');

    const result = resolveCodexBinary(dir, 'win32');

    expect(result).toEqual({
      path: path.join(dir, 'openai.chatgpt-26.5810.52044-win32-x64', 'bin', 'windows-x86_64', 'codex.exe'),
      version: '26.5810.52044',
    });
  });

  it('picks the newest version when multiple are installed side by side', () => {
    makeWin32Folder(dir, '26.5810.52044');
    makeWin32Folder(dir, '26.5814.41407');
    makeWin32Folder(dir, '26.5800.10000');

    const result = resolveCodexBinary(dir, 'win32');

    expect(result?.version).toBe('26.5814.41407');
  });

  it("falls back to the next-newest version if the newest one's binary is missing", () => {
    makeWin32Folder(dir, '26.5810.52044');
    makeWin32Folder(dir, '26.5814.41407', /* withBinary */ false);

    const result = resolveCodexBinary(dir, 'win32');

    expect(result?.version).toBe('26.5810.52044');
  });

  it('ignores unrelated extension folders', () => {
    fs.mkdirSync(path.join(dir, 'anthropic.claude-code-2.1.234-win32-x64'), { recursive: true });
    makeWin32Folder(dir, '26.5810.52044');

    const result = resolveCodexBinary(dir, 'win32');

    expect(result?.version).toBe('26.5810.52044');
  });

  it('ignores a linux-x64 folder when resolving for win32', () => {
    makeLinuxFolder(dir, '26.5810.52044');

    expect(resolveCodexBinary(dir, 'win32')).toBeNull();
  });

  it('returns null when no chatgpt extension is installed', () => {
    fs.mkdirSync(path.join(dir, 'anthropic.claude-code-2.1.234-win32-x64'), { recursive: true });

    expect(resolveCodexBinary(dir, 'win32')).toBeNull();
  });

  it('returns null when the extensions directory itself does not exist', () => {
    expect(resolveCodexBinary(path.join(dir, 'missing'), 'win32')).toBeNull();
  });

  it('returns null when every installed version is missing its binary', () => {
    makeWin32Folder(dir, '26.5810.52044', false);

    expect(resolveCodexBinary(dir, 'win32')).toBeNull();
  });
});

describe('resolveCodexBinary on linux', () => {
  let dir: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agentswitch-test-'));
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('resolves the codex binary (no extension) under the linux-x64 extension folder', () => {
    makeLinuxFolder(dir, '26.5810.52044', 'linux-x86_64');

    const result = resolveCodexBinary(dir, 'linux');

    expect(result).toEqual({
      path: path.join(dir, 'openai.chatgpt-26.5810.52044-linux-x64', 'bin', 'linux-x86_64', 'codex'),
      version: '26.5810.52044',
    });
  });

  it('also finds the binary under a linux-x64-named bin subfolder', () => {
    makeLinuxFolder(dir, '26.5810.52044', 'linux-x64');

    const result = resolveCodexBinary(dir, 'linux');

    expect(result?.path).toBe(path.join(dir, 'openai.chatgpt-26.5810.52044-linux-x64', 'bin', 'linux-x64', 'codex'));
  });

  it('picks the newest version when multiple are installed side by side', () => {
    makeLinuxFolder(dir, '26.5810.52044', 'linux-x86_64');
    makeLinuxFolder(dir, '26.5814.41407', 'linux-x86_64');

    const result = resolveCodexBinary(dir, 'linux');

    expect(result?.version).toBe('26.5814.41407');
  });

  it('ignores a win32-x64 folder when resolving for linux', () => {
    makeWin32Folder(dir, '26.5810.52044');

    expect(resolveCodexBinary(dir, 'linux')).toBeNull();
  });

  it('returns null when every installed version is missing its binary', () => {
    makeLinuxFolder(dir, '26.5810.52044', 'linux-x86_64', false);

    expect(resolveCodexBinary(dir, 'linux')).toBeNull();
  });
});

describe('resolveCodexBinary on an unsupported platform', () => {
  it('returns null on darwin rather than guessing a layout that has not been verified', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agentswitch-test-'));
    makeWin32Folder(dir, '26.5810.52044');

    expect(resolveCodexBinary(dir, 'darwin')).toBeNull();

    fs.rmSync(dir, { recursive: true, force: true });
  });
});
