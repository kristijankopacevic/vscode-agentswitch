import { describe, it, expect } from 'vitest';
import { buildAccountRows } from '../../src/ui/accountRows';
import type { Profile } from '../../src/profiles/ProfileStore';

function profile(overrides: Partial<Profile> = {}): Profile {
  return {
    id: 'id',
    toolId: 'codex',
    label: 'Label',
    metadata: {},
    hasSnapshot: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('buildAccountRows', () => {
  it('marks the profile matching the resolver as active for its tool', () => {
    const profiles = [profile({ id: 'a', toolId: 'codex' }), profile({ id: 'b', toolId: 'codex' })];

    const rows = buildAccountRows(profiles, (toolId) => (toolId === 'codex' ? 'a' : undefined));

    expect(rows.find((r) => r.profileId === 'a')?.isActive).toBe(true);
    expect(rows.find((r) => r.profileId === 'b')?.isActive).toBe(false);
  });

  it('resolves the active profile independently per tool', () => {
    const profiles = [
      profile({ id: 'codex-active', toolId: 'codex', label: 'Codex Work' }),
      profile({ id: 'claude-active', toolId: 'claude', label: 'Claude Work' }),
    ];

    const rows = buildAccountRows(profiles, (toolId) => (toolId === 'codex' ? 'codex-active' : 'claude-active'));

    expect(rows.every((r) => r.isActive)).toBe(true);
  });

  it('sorts the active profile to the top, then the rest alphabetically', () => {
    const profiles = [
      profile({ id: 'c', label: 'Charlie' }),
      profile({ id: 'a', label: 'Alice' }),
      profile({ id: 'b', label: 'Bob' }),
    ];

    const rows = buildAccountRows(profiles, () => 'b');

    expect(rows.map((r) => r.profileId)).toEqual(['b', 'a', 'c']);
  });

  it('flags a profile with no stored snapshot as needing reauth', () => {
    const profiles = [profile({ id: 'a', hasSnapshot: false })];

    const rows = buildAccountRows(profiles, () => undefined);

    expect(rows[0].needsReauth).toBe(true);
  });

  it('never marks a needs-reauth profile as active even if the resolver names it', () => {
    // A profile that was never signed into cannot really be "the live account".
    const profiles = [profile({ id: 'a', hasSnapshot: false })];

    const rows = buildAccountRows(profiles, () => 'a');

    expect(rows[0].isActive).toBe(false);
  });

  it('returns an empty array for no profiles', () => {
    expect(buildAccountRows([], () => undefined)).toEqual([]);
  });
});
