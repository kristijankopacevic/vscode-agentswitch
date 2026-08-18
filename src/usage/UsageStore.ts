import type { StateStore } from '../profiles/storage';
import type { ToolId } from '../profiles/ProfileStore';
import type { UsageEvent } from './UsageEvent';
import type { ClaudeTranscriptFile } from './discoverFiles';
import { UsageIndex } from './UsageIndex';
import { parseClaudeTranscriptLine } from './ClaudeUsageReader';
import { parseCodexRolloutLine, coerceRateLimit, type CodexRateLimits } from './CodexUsageReader';
import { aggregateUsageEvents, mergeBreakdowns, emptyBreakdown, type UsageBreakdown, type UsageBucket } from './aggregate';

const BREAKDOWN_KEY = 'agentswitch.usageBreakdown';
const RATE_LIMIT_KEY = 'agentswitch.codexRateLimit';
const RECENT_CLAUDE_EVENTS_KEY = 'agentswitch.recentClaudeEvents';
const RECENT_CODEX_EVENTS_KEY = 'agentswitch.recentCodexEvents';
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
    const persisted = this.getCodexRateLimits();
    let primary = persisted.primary;
    let secondary = persisted.secondary;
    let sawAny = false;
    for (const path of codexFiles) {
      for (const line of await this.codexIndex.pollNewLines(path)) {
        const { event, rateLimits } = parseCodexRolloutLine(line);
        if (event) codexEvents.push(event);
        if (rateLimits?.primary) {
          primary = rateLimits.primary;
          sawAny = true;
        }
        if (rateLimits?.secondary) {
          secondary = rateLimits.secondary;
          sawAny = true;
        }
      }
    }
    if (sawAny) await this.state.update(RATE_LIMIT_KEY, { primary, secondary });

    if (claudeEvents.length) await this.appendRecentEvents(RECENT_CLAUDE_EVENTS_KEY, claudeEvents);
    if (codexEvents.length) await this.appendRecentEvents(RECENT_CODEX_EVENTS_KEY, codexEvents);

    const incoming = aggregateUsageEvents([...claudeEvents, ...codexEvents], this.activeProfileAt);
    const merged = mergeBreakdowns(this.state.get<UsageBreakdown>(BREAKDOWN_KEY) ?? emptyBreakdown(), incoming);
    await this.state.update(BREAKDOWN_KEY, merged);
    return merged;
  }

  getCurrentBreakdown(): UsageBreakdown {
    return this.state.get<UsageBreakdown>(BREAKDOWN_KEY) ?? emptyBreakdown();
  }

  getCodexRateLimits(): CodexRateLimits {
    const raw = this.state.get<Record<string, unknown>>(RATE_LIMIT_KEY);
    return { primary: coerceRateLimit(raw?.primary), secondary: coerceRateLimit(raw?.secondary) };
  }

  /** Estimated only — see docs/design.md for why Claude has no exact local rate-limit feed. */
  getClaudeRollingEstimate(windowMs: number, nowIso: string): UsageBucket {
    return this.rollingEstimate(RECENT_CLAUDE_EVENTS_KEY, windowMs, nowIso);
  }

  /**
   * Codex's rate-limit windows report an exact percentage but no token
   * count, so this fills in "how much did that percentage cost" the same
   * way Claude's estimate does — a rolling sum over the same 5h/7d buckets
   * the status bar and dashboard already use for Claude.
   */
  getCodexRollingEstimate(windowMs: number, nowIso: string): UsageBucket {
    return this.rollingEstimate(RECENT_CODEX_EVENTS_KEY, windowMs, nowIso);
  }

  private rollingEstimate(key: string, windowMs: number, nowIso: string): UsageBucket {
    const cutoff = new Date(new Date(nowIso).getTime() - windowMs).toISOString();
    const recent = (this.state.get<UsageEvent[]>(key) ?? []).filter((e) => e.ts >= cutoff);
    return aggregateUsageEvents(recent, () => undefined).overall;
  }

  private async appendRecentEvents(key: string, events: UsageEvent[]): Promise<void> {
    const newestTs = events.reduce((max, e) => (e.ts > max ? e.ts : max), events[0].ts);
    const cutoff = new Date(new Date(newestTs).getTime() - RECENT_RETENTION_MS).toISOString();
    const existing = this.state.get<UsageEvent[]>(key) ?? [];
    const kept = [...existing, ...events].filter((e) => e.ts >= cutoff);
    await this.state.update(key, kept);
  }
}
