import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { resolveCodexBinary } from '../../src/tools/codexBinary';

function makeChatgptFolder(extensionsDir: string, version: string, withBinary = true): void {
  const dir = path.join(extensionsDir, `openai.chatgpt-${version}-win32-x64`, 'bin', 'windows-x86_64');
  fs.mkdirSync(dir, { recursive: true });
  if (withBinary) fs.writeFileSync(path.join(dir, 'codex.exe'), 'fake-binary');
}

describe('resolveCodexBinary', () => {
  let dir: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agentswitch-test-'));
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('resolves the codex.exe path when exactly one chatgpt extension version is installed', () => {
    makeChatgptFolder(dir, '26.5810.52044');

    const result = resolveCodexBinary(dir);

    expect(result).toEqual({
      path: path.join(dir, 'openai.chatgpt-26.5810.52044-win32-x64', 'bin', 'windows-x86_64', 'codex.exe'),
      version: '26.5810.52044',
    });
  });

  it('picks the newest version when multiple are installed side by side', () => {
    makeChatgptFolder(dir, '26.5810.52044');
    makeChatgptFolder(dir, '26.5814.41407');
    makeChatgptFolder(dir, '26.5800.10000');

    const result = resolveCodexBinary(dir);

    expect(result?.version).toBe('26.5814.41407');
  });

  it("falls back to the next-newest version if the newest one's binary is missing", () => {
    makeChatgptFolder(dir, '26.5810.52044');
    makeChatgptFolder(dir, '26.5814.41407', /* withBinary */ false);

    const result = resolveCodexBinary(dir);

    expect(result?.version).toBe('26.5810.52044');
  });

  it('ignores unrelated extension folders', () => {
    fs.mkdirSync(path.join(dir, 'anthropic.claude-code-2.1.234-win32-x64'), { recursive: true });
    makeChatgptFolder(dir, '26.5810.52044');

    const result = resolveCodexBinary(dir);

    expect(result?.version).toBe('26.5810.52044');
  });

  it('returns null when no chatgpt extension is installed', () => {
    fs.mkdirSync(path.join(dir, 'anthropic.claude-code-2.1.234-win32-x64'), { recursive: true });

    expect(resolveCodexBinary(dir)).toBeNull();
  });

  it('returns null when the extensions directory itself does not exist', () => {
    expect(resolveCodexBinary(path.join(dir, 'missing'))).toBeNull();
  });

  it('returns null when every installed version is missing its binary', () => {
    makeChatgptFolder(dir, '26.5810.52044', false);

    expect(resolveCodexBinary(dir)).toBeNull();
  });
});
