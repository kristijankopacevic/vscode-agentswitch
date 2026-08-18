import { describe, it, expect } from 'vitest';
import { buildAuthCommand } from '../../src/tools/toolCommands';

describe('buildAuthCommand', () => {
  it('builds Claude login as "claude auth login"', () => {
    expect(buildAuthCommand('claude', 'login', null)).toBe('claude auth login');
  });

  it('builds Claude logout as "claude auth logout"', () => {
    expect(buildAuthCommand('claude', 'logout', null)).toBe('claude auth logout');
  });

  it('builds Claude status as "claude auth status --json"', () => {
    expect(buildAuthCommand('claude', 'status', null)).toBe('claude auth status --json');
  });

  it('builds Codex login using the resolved binary path, quoted for a path with spaces, with the PowerShell call operator on win32', () => {
    const cmd = buildAuthCommand('codex', 'login', 'C:\\Program Files\\codex.exe', 'win32');

    expect(cmd).toBe('& "C:\\Program Files\\codex.exe" login');
  });

  it('builds Codex logout using the resolved binary path, with the PowerShell call operator on win32', () => {
    const cmd = buildAuthCommand('codex', 'logout', 'C:\\tools\\codex.exe', 'win32');

    expect(cmd).toBe('& "C:\\tools\\codex.exe" logout');
  });

  it('builds Codex status as "login status" (codex has no separate status verb), with the PowerShell call operator on win32', () => {
    const cmd = buildAuthCommand('codex', 'status', 'C:\\tools\\codex.exe', 'win32');

    expect(cmd).toBe('& "C:\\tools\\codex.exe" login status');
  });

  it('builds Codex login on linux without the PowerShell call operator — bash needs only quoting', () => {
    const cmd = buildAuthCommand('codex', 'login', '/home/kris/.vscode-server/extensions/openai.chatgpt-1.0.0-linux-x64/bin/linux-x64/codex', 'linux');

    expect(cmd).toBe('"/home/kris/.vscode-server/extensions/openai.chatgpt-1.0.0-linux-x64/bin/linux-x64/codex" login');
  });

  it('builds Codex logout on linux without the PowerShell call operator', () => {
    const cmd = buildAuthCommand('codex', 'logout', '/home/kris/codex', 'linux');

    expect(cmd).toBe('"/home/kris/codex" logout');
  });

  it('throws for codex when no binary path is given, rather than emitting a broken command', () => {
    expect(() => buildAuthCommand('codex', 'login', null, 'win32')).toThrow();
  });
});
