import { describe, it, expect } from 'vitest';
import { aggregateUsageEvents, mergeBreakdowns, emptyBreakdown } from '../../src/usage/aggregate';
import type { UsageEvent } from '../../src/usage/UsageEvent';

function event(overrides: Partial<UsageEvent> = {}): UsageEvent {
  return {
    ts: '2026-08-17T12:00:00.000Z',
    toolId: 'claude',
    model: 'claude-opus-5',
    inputTokens: 100,
    outputTokens: 20,
    cacheReadInputTokens: 5,
    cacheCreationInputTokens: 2,
    project: 'my-project',
    ...overrides,
  };
}

describe('aggregateUsageEvents', () => {
  it('sums a single event into overall, byProfile, and byProject', () => {
    const breakdown = aggregateUsageEvents([event()], () => 'profile-a');

    expect(breakdown.overall).toMatchObject({ inputTokens: 100, outputTokens: 20, eventCount: 1 });
    expect(breakdown.byProfile['profile-a']).toMatchObject({ inputTokens: 100, eventCount: 1 });
    expect(breakdown.byProject['my-project']).toMatchObject({ inputTokens: 100, eventCount: 1 });
  });

  it('buckets events with no resolvable active profile under "unattributed"', () => {
    const breakdown = aggregateUsageEvents([event()], () => undefined);

    expect(breakdown.byProfile['unattributed']).toMatchObject({ inputTokens: 100, eventCount: 1 });
  });

  it('buckets events with no project under "unknown"', () => {
    const breakdown = aggregateUsageEvents([event({ project: undefined })], () => 'profile-a');

    expect(breakdown.byProject['unknown']).toMatchObject({ inputTokens: 100, eventCount: 1 });
  });

  it('accumulates multiple events into the same bucket', () => {
    const breakdown = aggregateUsageEvents([event({ inputTokens: 100 }), event({ inputTokens: 50 })], () => 'profile-a');

    expect(breakdown.byProfile['profile-a'].inputTokens).toBe(150);
    expect(breakdown.byProfile['profile-a'].eventCount).toBe(2);
  });
});

describe('mergeBreakdowns', () => {
  it('is additive: merging two incremental batches equals aggregating them together', () => {
    const events = [event({ inputTokens: 100 }), event({ inputTokens: 50, project: 'other-project' })];

    const merged = mergeBreakdowns(
      aggregateUsageEvents([events[0]], () => 'profile-a'),
      aggregateUsageEvents([events[1]], () => 'profile-a'),
    );
    const oneShot = aggregateUsageEvents(events, () => 'profile-a');

    expect(merged).toEqual(oneShot);
  });

  it('merging with an empty breakdown is a no-op', () => {
    const breakdown = aggregateUsageEvents([event()], () => 'profile-a');

    expect(mergeBreakdowns(breakdown, emptyBreakdown())).toEqual(breakdown);
  });
});
