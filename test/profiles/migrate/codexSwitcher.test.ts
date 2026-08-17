import { describe, it, expect, beforeEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { ProfileStore } from '../../../src/profiles/ProfileStore';
import { importCodexSwitcherProfiles } from '../../../src/profiles/migrate/codexSwitcher';
import { FakeStateStore, FakeSecretStore } from '../../helpers/fakes';

const FIXTURE = path.join(__dirname, '..', '..', 'fixtures', 'codex-switcher-profiles-sample.json');

describe('importCodexSwitcherProfiles', () => {
  let store: ProfileStore;

  beforeEach(() => {
    store = new ProfileStore(new FakeStateStore(), new FakeSecretStore());
  });

  it('creates one AgentSwitch profile per codex-switcher profile, without a snapshot', async () => {
    const json = JSON.parse(fs.readFileSync(FIXTURE, 'utf8'));

    const imported = await importCodexSwitcherProfiles(store, json);

    expect(imported).toHaveLength(2);
    expect(imported.every((p) => p.toolId === 'codex')).toBe(true);
    expect(imported.every((p) => p.hasSnapshot === false)).toBe(true);
  });

  it('uses the profile name as the label when present', async () => {
    const json = JSON.parse(fs.readFileSync(FIXTURE, 'utf8'));

    const [work] = await importCodexSwitcherProfiles(store, json);

    expect(work.label).toBe('Work');
  });

  it('falls back to email as the label when name is blank', async () => {
    const json = JSON.parse(fs.readFileSync(FIXTURE, 'utf8'));

    const [, personal] = await importCodexSwitcherProfiles(store, json);

    expect(personal.label).toBe('personal@example.com');
  });

  it('preserves the source fields as metadata for display', async () => {
    const json = JSON.parse(fs.readFileSync(FIXTURE, 'utf8'));

    const [work] = await importCodexSwitcherProfiles(store, json);

    expect(work.metadata).toMatchObject({
      email: 'work@example.com',
      planType: 'team',
      defaultOrganizationTitle: 'ExampleOrg',
    });
  });

  it('imports nothing and returns an empty array for a file with no profiles', async () => {
    const imported = await importCodexSwitcherProfiles(store, { version: 1, profiles: [] });

    expect(imported).toEqual([]);
  });
});
