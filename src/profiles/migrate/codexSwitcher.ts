import type { ProfileStore, Profile } from '../ProfileStore';

interface CodexSwitcherProfile {
  name?: string;
  email?: string;
  [key: string]: unknown;
}

interface CodexSwitcherFile {
  version?: number;
  profiles?: CodexSwitcherProfile[];
}

/**
 * Imports identities from dondakeltd.vscode-codex-switcher's profiles.json.
 * Tokens live in that extension's own SecretStorage namespace, which we
 * cannot read — so every imported profile has no snapshot, and needs one
 * re-authentication before it can be switched to.
 */
export async function importCodexSwitcherProfiles(
  store: ProfileStore,
  file: CodexSwitcherFile,
): Promise<Profile[]> {
  const imported: Profile[] = [];
  for (const source of file.profiles ?? []) {
    const label = source.name?.trim() || source.email || 'Imported Codex account';
    const { name: _name, email, ...rest } = source;
    const profile = await store.create({
      toolId: 'codex',
      label,
      metadata: { email, ...rest },
    });
    imported.push(profile);
  }
  return imported;
}
