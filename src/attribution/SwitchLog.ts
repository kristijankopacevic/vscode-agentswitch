import type { StateStore } from '../profiles/storage';
import type { ToolId } from '../profiles/ProfileStore';

export interface SwitchLogEntry {
  ts: string;
  toolId: ToolId;
  profileId: string;
}

const LOG_KEY = 'agentswitch.switchLog';
const MAX_ENTRIES = 5000;

/**
 * An append-only record of every switch. This is what lets usage recorded
 * later be attributed to the account that was active at the time — usage
 * events carry no account id of their own.
 */
export class SwitchLog {
  constructor(
    private readonly state: StateStore,
    private readonly now: () => string = () => new Date().toISOString(),
  ) {}

  async append(toolId: ToolId, profileId: string): Promise<void> {
    const entries = [...this.all(), { ts: this.now(), toolId, profileId }].slice(-MAX_ENTRIES);
    await this.state.update(LOG_KEY, entries);
  }

  /** Chronological (oldest first) — the natural order for attribution lookups. */
  all(): SwitchLogEntry[] {
    return this.state.get<SwitchLogEntry[]>(LOG_KEY) ?? [];
  }

  /** Newest first — the natural order for a history view. */
  recent(limit?: number): SwitchLogEntry[] {
    const reversed = [...this.all()].reverse();
    return limit === undefined ? reversed : reversed.slice(0, limit);
  }

  /** The profile active on `toolId` at `ts`, or undefined if none had switched in yet. */
  activeProfileAt(toolId: ToolId, ts: string): string | undefined {
    let active: string | undefined;
    for (const entry of this.all()) {
      if (entry.toolId !== toolId) continue;
      if (entry.ts > ts) break;
      active = entry.profileId;
    }
    return active;
  }
}
