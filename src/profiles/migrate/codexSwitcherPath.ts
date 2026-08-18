import * as path from 'node:path';

/**
 * codex-switcher's globalStorage path isn't exposed by any vscode API —
 * there's no way to ask VS Code for another extension's storage location —
 * so this is the known on-disk layout per platform. `home` and `platform`
 * are parameters (rather than reading os.homedir()/process.platform
 * directly) so every branch is testable from any host OS.
 */
export function resolveCodexSwitcherProfilesPath(home: string, platform: NodeJS.Platform): string | null {
  if (platform === 'win32') {
    return path.join(home, 'AppData', 'Roaming', 'Code', 'User', 'globalStorage', 'dondakeltd.vscode-codex-switcher', 'profiles.json');
  }
  if (platform === 'linux') {
    return path.join(home, '.config', 'Code', 'User', 'globalStorage', 'dondakeltd.vscode-codex-switcher', 'profiles.json');
  }
  return null;
}
