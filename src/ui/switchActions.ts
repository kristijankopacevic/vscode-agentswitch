import type { AppContext } from '../appContext';
import type { ToolId } from '../profiles/ProfileStore';
import { buildAccountRows } from './accountRows';

export type SwitchResult =
  | { kind: 'switched'; toolId: ToolId; label: string }
  | { kind: 'already-active'; toolId: ToolId; label: string }
  | { kind: 'needs-reauth'; toolId: ToolId; label: string }
  | { kind: 'not-found' };

/**
 * The one place a switch is actually decided and performed — used by both
 * the quick pick and the dashboard's inline Switch buttons, so the two
 * surfaces can never disagree about what "switch to X" does. Vaults are
 * touched only in the 'switched' branch: already-active and needs-reauth
 * are reported, not silently turned into a no-op switch.
 */
export async function performSwitch(app: AppContext, toolId: ToolId, profileId: string): Promise<SwitchResult> {
  const rows = buildAccountRows(app.profiles.list(toolId), (t) => app.orchestrator.activeProfileId(t));
  const row = rows.find((r) => r.profileId === profileId);
  if (!row) return { kind: 'not-found' };
  if (row.isActive) return { kind: 'already-active', toolId, label: row.label };
  if (row.needsReauth) return { kind: 'needs-reauth', toolId, label: row.label };

  await app.orchestrator.switchTo(toolId, profileId);
  return { kind: 'switched', toolId, label: row.label };
}
