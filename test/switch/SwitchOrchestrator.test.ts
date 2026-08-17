import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { SwitchOrchestrator, NeedsReauthError } from '../../src/switch/SwitchOrchestrator';
import { ProfileStore } from '../../src/profiles/ProfileStore';
import { SwitchLog } from '../../src/attribution/SwitchLog';
import { BackupStore } from '../../src/vaults/BackupStore';
import { FakeStateStore, FakeSecretStore } from '../helpers/fakes';
import { FakeVault } from '../helpers/FakeVault';

describe('SwitchOrchestrator', () => {
  let dir: string;
  let vault: FakeVault;
  let profiles: ProfileStore;
  let backups: BackupStore;
  let switchLog: SwitchLog;
  let state: FakeStateStore;
  let orchestrator: SwitchOrchestrator;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agentswitch-test-'));
    vault = new FakeVault('codex', { account: 'original' });
    state = new FakeStateStore();
    profiles = new ProfileStore(state, new FakeSecretStore());
    backups = new BackupStore(dir);
    switchLog = new SwitchLog(state);
    orchestrator = new SwitchOrchestrator({ codex: vault }, profiles, backups, switchLog, state);
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('switchTo() applies the target profile\'s snapshot to the vault', async () => {
    const target = await profiles.create({ toolId: 'codex', label: 'B', snapshot: { account: 'B' } });

    await orchestrator.switchTo('codex', target.id);

    expect(vault.captureLive()).toEqual({ account: 'B' });
  });

  it('switchTo() backs up what was live before overwriting it', async () => {
    const target = await profiles.create({ toolId: 'codex', label: 'B', snapshot: { account: 'B' } });

    await orchestrator.switchTo('codex', target.id);

    const [backup] = backups.list('codex');
    expect(JSON.parse(fs.readFileSync(backup, 'utf8'))).toEqual({ account: 'original' });
  });

  it('switchTo() records the switch in the switch log', async () => {
    const target = await profiles.create({ toolId: 'codex', label: 'B', snapshot: { account: 'B' } });

    await orchestrator.switchTo('codex', target.id);

    expect(switchLog.recent()[0]).toMatchObject({ toolId: 'codex', profileId: target.id });
  });

  it('switchTo() throws NeedsReauthError and makes no changes when the target has no snapshot', async () => {
    const target = await profiles.create({ toolId: 'codex', label: 'Imported' }); // no snapshot

    await expect(orchestrator.switchTo('codex', target.id)).rejects.toThrow(NeedsReauthError);

    expect(vault.captureLive()).toEqual({ account: 'original' });
    expect(backups.list('codex')).toHaveLength(0);
    expect(switchLog.recent()).toHaveLength(0);
  });

  it('switchTo() captures the outgoing account\'s live state into its own profile first, preserving refreshed tokens', async () => {
    const original = await profiles.create({ toolId: 'codex', label: 'A', snapshot: { account: 'stale' } });
    await orchestrator.switchTo('codex', original.id);
    vault.live = { account: 'refreshed-by-codex-itself' }; // tool refreshed its own token while active
    const target = await profiles.create({ toolId: 'codex', label: 'B', snapshot: { account: 'B' } });

    await orchestrator.switchTo('codex', target.id);

    expect(await profiles.getSnapshot(original.id)).toEqual({ account: 'refreshed-by-codex-itself' });
  });
});
