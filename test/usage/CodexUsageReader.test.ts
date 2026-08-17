import { describe, it, expect } from 'vitest';
import { parseCodexRolloutLine } from '../../src/usage/CodexUsageReader';

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

  it('extracts the primary rate-limit window when present', () => {
    const line = JSON.stringify({
      timestamp: '2026-08-11T12:13:49.063Z',
      type: 'event_msg',
      payload: {
        type: 'token_count',
        info: null,
        rate_limits: { primary: { used_percent: 42, window_minutes: 10080, resets_at: 1787055227 } },
      },
    });

    const { rateLimit } = parseCodexRolloutLine(line);

    expect(rateLimit).toEqual({ usedPercent: 42, windowMinutes: 10080, resetsAt: 1787055227 });
  });

  it('returns null for a line that is not a token_count event', () => {
    const line = JSON.stringify({ timestamp: '2026-08-11T12:13:49.063Z', type: 'event_msg', payload: { type: 'task_started' } });

    expect(parseCodexRolloutLine(line)).toEqual({ event: null, rateLimit: null });
  });

  it('returns nulls for unparseable JSON rather than throwing', () => {
    expect(parseCodexRolloutLine('not json')).toEqual({ event: null, rateLimit: null });
  });
});
