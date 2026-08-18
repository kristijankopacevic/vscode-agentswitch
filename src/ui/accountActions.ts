import type { AppContext } from '../appContext';
import type { ToolId } from '../profiles/ProfileStore';

export type AttachResult =
  | { kind: 'attached'; toolId: ToolId; label: string }
  | { kind: 'already-has-credentials'; toolId: ToolId; label: string }
  | { kind: 'not-signed-in'; toolId: ToolId }
  | { kind: 'not-found' };

/**
 * Fills in credentials for a profile that has none yet (e.g. one imported
 * from codex-switcher, which carries identity but not tokens — VS Code
 * SecretStorage can't be read across extensions) from whatever is
 * currently live in the vault, then makes it the active profile. This is
 * the only path that can ever turn a needs-sign-in import into a usable
 * account — performSwitch() refuses those on purpose.
 */
export async function attachLiveToProfile(app: AppContext, toolId: ToolId, profileId: string): Promise<AttachResult> {
  const profile = app.profiles.get(profileId);
  if (!profile || profile.toolId !== toolId) return { kind: 'not-found' };
  if (profile.hasSnapshot) return { kind: 'already-has-credentials', toolId, label: profile.label };

  const live = app.vaults[toolId].captureLiveSafe();
  if (!live) return { kind: 'not-signed-in', toolId };

  await app.profiles.setSnapshot(profileId, live);
  await app.orchestrator.adoptCurrentAsActive(toolId, profileId);
  return { kind: 'attached', toolId, label: profile.label };
}

export interface RemoveProfileResult {
  removed: boolean;
  /** Whether the removed profile was the active one — the caller decides how loudly to warn about this before calling. */
  wasActive: boolean;
}

/**
 * Removes a profile and, if it was the active one, clears the active
 * pointer too — ProfileStore.remove() alone leaves that pointer dangling
 * at a profile id that no longer exists (the bug that motivated this
 * function existing at all).
 */
export async function removeProfile(app: AppContext, toolId: ToolId, profileId: string): Promise<RemoveProfileResult> {
  const existed = app.profiles.get(profileId) !== undefined;
  const wasActive = app.orchestrator.activeProfileId(toolId) === profileId;

  if (existed) await app.profiles.remove(profileId);
  if (wasActive) await app.orchestrator.clearActiveProfile(toolId);

  return { removed: existed, wasActive };
}
