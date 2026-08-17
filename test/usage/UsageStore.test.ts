import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { UsageStore } from '../../src/usage/UsageStore';
import { FakeStateStore } from '../helpers/fakes';

function claudeLine(ts: string, inputTokens: number): string {
  return JSON.stringify({ type: 'assistant', timestamp: ts, message: { model: 'claude-opus-5', usage: { input_tokens: inputTokens, output_tokens: 1 } } });
}

function codexLine(ts: string, inputTokens: number, usedPercent?: number): string {
  return JSON.stringify({
    timestamp: ts,
    type: 'event_msg',
    payload: {
      type: 'token_count',
      info: { last_token_usage: { input_tokens: inputTokens, output_tokens: 1, cached_input_tokens: 0 } },
      rate_limits: usedPercent === undefined ? null : { primary: { used_percent: usedPercent, window_minutes: 10080, resets_at: 1787055227 } },
    },
  });
}

describe('UsageStore', () => {
  let dir: string;
  let claudeFile: string;
  let codexFile: string;
  let state: FakeStateStore;
  let store: UsageStore;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agentswitch-test-'));
    claudeFile = path.join(dir, 'claude.jsonl');
    codexFile = path.join(dir, 'codex.jsonl');
    state = new FakeStateStore();
    store = new UsageStore(state, () => undefined);
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('refresh() parses new lines from the given files into a breakdown', async () => {
    fs.writeFileSync(claudeFile, claudeLine('2026-08-17T10:00:00.000Z', 100) + '\n');
    fs.writeFileSync(codexFile, codexLine('2026-08-17T10:00:00.000Z', 50) + '\n');

    const breakdown = await store.refresh(
      [{ path: claudeFile, project: 'proj-a' }],
      [codexFile],
    );

    expect(breakdown.overall.inputTokens).toBe(150);
  });

  it('refresh() is additive across calls: totals accumulate rather than reset', async () => {
    fs.writeFileSync(claudeFile, claudeLine('2026-08-17T10:00:00.000Z', 100) + '\n');
    await store.refresh([{ path: claudeFile, project: 'proj-a' }], []);
    fs.appendFileSync(claudeFile, claudeLine('2026-08-17T10:05:00.000Z', 40) + '\n');

    const breakdown = await store.refresh([{ path: claudeFile, project: 'proj-a' }], []);

    expect(breakdown.overall.inputTokens).toBe(140);
  });

  it('refresh() updates the persisted Codex rate limit when one appears', async () => {
    fs.writeFileSync(codexFile, codexLine('2026-08-17T10:00:00.000Z', 50, 42) + '\n');

    await store.refresh([], [codexFile]);

    expect(store.getCodexRateLimit()).toEqual({ usedPercent: 42, windowMinutes: 10080, resetsAt: 1787055227 });
  });

  it('getClaudeRollingEstimate() only counts events inside the given window', async () => {
    fs.writeFileSync(
      claudeFile,
      [claudeLine('2026-08-10T00:00:00.000Z', 1000), claudeLine('2026-08-17T09:00:00.000Z', 100)].join('\n') + '\n',
    );
    await store.refresh([{ path: claudeFile, project: 'proj-a' }], []);

    const estimate = store.getClaudeRollingEstimate(6 * 60 * 60 * 1000, '2026-08-17T10:00:00.000Z');

    expect(estimate.inputTokens).toBe(100); // only the Aug 17 event is within 6h of "now"
  });
});
