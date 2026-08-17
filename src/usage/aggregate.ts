import type { UsageEvent } from './UsageEvent';

export interface UsageBucket {
  inputTokens: number;
  outputTokens: number;
  cacheReadInputTokens: number;
  cacheCreationInputTokens: number;
  eventCount: number;
}

export interface UsageBreakdown {
  overall: UsageBucket;
  byProfile: Record<string, UsageBucket>;
  byProject: Record<string, UsageBucket>;
}

const UNATTRIBUTED = 'unattributed';
const UNKNOWN_PROJECT = 'unknown';

function emptyBucket(): UsageBucket {
  return { inputTokens: 0, outputTokens: 0, cacheReadInputTokens: 0, cacheCreationInputTokens: 0, eventCount: 0 };
}

export function emptyBreakdown(): UsageBreakdown {
  return { overall: emptyBucket(), byProfile: {}, byProject: {} };
}

function addInto(bucket: UsageBucket, event: UsageEvent): void {
  bucket.inputTokens += event.inputTokens;
  bucket.outputTokens += event.outputTokens;
  bucket.cacheReadInputTokens += event.cacheReadInputTokens;
  bucket.cacheCreationInputTokens += event.cacheCreationInputTokens;
  bucket.eventCount += 1;
}

function bucketFor(map: Record<string, UsageBucket>, key: string): UsageBucket {
  return map[key] ?? (map[key] = emptyBucket());
}

/**
 * Folds usage events into totals overall, per account, and per project.
 * `activeProfileAt` resolves which profile was active for an event's tool
 * at its timestamp — pass `switchLog.activeProfileAt.bind(switchLog)` in
 * production. Historical usage recorded before any switch was logged
 * resolves to undefined and lands in "unattributed" rather than being
 * guessed at.
 */
export function aggregateUsageEvents(
  events: UsageEvent[],
  activeProfileAt: (toolId: UsageEvent['toolId'], ts: string) => string | undefined,
): UsageBreakdown {
  const breakdown = emptyBreakdown();
  for (const event of events) {
    addInto(breakdown.overall, event);
    addInto(bucketFor(breakdown.byProfile, activeProfileAt(event.toolId, event.ts) ?? UNATTRIBUTED), event);
    addInto(bucketFor(breakdown.byProject, event.project ?? UNKNOWN_PROJECT), event);
  }
  return breakdown;
}

function mergeBuckets(a: UsageBucket, b: UsageBucket): UsageBucket {
  return {
    inputTokens: a.inputTokens + b.inputTokens,
    outputTokens: a.outputTokens + b.outputTokens,
    cacheReadInputTokens: a.cacheReadInputTokens + b.cacheReadInputTokens,
    cacheCreationInputTokens: a.cacheCreationInputTokens + b.cacheCreationInputTokens,
    eventCount: a.eventCount + b.eventCount,
  };
}

function mergeMaps(a: Record<string, UsageBucket>, b: Record<string, UsageBucket>): Record<string, UsageBucket> {
  const merged: Record<string, UsageBucket> = { ...a };
  for (const [key, bucket] of Object.entries(b)) {
    merged[key] = merged[key] ? mergeBuckets(merged[key], bucket) : bucket;
  }
  return merged;
}

/** Combines two breakdowns, e.g. a persisted running total and one incremental poll's new events. */
export function mergeBreakdowns(a: UsageBreakdown, b: UsageBreakdown): UsageBreakdown {
  return {
    overall: mergeBuckets(a.overall, b.overall),
    byProfile: mergeMaps(a.byProfile, b.byProfile),
    byProject: mergeMaps(a.byProject, b.byProject),
  };
}
