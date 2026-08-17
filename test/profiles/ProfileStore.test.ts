import { describe, it, expect, beforeEach } from 'vitest';
import { ProfileStore } from '../../src/profiles/ProfileStore';
import { FakeStateStore, FakeSecretStore } from '../helpers/fakes';

describe('ProfileStore', () => {
  let state: FakeStateStore;
  let secrets: FakeSecretStore;
  let store: ProfileStore;

  beforeEach(() => {
    state = new FakeStateStore();
    secrets = new FakeSecretStore();
    store = new ProfileStore(state, secrets);
  });

  it('create() adds a profile that list() then returns', async () => {
    await store.create({ toolId: 'codex', label: 'Work', metadata: { email: 'work@example.com' } });

    const profiles = store.list('codex');

    expect(profiles).toHaveLength(1);
    expect(profiles[0].label).toBe('Work');
    expect(profiles[0].metadata).toEqual({ email: 'work@example.com' });
  });

  it('list() filters by toolId', async () => {
    await store.create({ toolId: 'codex', label: 'Codex work' });
    await store.create({ toolId: 'claude', label: 'Claude work' });

    expect(store.list('codex')).toHaveLength(1);
    expect(store.list('claude')).toHaveLength(1);
    expect(store.list()).toHaveLength(2);
  });

  it('create() with a snapshot makes it retrievable via getSnapshot() and marks hasSnapshot true', async () => {
    const profile = await store.create({ toolId: 'codex', label: 'Work', snapshot: { token: 'abc' } });

    const snapshot = await store.getSnapshot(profile.id);

    expect(snapshot).toEqual({ token: 'abc' });
    expect(store.get(profile.id)?.hasSnapshot).toBe(true);
  });

  it('create() without a snapshot leaves hasSnapshot false and getSnapshot() undefined', async () => {
    const profile = await store.create({ toolId: 'codex', label: 'Imported, needs reauth' });

    expect(store.get(profile.id)?.hasSnapshot).toBe(false);
    expect(await store.getSnapshot(profile.id)).toBeUndefined();
  });

  it('setSnapshot() stores a snapshot for an existing profile and flips hasSnapshot to true', async () => {
    const profile = await store.create({ toolId: 'codex', label: 'Imported, needs reauth' });

    await store.setSnapshot(profile.id, { token: 'freshly-authed' });

    expect(await store.getSnapshot(profile.id)).toEqual({ token: 'freshly-authed' });
    expect(store.get(profile.id)?.hasSnapshot).toBe(true);
  });

  it('rename() changes the label without touching the snapshot', async () => {
    const profile = await store.create({ toolId: 'codex', label: 'Old', snapshot: { token: 'abc' } });

    await store.rename(profile.id, 'New');

    expect(store.get(profile.id)?.label).toBe('New');
    expect(await store.getSnapshot(profile.id)).toEqual({ token: 'abc' });
  });

  it('remove() deletes both the profile and its secret snapshot', async () => {
    const profile = await store.create({ toolId: 'codex', label: 'Work', snapshot: { token: 'abc' } });

    await store.remove(profile.id);

    expect(store.get(profile.id)).toBeUndefined();
    expect(await store.getSnapshot(profile.id)).toBeUndefined();
    expect(secrets.has(`agentswitch.profile.${profile.id}.snapshot`)).toBe(false);
  });
});
