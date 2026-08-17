import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { UsageIndex } from '../../src/usage/UsageIndex';
import { FakeStateStore } from '../helpers/fakes';

describe('UsageIndex', () => {
  let dir: string;
  let file: string;
  let state: FakeStateStore;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agentswitch-test-'));
    file = path.join(dir, 'log.jsonl');
    state = new FakeStateStore();
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('returns every line on the first poll of a fresh file', async () => {
    fs.writeFileSync(file, 'one\ntwo\n');
    const index = new UsageIndex(state, 'claude');

    const lines = await index.pollNewLines(file);

    expect(lines).toEqual(['one', 'two']);
  });

  it('returns only newly-appended lines on a second poll', async () => {
    fs.writeFileSync(file, 'one\n');
    const index = new UsageIndex(state, 'claude');
    await index.pollNewLines(file);
    fs.appendFileSync(file, 'two\n');

    const lines = await index.pollNewLines(file);

    expect(lines).toEqual(['two']);
  });

  it('returns an empty array for a file that does not exist, without throwing', async () => {
    const index = new UsageIndex(state, 'claude');

    const lines = await index.pollNewLines(path.join(dir, 'missing.jsonl'));

    expect(lines).toEqual([]);
  });

  it('persists its watermark in the given StateStore, so a fresh instance resumes rather than re-reading', async () => {
    fs.writeFileSync(file, 'one\ntwo\n');
    const first = new UsageIndex(state, 'claude');
    await first.pollNewLines(file);
    fs.appendFileSync(file, 'three\n');

    const second = new UsageIndex(state, 'claude'); // simulates a fresh extension activation
    const lines = await second.pollNewLines(file);

    expect(lines).toEqual(['three']);
  });

  it('keeps watermarks for different tools independent even over the same file path', async () => {
    fs.writeFileSync(file, 'one\n');
    const claudeIndex = new UsageIndex(state, 'claude');
    const codexIndex = new UsageIndex(state, 'codex');
    await claudeIndex.pollNewLines(file);

    const codexLines = await codexIndex.pollNewLines(file);

    expect(codexLines).toEqual(['one']);
  });
});
