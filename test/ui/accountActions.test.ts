import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { attachLiveToProfile, removeProfile } from '../../src/ui/accountActions';
import { ProfileStore } from '../../src/profiles/ProfileStore';
import { SwitchLog } from '../../src/attribution/SwitchLog';
import { SwitchOrchestrator } from '../../src/switch/SwitchOrchestrator';
import { BackupStore } from '../../src/vaults/BackupStore';
import { UsageStore } from '../../src/usage/UsageStore';
import { FakeStateStore, FakeSecretStore } from '../helpers/fakes';
import { FakeVault } from '../helpers/FakeVault';
import type { AppContext } from '../../src/appContext';

describe('attachLiveToProfile / removeProfile', () => {
  let dir: string;
  let app: AppContext;
  let profiles: ProfileStore;
  let codexVault: FakeVault;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agentswitch-test-'));
    const state = new FakeStateStore();
    codexVault = new FakeVault('codex', null); // not signed in by default
    profiles = new ProfileStore(state, new FakeSecretStore());
    const switchLog = new SwitchLog(state);
    const orchestrator = new SwitchOrchestrator({ codex: codexVault }, profiles, new BackupStore(dir), switchLog, state);
    app = {
      profiles,
      switchLog,
      orchestrator,
      usage: new UsageStore(state, switchLog.activeProfileAt.bind(switchLog)),
      vaults: { codex: codexVault, claude: codexVault },
      claudeProjectsDir: dir,
      codexSessionsDir: dir,
    };
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  describe('attachLiveToProfile', () => {
    it('fills in an imported profile\'s credentials from what is currently live, and makes it active', async () => {
      const imported = await profiles.create({ toolId: 'codex', label: 'Imported' }); // no snapshot
      codexVault.live = { account: 'now-signed-in' };

      const result = await attachLiveToProfile(app, 'codex', imported.id);

      expect(result).toEqual({ kind: 'attached', toolId: 'codex', label: 'Imported' });
      expect(await profiles.getSnapshot(imported.id)).toEqual({ account: 'now-signed-in' });
      expect(app.orchestrator.activeProfileId('codex')).toBe(imported.id);
    });

    it('reports "not-signed-in" without changing anything when the vault has no live credentials', async () => {
      const imported = await profiles.create({ toolId: 'codex', label: 'Imported' });

      const result = await attachLiveToProfile(app, 'codex', imported.id);

      expect(result).toEqual({ kind: 'not-signed-in', toolId: 'codex' });
      expect(await profiles.getSnapshot(imported.id)).toBeUndefined();
    });

    it('reports "already-has-credentials" and does not overwrite a profile that already has a snapshot', async () => {
      const existing = await profiles.create({ toolId: 'codex', label: 'Existing', snapshot: { account: 'original' } });
      codexVault.live = { account: 'different' };

      const result = await attachLiveToProfile(app, 'codex', existing.id);

      expect(result).toEqual({ kind: 'already-has-credentials', toolId: 'codex', label: 'Existing' });
      expect(await profiles.getSnapshot(existing.id)).toEqual({ account: 'original' });
    });

    it('reports "not-found" for an unknown profile id', async () => {
      const result = await attachLiveToProfile(app, 'codex', 'no-such-id');

      expect(result).toEqual({ kind: 'not-found' });
    });
  });

  describe('removeProfile', () => {
    it('removes the profile and reports it was not the active one', async () => {
      const target = await profiles.create({ toolId: 'codex', label: 'Gone', snapshot: { account: 'x' } });

      const result = await removeProfile(app, 'codex', target.id);

      expect(result).toEqual({ removed: true, wasActive: false });
      expect(profiles.get(target.id)).toBeUndefined();
    });

    it('clears the active pointer when removing the currently active profile', async () => {
      codexVault.live = { account: 'whatever-was-live-before' };
      const target = await profiles.create({ toolId: 'codex', label: 'Active one', snapshot: { account: 'x' } });
      await app.orchestrator.switchTo('codex', target.id);

      const result = await removeProfile(app, 'codex', target.id);

      expect(result).toEqual({ removed: true, wasActive: true });
      expect(app.orchestrator.activeProfileId('codex')).toBeUndefined();
    });

    it('reports removed:false for an id that does not exist, without throwing', async () => {
      const result = await removeProfile(app, 'codex', 'no-such-id');

      expect(result).toEqual({ removed: false, wasActive: false });
    });
  });
});
