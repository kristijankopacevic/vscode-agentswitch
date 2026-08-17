import { describe, it, expect } from 'vitest';
import { parseClaudeTranscriptLine, readClaudeStatsSummary } from '../../src/usage/ClaudeUsageReader';

describe('parseClaudeTranscriptLine', () => {
  it('extracts a usage event from an assistant message line', () => {
    const line = JSON.stringify({
      type: 'assistant',
      timestamp: '2026-08-17T12:00:00.000Z',
      message: {
        model: 'claude-opus-5',
        usage: { input_tokens: 100, output_tokens: 20, cache_creation_input_tokens: 5, cache_read_input_tokens: 3 },
      },
    });

    const event = parseClaudeTranscriptLine(line, 'my-project');

    expect(event).toEqual({
      ts: '2026-08-17T12:00:00.000Z',
      toolId: 'claude',
      model: 'claude-opus-5',
      inputTokens: 100,
      outputTokens: 20,
      cacheReadInputTokens: 3,
      cacheCreationInputTokens: 5,
      project: 'my-project',
    });
  });

  it('returns null for a non-assistant line', () => {
    const line = JSON.stringify({ type: 'user', timestamp: '2026-08-17T12:00:00.000Z' });

    expect(parseClaudeTranscriptLine(line, 'my-project')).toBeNull();
  });

  it('returns null for an assistant line with no usage (e.g. a tool_use-only chunk without usage yet)', () => {
    const line = JSON.stringify({ type: 'assistant', timestamp: '2026-08-17T12:00:00.000Z', message: { model: 'claude-opus-5' } });

    expect(parseClaudeTranscriptLine(line, 'my-project')).toBeNull();
  });

  it('returns null for unparseable JSON rather than throwing', () => {
    expect(parseClaudeTranscriptLine('not json', 'my-project')).toBeNull();
  });
});

describe('readClaudeStatsSummary', () => {
  it('sums cost and tokens across all models in stats-cache.json', () => {
    const statsCache = {
      modelUsage: {
        'claude-opus-5': { inputTokens: 100, outputTokens: 20, cacheReadInputTokens: 5, cacheCreationInputTokens: 2, costUSD: 1.5 },
        'claude-sonnet-5': { inputTokens: 50, outputTokens: 10, cacheReadInputTokens: 1, cacheCreationInputTokens: 0, costUSD: 0.25 },
      },
    };

    const summary = readClaudeStatsSummary(statsCache);

    expect(summary.totalCostUSD).toBeCloseTo(1.75);
    expect(summary.totalInputTokens).toBe(150);
    expect(summary.totalOutputTokens).toBe(30);
    expect(summary.byModel['claude-opus-5'].costUSD).toBe(1.5);
  });

  it('returns zeroed totals for an empty or missing modelUsage', () => {
    expect(readClaudeStatsSummary({})).toEqual({
      totalCostUSD: 0,
      totalInputTokens: 0,
      totalOutputTokens: 0,
      byModel: {},
    });
  });
});
