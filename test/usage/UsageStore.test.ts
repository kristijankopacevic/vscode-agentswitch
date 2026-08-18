import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { UsageStore } from '../../src/usage/UsageStore';
import { FakeStateStore } from '../helpers/fakes';

function claudeLine(ts: string, inputTokens: number): string {
  return JSON.stringify({ type: 'assistant', timestamp: ts, message: { model: 'claude-opus-5', usage: { input_tokens: inputTokens, output_tokens: 1 } } });
}

function codexLine(
  ts: string,
  inputTokens: number,
  rateLimits?: { primary?: number; secondary?: number },
): string {
  return JSON.stringify({
    timestamp: ts,
    type: 'event_msg',
    payload: {
      type: 'token_count',
      info: { last_token_usage: { input_tokens: inputTokens, output_tokens: 1, cached_input_tokens: 0 } },
      rate_limits: rateLimits
        ? {
            primary:
              rateLimits.primary === undefined
                ? null
                : { used_percent: rateLimits.primary, window_minutes: 300, resets_at: 1787000000 },
            secondary:
              rateLimits.secondary === undefined
                ? null
                : { used_percent: rateLimits.secondary, window_minutes: 10080, resets_at: 1787055227 },
          }
        : null,
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

  it('refresh() captures both the primary and secondary Codex windows when both appear', async () => {
    fs.writeFileSync(codexFile, codexLine('2026-08-17T10:00:00.000Z', 50, { primary: 17, secondary: 42 }) + '\n');

    await store.refresh([], [codexFile]);

    expect(store.getCodexRateLimits()).toEqual({
      primary: { usedPercent: 17, windowMinutes: 300, resetsAt: 1787000000 },
      secondary: { usedPercent: 42, windowMinutes: 10080, resetsAt: 1787055227 },
    });
  });

  it('keeps the last known secondary window even when a later event omits it', async () => {
    fs.writeFileSync(codexFile, codexLine('2026-08-17T10:00:00.000Z', 50, { primary: 17, secondary: 42 }) + '\n');
    await store.refresh([], [codexFile]);
    fs.appendFileSync(codexFile, codexLine('2026-08-17T10:05:00.000Z', 20, { primary: 19 }) + '\n'); // secondary absent this time

    await store.refresh([], [codexFile]);

    expect(store.getCodexRateLimits()).toEqual({
      primary: { usedPercent: 19, windowMinutes: 300, resetsAt: 1787000000 },
      secondary: { usedPercent: 42, windowMinutes: 10080, resetsAt: 1787055227 }, // preserved from before
    });
  });

  it('getCodexRateLimits() returns nulls before any rate-limit data has appeared', () => {
    expect(store.getCodexRateLimits()).toEqual({ primary: null, secondary: null });
  });

  it('getCodexRateLimits() sanitizes a pre-v0.3 legacy value stored under the same key, instead of crashing', () => {
    // Through v0.2, this same globalState key held a bare CodexRateLimit
    // object (no primary/secondary wrapper) — reading it as {primary,
    // secondary} makes both fields `undefined`, which used to reach
    // formatCodexWindows() and throw on `undefined.windowMinutes`.
    state.update('agentswitch.codexRateLimit', { usedPercent: 30, windowMinutes: 300, resetsAt: 123 });

    expect(store.getCodexRateLimits()).toEqual({ primary: null, secondary: null });
  });

  it('getCodexRateLimits() drops a malformed primary/secondary entry instead of crashing', () => {
    state.update('agentswitch.codexRateLimit', { primary: { usedPercent: 17 }, secondary: null });

    expect(store.getCodexRateLimits()).toEqual({ primary: null, secondary: null });
  });

  it('getCurrentBreakdown() returns the persisted breakdown without re-reading any files', async () => {
    fs.writeFileSync(claudeFile, claudeLine('2026-08-17T10:00:00.000Z', 100) + '\n');
    await store.refresh([{ path: claudeFile, project: 'proj-a' }], []);
    fs.rmSync(claudeFile); // prove a subsequent call can't be re-deriving this from the file

    expect(store.getCurrentBreakdown().overall.inputTokens).toBe(100);
  });

  it('getCurrentBreakdown() returns an empty breakdown before any refresh has run', () => {
    expect(store.getCurrentBreakdown().overall.inputTokens).toBe(0);
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

  it('getCodexRollingEstimate() only counts events inside the given window', async () => {
    fs.writeFileSync(
      codexFile,
      [codexLine('2026-08-10T00:00:00.000Z', 1000), codexLine('2026-08-17T09:00:00.000Z', 50)].join('\n') + '\n',
    );
    await store.refresh([], [codexFile]);

    const estimate = store.getCodexRollingEstimate(6 * 60 * 60 * 1000, '2026-08-17T10:00:00.000Z');

    expect(estimate.inputTokens).toBe(50); // only the Aug 17 event is within 6h of "now"
  });

  it('getCodexRollingEstimate() returns zero before any Codex usage has been recorded', () => {
    expect(store.getCodexRollingEstimate(6 * 60 * 60 * 1000, '2026-08-17T10:00:00.000Z').inputTokens).toBe(0);
  });
});
