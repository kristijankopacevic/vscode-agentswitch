import fs from 'node:fs';
import { atomicWrite } from './atomicWrite';
import type { Vault } from './Vault';

const MANAGED_KEYS = ['claudeAiOauth', 'organizationUuid'] as const;

/**
 * Owns `~/.claude/.credentials.json`. Unlike Codex, this file also holds
 * `mcpOAuth` — logins for MCP servers (e.g. Power BI). Those belong to you
 * and to the server, not to whichever Claude account is billing, so a
 * switch must never touch them: applyLive() replaces only `claudeAiOauth`
 * and `organizationUuid`, copying every other top-level key — known or not
 * — from the live file unchanged.
 */
export class ClaudeVault implements Vault {
  readonly toolId = 'claude';

  constructor(private readonly credentialsPath: string) {}

  captureLive(): Record<string, unknown> {
    return JSON.parse(fs.readFileSync(this.credentialsPath, 'utf8'));
  }

  applyLive(snapshot: Record<string, unknown>): void {
    const live = this.captureLive();
    const merged: Record<string, unknown> = { ...live };
    for (const key of MANAGED_KEYS) {
      merged[key] = snapshot[key];
    }
    atomicWrite(this.credentialsPath, JSON.stringify(merged, null, 2));
  }
}
