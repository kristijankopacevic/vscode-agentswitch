import type { UsageEvent } from './UsageEvent';

export interface CodexRateLimit {
  usedPercent: number;
  windowMinutes: number;
  resetsAt: number;
}

/**
 * Codex reports up to two windows. Which duration lands in `primary` vs.
 * `secondary` isn't assumed here — describeWindow() classifies each by its
 * own windowMinutes rather than by position, since a plan with only one
 * window populates it under `primary` regardless of its length.
 */
export interface CodexRateLimits {
  primary: CodexRateLimit | null;
  secondary: CodexRateLimit | null;
}

export interface ParsedRolloutLine {
  event: UsageEvent | null;
  rateLimits: CodexRateLimits | null;
}

const NO_MATCH: ParsedRolloutLine = { event: null, rateLimits: null };

function parseWindow(raw: unknown): CodexRateLimit | null {
  const w = raw as Record<string, unknown> | null | undefined;
  if (!w || typeof w.used_percent !== 'number') return null;
  return {
    usedPercent: w.used_percent,
    windowMinutes: Number(w.window_minutes ?? 0),
    resetsAt: Number(w.resets_at ?? 0),
  };
}

/**
 * Validates an already-camelCased value (e.g. read back out of
 * globalState) as a well-formed CodexRateLimit, returning null for
 * anything else. Needed because through v0.2 the same globalState key
 * held a bare CodexRateLimit with no primary/secondary wrapper at all —
 * reading that shape as `{primary, secondary}.primary` gives `undefined`,
 * not `null`, which used to reach describeWindow() and throw.
 */
export function coerceRateLimit(raw: unknown): CodexRateLimit | null {
  const w = raw as Record<string, unknown> | null | undefined;
  if (!w || typeof w.usedPercent !== 'number' || typeof w.windowMinutes !== 'number' || typeof w.resetsAt !== 'number') {
    return null;
  }
  return { usedPercent: w.usedPercent, windowMinutes: w.windowMinutes, resetsAt: w.resetsAt };
}

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

  const rawLimits = payload.rate_limits as Record<string, unknown> | null | undefined;
  const rateLimits: CodexRateLimits | null = rawLimits
    ? { primary: parseWindow(rawLimits.primary), secondary: parseWindow(rawLimits.secondary) }
    : null;

  return { event, rateLimits };
}
