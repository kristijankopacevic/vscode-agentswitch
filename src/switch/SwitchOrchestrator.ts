import type { Vault } from '../vaults/Vault';
import type { BackupStore } from '../vaults/BackupStore';
import type { SwitchLog } from '../attribution/SwitchLog';
import type { ProfileStore, ToolId } from '../profiles/ProfileStore';
import type { StateStore } from '../profiles/storage';

export class NeedsReauthError extends Error {
  constructor(public readonly profileId: string) {
    super(`Profile ${profileId} has no stored credentials and needs to be re-authenticated.`);
    this.name = 'NeedsReauthError';
  }
}

const activeProfileKey = (toolId: ToolId): string => `agentswitch.activeProfile.${toolId}`;

/**
 * Orchestrates a switch across vault, profile store, backups, and the
 * switch log. The target's snapshot is checked BEFORE anything else runs,
 * so a NeedsReauthError leaves every collaborator untouched — no backup
 * written, no log entry, no vault write.
 */
export class SwitchOrchestrator {
  constructor(
    private readonly vaults: Partial<Record<ToolId, Vault>>,
    private readonly profiles: ProfileStore,
    private readonly backups: BackupStore,
    private readonly switchLog: SwitchLog,
    private readonly state: StateStore,
  ) {}

  activeProfileId(toolId: ToolId): string | undefined {
    return this.state.get<string>(activeProfileKey(toolId));
  }

  /**
   * Marks `profileId` as active for `toolId` without touching the vault —
   * used by "Add Account", which captures whatever is already live into a
   * new profile. There is nothing to switch to and nothing to back up.
   */
  async adoptCurrentAsActive(toolId: ToolId, profileId: string): Promise<void> {
    await this.state.update(activeProfileKey(toolId), profileId);
    await this.switchLog.append(toolId, profileId);
  }

  async switchTo(toolId: ToolId, targetProfileId: string): Promise<void> {
    const vault = this.vaults[toolId];
    if (!vault) throw new Error(`No vault registered for tool "${toolId}".`);

    const targetSnapshot = await this.profiles.getSnapshot(targetProfileId);
    if (!targetSnapshot) throw new NeedsReauthError(targetProfileId);

    const live = vault.captureLive();
    this.backups.write(toolId, JSON.stringify(live));

    const currentId = this.activeProfileId(toolId);
    if (currentId && this.profiles.get(currentId)) {
      await this.profiles.setSnapshot(currentId, live);
    }

    vault.applyLive(targetSnapshot);
    await this.state.update(activeProfileKey(toolId), targetProfileId);
    await this.switchLog.append(toolId, targetProfileId);
  }
}
