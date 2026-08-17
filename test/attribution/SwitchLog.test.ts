import { describe, it, expect, beforeEach } from 'vitest';
import { SwitchLog } from '../../src/attribution/SwitchLog';
import { FakeStateStore } from '../helpers/fakes';

describe('SwitchLog', () => {
  let clock: number;
  let log: SwitchLog;

  beforeEach(() => {
    clock = 1000;
    log = new SwitchLog(new FakeStateStore(), () => new Date(clock++).toISOString());
  });

  it('append() then recent() returns the entry with its timestamp, tool, and profile', async () => {
    await log.append('codex', 'profile-a');

    const [entry] = log.recent();

    expect(entry).toMatchObject({ toolId: 'codex', profileId: 'profile-a' });
    expect(entry.ts).toBe(new Date(1000).toISOString());
  });

  it('recent() returns entries newest first', async () => {
    await log.append('codex', 'profile-a');
    await log.append('codex', 'profile-b');

    const [newest, oldest] = log.recent();

    expect(newest.profileId).toBe('profile-b');
    expect(oldest.profileId).toBe('profile-a');
  });

  it('activeProfileAt() returns the profile that was active for a tool at a given time', async () => {
    await log.append('codex', 'profile-a'); // ts = 1000
    await log.append('codex', 'profile-b'); // ts = 1001
    await log.append('claude', 'profile-c'); // ts = 1002

    expect(log.activeProfileAt('codex', new Date(1000).toISOString())).toBe('profile-a');
    expect(log.activeProfileAt('codex', new Date(1001).toISOString())).toBe('profile-b');
    expect(log.activeProfileAt('codex', new Date(1500).toISOString())).toBe('profile-b');
  });

  it('activeProfileAt() returns undefined for a time before any switch on that tool', async () => {
    await log.append('codex', 'profile-a'); // ts = 1000

    expect(log.activeProfileAt('codex', new Date(500).toISOString())).toBeUndefined();
  });
});
