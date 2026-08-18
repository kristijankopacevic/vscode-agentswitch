import type { Profile, ToolId } from '../profiles/ProfileStore';

export interface AccountRow {
  profileId: string;
  toolId: ToolId;
  label: string;
  isActive: boolean;
  needsReauth: boolean;
}

/**
 * Pure view-model for any account-picking UI (per-tool switch, or the
 * unified all-accounts view): marks which profile is active per tool and
 * puts it first, so a user opening a long account list sees "where am I"
 * before "where could I go". A profile with no stored snapshot can never
 * be shown as active — nothing is actually live for it, whatever the
 * resolver says.
 */
export function buildAccountRows(
  profiles: Profile[],
  activeProfileId: (toolId: ToolId) => string | undefined,
): AccountRow[] {
  return profiles
    .map((p) => ({
      profileId: p.id,
      toolId: p.toolId,
      label: p.label,
      isActive: p.hasSnapshot && activeProfileId(p.toolId) === p.id,
      needsReauth: !p.hasSnapshot,
    }))
    .sort((a, b) => {
      if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
      return a.label.localeCompare(b.label);
    });
}
