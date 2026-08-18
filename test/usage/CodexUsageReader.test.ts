import { describe, it, expect } from 'vitest';
import { parseCodexRolloutLine, coerceRateLimit } from '../../src/usage/CodexUsageReader';

describe('parseCodexRolloutLine', () => {
  it('extracts a usage event from a token_count line using the per-turn delta, not the running total', () => {
    const line = JSON.stringify({
      timestamp: '2026-08-11T12:13:49.063Z',
      type: 'event_msg',
      payload: {
        type: 'token_count',
        info: {
          total_token_usage: { input_tokens: 21180, cached_input_tokens: 500, output_tokens: 283, reasoning_output_tokens: 132 },
          last_token_usage: { input_tokens: 900, cached_input_tokens: 50, output_tokens: 30, reasoning_output_tokens: 10 },
          model_context_window: 258400,
        },
        rate_limits: null,
      },
    });

    const { event } = parseCodexRolloutLine(line);

    expect(event).toEqual({
      ts: '2026-08-11T12:13:49.063Z',
      toolId: 'codex',
      model: 'unknown',
      inputTokens: 900,
      outputTokens: 40, // output + reasoning_output, both billable output
      cacheReadInputTokens: 50,
      cacheCreationInputTokens: 0,
    });
  });

  it('returns no event (but no throw) when info is null — the first token_count event in a session', () => {
    const line = JSON.stringify({
      timestamp: '2026-08-11T12:13:49.063Z',
      type: 'event_msg',
      payload: { type: 'token_count', info: null, rate_limits: null },
    });

    const { event } = parseCodexRolloutLine(line);

    expect(event).toBeNull();
  });

  it('extracts both the primary (short) and secondary (weekly) rate-limit windows when present', () => {
    const line = JSON.stringify({
      timestamp: '2026-08-11T12:13:49.063Z',
      type: 'event_msg',
      payload: {
        type: 'token_count',
        info: null,
        rate_limits: {
          primary: { used_percent: 17, window_minutes: 300, resets_at: 1787000000 },
          secondary: { used_percent: 42, window_minutes: 10080, resets_at: 1787055227 },
        },
      },
    });

    const { rateLimits } = parseCodexRolloutLine(line);

    expect(rateLimits).toEqual({
      primary: { usedPercent: 17, windowMinutes: 300, resetsAt: 1787000000 },
      secondary: { usedPercent: 42, windowMinutes: 10080, resetsAt: 1787055227 },
    });
  });

  it('returns a null secondary when only primary is present, without throwing', () => {
    const line = JSON.stringify({
      timestamp: '2026-08-11T12:13:49.063Z',
      type: 'event_msg',
      payload: {
        type: 'token_count',
        info: null,
        rate_limits: { primary: { used_percent: 42, window_minutes: 10080, resets_at: 1787055227 }, secondary: null },
      },
    });

    const { rateLimits } = parseCodexRolloutLine(line);

    expect(rateLimits).toEqual({
      primary: { usedPercent: 42, windowMinutes: 10080, resetsAt: 1787055227 },
      secondary: null,
    });
  });

  it('returns null rateLimits when rate_limits itself is null', () => {
    const line = JSON.stringify({
      timestamp: '2026-08-11T12:13:49.063Z',
      type: 'event_msg',
      payload: { type: 'token_count', info: null, rate_limits: null },
    });

    expect(parseCodexRolloutLine(line).rateLimits).toBeNull();
  });

  it('returns null for a line that is not a token_count event', () => {
    const line = JSON.stringify({ timestamp: '2026-08-11T12:13:49.063Z', type: 'event_msg', payload: { type: 'task_started' } });

    expect(parseCodexRolloutLine(line)).toEqual({ event: null, rateLimits: null });
  });

  it('returns nulls for unparseable JSON rather than throwing', () => {
    expect(parseCodexRolloutLine('not json')).toEqual({ event: null, rateLimits: null });
  });
});

describe('coerceRateLimit', () => {
  it('passes through a well-formed rate limit unchanged', () => {
    const limit = { usedPercent: 17, windowMinutes: 300, resetsAt: 1787000000 };

    expect(coerceRateLimit(limit)).toEqual(limit);
  });

  it('returns null for undefined (the field was never set)', () => {
    expect(coerceRateLimit(undefined)).toBeNull();
  });

  it('returns null for null', () => {
    expect(coerceRateLimit(null)).toBeNull();
  });

  it('returns null for a value missing windowMinutes — e.g. the pre-v0.3 single-window shape stored under the same globalState key, which had no primary/secondary wrapper at all', () => {
    expect(coerceRateLimit({ usedPercent: 30, resetsAt: 123 })).toBeNull();
  });

  it('returns null when usedPercent is not a number', () => {
    expect(coerceRateLimit({ usedPercent: '30', windowMinutes: 300, resetsAt: 123 })).toBeNull();
  });
});
