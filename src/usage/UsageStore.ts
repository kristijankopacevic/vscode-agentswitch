import type { StateStore } from '../profiles/storage';
import type { ToolId } from '../profiles/ProfileStore';
import type { UsageEvent } from './UsageEvent';
import type { ClaudeTranscriptFile } from './discoverFiles';
import { UsageIndex } from './UsageIndex';
import { parseClaudeTranscriptLine } from './ClaudeUsageReader';
import { parseCodexRolloutLine, type CodexRateLimit } from './CodexUsageReader';
import { aggregateUsageEvents, mergeBreakdowns, emptyBreakdown, type UsageBreakdown, type UsageBucket } from './aggregate';

const BREAKDOWN_KEY = 'agentswitch.usageBreakdown';
const RATE_LIMIT_KEY = 'agentswitch.codexRateLimit';
const RECENT_CLAUDE_EVENTS_KEY = 'agentswitch.recentClaudeEvents';
const RECENT_RETENTION_MS = 7 * 24 * 60 * 60 * 1000; // covers both the 5h and 7d windows we display

/**
 * Ties the incremental readers together: polls new lines per file via
 * UsageIndex, parses them, folds them into a persisted all-time breakdown
 * (mergeBreakdowns is additive, so this never re-sums old events), and
 * keeps a short rolling buffer of recent Claude events for the estimated
 * rate-limit window (Claude has no exact one locally — see docs/design.md).
 */
export class UsageStore {
  private readonly claudeIndex: UsageIndex;
  private readonly codexIndex: UsageIndex;

  constructor(
    private readonly state: StateStore,
    private readonly activeProfileAt: (toolId: ToolId, ts: string) => string | undefined,
  ) {
    this.claudeIndex = new UsageIndex(state, 'claude');
    this.codexIndex = new UsageIndex(state, 'codex');
  }

  async refresh(claudeFiles: ClaudeTranscriptFile[], codexFiles: string[]): Promise<UsageBreakdown> {
    const claudeEvents: UsageEvent[] = [];
    for (const { path, project } of claudeFiles) {
      for (const line of await this.claudeIndex.pollNewLines(path)) {
        const event = parseClaudeTranscriptLine(line, project);
        if (event) claudeEvents.push(event);
      }
    }

    const codexEvents: UsageEvent[] = [];
    let latestRateLimit: CodexRateLimit | null = null;
    for (const path of codexFiles) {
      for (const line of await this.codexIndex.pollNewLines(path)) {
        const { event, rateLimit } = parseCodexRolloutLine(line);
        if (event) codexEvents.push(event);
        if (rateLimit) latestRateLimit = rateLimit;
      }
    }
    if (latestRateLimit) await this.state.update(RATE_LIMIT_KEY, latestRateLimit);

    if (claudeEvents.length) await this.appendRecentClaudeEvents(claudeEvents);

    const incoming = aggregateUsageEvents([...claudeEvents, ...codexEvents], this.activeProfileAt);
    const merged = mergeBreakdowns(this.state.get<UsageBreakdown>(BREAKDOWN_KEY) ?? emptyBreakdown(), incoming);
    await this.state.update(BREAKDOWN_KEY, merged);
    return merged;
  }

  getCodexRateLimit(): CodexRateLimit | null {
    return this.state.get<CodexRateLimit>(RATE_LIMIT_KEY) ?? null;
  }

  /** Estimated only — see docs/design.md for why Claude has no exact local rate-limit feed. */
  getClaudeRollingEstimate(windowMs: number, nowIso: string): UsageBucket {
    const cutoff = new Date(new Date(nowIso).getTime() - windowMs).toISOString();
    const recent = (this.state.get<UsageEvent[]>(RECENT_CLAUDE_EVENTS_KEY) ?? []).filter((e) => e.ts >= cutoff);
    return aggregateUsageEvents(recent, () => undefined).overall;
  }

  private async appendRecentClaudeEvents(events: UsageEvent[]): Promise<void> {
    const newestTs = events.reduce((max, e) => (e.ts > max ? e.ts : max), events[0].ts);
    const cutoff = new Date(new Date(newestTs).getTime() - RECENT_RETENTION_MS).toISOString();
    const existing = this.state.get<UsageEvent[]>(RECENT_CLAUDE_EVENTS_KEY) ?? [];
    const kept = [...existing, ...events].filter((e) => e.ts >= cutoff);
    await this.state.update(RECENT_CLAUDE_EVENTS_KEY, kept);
  }
}
