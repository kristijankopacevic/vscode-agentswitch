import type { UsageEvent } from './UsageEvent';

/**
 * Parses one line of a `~/.claude/projects/<project>/*.jsonl` transcript
 * into a usage event, or null if the line carries no usage (most lines
 * don't — only assistant turns with a completed `usage` block do). Never
 * throws: malformed JSON or an unexpected shape both return null, since a
 * single bad line must not abort indexing the rest of the file.
 */
export function parseClaudeTranscriptLine(line: string, project: string): UsageEvent | null {
  let obj: unknown;
  try {
    obj = JSON.parse(line);
  } catch {
    return null;
  }
  if (!obj || typeof obj !== 'object') return null;
  const o = obj as Record<string, unknown>;
  if (o.type !== 'assistant') return null;

  const message = o.message as Record<string, unknown> | undefined;
  const usage = message?.usage as Record<string, unknown> | undefined;
  if (!usage || typeof usage.input_tokens !== 'number' || typeof usage.output_tokens !== 'number') return null;

  return {
    ts: String(o.timestamp ?? ''),
    toolId: 'claude',
    model: String(message?.model ?? 'unknown'),
    inputTokens: usage.input_tokens,
    outputTokens: usage.output_tokens,
    cacheReadInputTokens: typeof usage.cache_read_input_tokens === 'number' ? usage.cache_read_input_tokens : 0,
    cacheCreationInputTokens:
      typeof usage.cache_creation_input_tokens === 'number' ? usage.cache_creation_input_tokens : 0,
    project,
  };
}

export interface ClaudeModelSummary {
  inputTokens: number;
  outputTokens: number;
  cacheReadInputTokens: number;
  cacheCreationInputTokens: number;
  costUSD: number;
}

export interface ClaudeStatsSummary {
  totalCostUSD: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  byModel: Record<string, ClaudeModelSummary>;
}

/**
 * Reads Claude Code's own pre-computed `~/.claude/stats-cache.json`. We use
 * its `costUSD` rather than maintaining an Anthropic pricing table, since
 * Claude Code already computes it and keeps it current across model
 * pricing changes.
 */
export function readClaudeStatsSummary(statsCache: unknown): ClaudeStatsSummary {
  const byModel = ((statsCache as { modelUsage?: Record<string, ClaudeModelSummary> })?.modelUsage ?? {}) as Record<
    string,
    ClaudeModelSummary
  >;
  let totalCostUSD = 0;
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  for (const model of Object.values(byModel)) {
    totalCostUSD += model.costUSD ?? 0;
    totalInputTokens += model.inputTokens ?? 0;
    totalOutputTokens += model.outputTokens ?? 0;
  }
  return { totalCostUSD, totalInputTokens, totalOutputTokens, byModel };
}
