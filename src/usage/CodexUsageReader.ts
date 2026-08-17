import type { UsageEvent } from './UsageEvent';

export interface CodexRateLimit {
  usedPercent: number;
  windowMinutes: number;
  resetsAt: number;
}

export interface ParsedRolloutLine {
  event: UsageEvent | null;
  rateLimit: CodexRateLimit | null;
}

const NO_MATCH: ParsedRolloutLine = { event: null, rateLimit: null };

/**
 * Parses one line of a `~/.codex/sessions/.../rollout-*.jsonl` file. Only
 * `token_count` event_msg lines carry usage or rate-limit data; every other
 * line yields nulls. Uses `last_token_usage` (the delta for that turn), not
 * `total_token_usage` (the session's running total) — summing the delta
 * across every event in a session equals the session total, which is the
 * same event shape Claude's per-message usage uses.
 */
export function parseCodexRolloutLine(line: string): ParsedRolloutLine {
  let obj: unknown;
  try {
    obj = JSON.parse(line);
  } catch {
    return NO_MATCH;
  }
  if (!obj || typeof obj !== 'object') return NO_MATCH;
  const o = obj as Record<string, unknown>;
  const payload = o.payload as Record<string, unknown> | undefined;
  if (payload?.type !== 'token_count') return NO_MATCH;

  const info = payload.info as Record<string, unknown> | null | undefined;
  const last = info?.last_token_usage as Record<string, unknown> | undefined;
  const event: UsageEvent | null =
    last && typeof last.input_tokens === 'number'
      ? {
          ts: String(o.timestamp ?? ''),
          toolId: 'codex',
          model: 'unknown', // rollout lines don't carry the model on token_count events
          inputTokens: last.input_tokens,
          outputTokens:
            (typeof last.output_tokens === 'number' ? last.output_tokens : 0) +
            (typeof last.reasoning_output_tokens === 'number' ? last.reasoning_output_tokens : 0),
          cacheReadInputTokens: typeof last.cached_input_tokens === 'number' ? last.cached_input_tokens : 0,
          cacheCreationInputTokens: 0, // Codex has no cache-write concept distinct from cache-read
        }
      : null;

  const primary = (payload.rate_limits as Record<string, unknown> | null | undefined)?.primary as
    | Record<string, unknown>
    | undefined;
  const rateLimit: CodexRateLimit | null =
    primary && typeof primary.used_percent === 'number'
      ? {
          usedPercent: primary.used_percent,
          windowMinutes: Number(primary.window_minutes ?? 0),
          resetsAt: Number(primary.resets_at ?? 0),
        }
      : null;

  return { event, rateLimit };
}
