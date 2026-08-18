import fs from 'node:fs';
import { atomicWrite } from './atomicWrite';
import { readJsonSafe } from './readJsonSafe';
import type { Vault } from './Vault';

/**
 * Owns `~/.codex/auth.json`. Codex has no section shared across accounts
 * (unlike Claude's mcpOAuth), so a switch replaces the whole file.
 */
export class CodexVault implements Vault {
  readonly toolId = 'codex';

  constructor(private readonly authPath: string) {}

  captureLive(): Record<string, unknown> {
    return JSON.parse(fs.readFileSync(this.authPath, 'utf8'));
  }

  captureLiveSafe(): Record<string, unknown> | null {
    return readJsonSafe(this.authPath);
  }

  applyLive(snapshot: Record<string, unknown>): void {
    atomicWrite(this.authPath, JSON.stringify(snapshot, null, 2));
  }
}
