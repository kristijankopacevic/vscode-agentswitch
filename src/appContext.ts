import * as vscode from 'vscode';
import fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { CodexVault } from './vaults/CodexVault';
import { ClaudeVault } from './vaults/ClaudeVault';
import { BackupStore } from './vaults/BackupStore';
import { ProfileStore, type ToolId } from './profiles/ProfileStore';
import { importCodexSwitcherProfiles } from './profiles/migrate/codexSwitcher';
import { SwitchLog } from './attribution/SwitchLog';
import { SwitchOrchestrator } from './switch/SwitchOrchestrator';
import { UsageStore } from './usage/UsageStore';
import type { Vault } from './vaults/Vault';

export interface AppContext {
  profiles: ProfileStore;
  switchLog: SwitchLog;
  orchestrator: SwitchOrchestrator;
  usage: UsageStore;
  vaults: Record<ToolId, Vault>;
  claudeProjectsDir: string;
  codexSessionsDir: string;
}

/**
 * Wires every collaborator from a real ExtensionContext and real
 * filesystem paths. context.globalState/context.secrets satisfy
 * StateStore/SecretStore structurally (see src/profiles/storage.ts) —
 * that's what lets everything below this be tested without vscode.
 */
export function buildAppContext(context: vscode.ExtensionContext): AppContext {
  const home = os.homedir();
  const codexVault = new CodexVault(path.join(home, '.codex', 'auth.json'));
  const claudeVault = new ClaudeVault(path.join(home, '.claude', '.credentials.json'));
  const backups = new BackupStore(path.join(context.globalStorageUri.fsPath, 'backups'));
  const profiles = new ProfileStore(context.globalState, context.secrets);
  const switchLog = new SwitchLog(context.globalState);
  const vaults: Record<ToolId, Vault> = { codex: codexVault, claude: claudeVault };
  const orchestrator = new SwitchOrchestrator(vaults, profiles, backups, switchLog, context.globalState);
  const usage = new UsageStore(context.globalState, switchLog.activeProfileAt.bind(switchLog));

  return {
    profiles,
    switchLog,
    orchestrator,
    usage,
    vaults,
    claudeProjectsDir: path.join(home, '.claude', 'projects'),
    codexSessionsDir: path.join(home, '.codex', 'sessions'),
  };
}

const MIGRATION_FLAG_KEY = 'agentswitch.migratedCodexSwitcher';

function codexSwitcherProfilesPath(): string | null {
  // codex-switcher's globalStorage path is not exposed by any vscode API —
  // there is no way to ask VS Code for another extension's storage
  // location — so this is the known on-disk layout, Windows-only for now
  // (see the Windows-first limitation in docs/design.md).
  if (process.platform !== 'win32') return null;
  return path.join(os.homedir(), 'AppData', 'Roaming', 'Code', 'User', 'globalStorage', 'dondakeltd.vscode-codex-switcher', 'profiles.json');
}

/**
 * One-time import of codex-switcher's identities. Runs at most once per
 * install (tracked in globalState) and never throws — a migration failure
 * must not block the extension from activating.
 */
export async function migrateCodexSwitcherIfNeeded(
  context: vscode.ExtensionContext,
  profiles: ProfileStore,
): Promise<number> {
  if (context.globalState.get(MIGRATION_FLAG_KEY)) return 0;
  await context.globalState.update(MIGRATION_FLAG_KEY, true);

  const profilesPath = codexSwitcherProfilesPath();
  if (!profilesPath || !fs.existsSync(profilesPath)) return 0;

  try {
    const json = JSON.parse(fs.readFileSync(profilesPath, 'utf8'));
    const imported = await importCodexSwitcherProfiles(profiles, json);
    return imported.length;
  } catch (err) {
    console.error('AgentSwitch: codex-switcher migration failed', err);
    return 0;
  }
}
