import { describe, it, expect } from 'vitest';
import * as path from 'node:path';
import { resolveCodexSwitcherProfilesPath } from '../../../src/profiles/migrate/codexSwitcherPath';

describe('resolveCodexSwitcherProfilesPath', () => {
  it('resolves under %APPDATA%-equivalent Code globalStorage on win32', () => {
    const result = resolveCodexSwitcherProfilesPath('C:\\Users\\kris', 'win32');

    expect(result).toBe(
      path.join('C:\\Users\\kris', 'AppData', 'Roaming', 'Code', 'User', 'globalStorage', 'dondakeltd.vscode-codex-switcher', 'profiles.json'),
    );
  });

  it('resolves under ~/.config/Code globalStorage on linux', () => {
    const result = resolveCodexSwitcherProfilesPath('/home/kris', 'linux');

    expect(result).toBe(
      path.join('/home/kris', '.config', 'Code', 'User', 'globalStorage', 'dondakeltd.vscode-codex-switcher', 'profiles.json'),
    );
  });

  it('returns null on an unsupported platform rather than guessing', () => {
    expect(resolveCodexSwitcherProfilesPath('/Users/kris', 'darwin')).toBeNull();
  });
});
