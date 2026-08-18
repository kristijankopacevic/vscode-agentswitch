import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { performSwitch } from '../../src/ui/switchActions';
import { ProfileStore } from '../../src/profiles/ProfileStore';
import { SwitchLog } from '../../src/attribution/SwitchLog';
import { SwitchOrchestrator } from '../../src/switch/SwitchOrchestrator';
import { BackupStore } from '../../src/vaults/BackupStore';
import { UsageStore } from '../../src/usage/UsageStore';
import { FakeStateStore, FakeSecretStore } from '../helpers/fakes';
import { FakeVault } from '../helpers/FakeVault';
import type { AppContext } from '../../src/appContext';

describe('performSwitch', () => {
  let dir: string;
  let app: AppContext;
  let profiles: ProfileStore;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agentswitch-test-'));
    const state = new FakeStateStore();
    const codexVault = new FakeVault('codex', { account: 'original' });
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

  it('switches to a signed-in, inactive profile and reports "switched"', async () => {
    const target = await profiles.create({ toolId: 'codex', label: 'Work', snapshot: { account: 'work' } });

    const result = await performSwitch(app, 'codex', target.id);

    expect(result).toEqual({ kind: 'switched', toolId: 'codex', label: 'Work' });
    expect(app.orchestrator.activeProfileId('codex')).toBe(target.id);
  });

  it('reports "already-active" and makes no changes when the profile is already active', async () => {
    const target = await profiles.create({ toolId: 'codex', label: 'Work', snapshot: { account: 'work' } });
    await performSwitch(app, 'codex', target.id);

    const result = await performSwitch(app, 'codex', target.id);

    expect(result).toEqual({ kind: 'already-active', toolId: 'codex', label: 'Work' });
  });

  it('reports "needs-reauth" without attempting a switch for an imported profile with no snapshot', async () => {
    const target = await profiles.create({ toolId: 'codex', label: 'Imported' }); // no snapshot

    const result = await performSwitch(app, 'codex', target.id);

    expect(result).toEqual({ kind: 'needs-reauth', toolId: 'codex', label: 'Imported' });
    expect(app.orchestrator.activeProfileId('codex')).toBeUndefined();
  });

  it('reports "not-found" for a profile id that does not exist', async () => {
    const result = await performSwitch(app, 'codex', 'no-such-id');

    expect(result).toEqual({ kind: 'not-found' });
  });
});
