import { describeWindow } from '../usage/windowLabel';
import type { CodexRateLimit, CodexRateLimits } from '../usage/CodexUsageReader';

/** A compact token count for space-constrained UI: "842", "12k", "2.3M". */
export function abbreviateTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}k`;
  return String(n);
}

function windowText(w: CodexRateLimit, tokens: number): string {
  const label = describeWindow(w.windowMinutes);
  return `${label} ~${abbreviateTokens(tokens)} tok · ${100 - w.usedPercent}% left`;
}

/**
 * Codex reports an exact remaining percentage per window — no estimate
 * involved there — paired with tokens actually consumed in that same
 * window, which Codex does not report itself (matched to fiveHourTokens/
 * sevenDayTokens by the window's own duration label, not by primary/
 * secondary slot — see CodexUsageReader.ts's note on why that's unsafe).
 */
export function formatCodexWindows(limits: CodexRateLimits, fiveHourTokens: number, sevenDayTokens: number): string {
  return [limits.primary, limits.secondary]
    .filter((w): w is CodexRateLimit => w !== null)
    .map((w) => windowText(w, describeWindow(w.windowMinutes) === '7d' ? sevenDayTokens : fiveHourTokens))
    .join(' · ');
}

/**
 * Claude has no exact rate-limit feed locally (see docs/design.md), so this
 * shows tokens consumed, never a percentage — there is no known cap to be
 * a percentage OF.
 */
export function formatClaudeWindows(fiveHourTokens: number, sevenDayTokens: number): string {
  const parts: string[] = [];
  if (fiveHourTokens > 0) parts.push(`5h ~${abbreviateTokens(fiveHourTokens)} tok`);
  if (sevenDayTokens > 0) parts.push(`7d ~${abbreviateTokens(sevenDayTokens)} tok`);
  return parts.join(' · ');
}
