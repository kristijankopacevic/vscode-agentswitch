import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { readNewLines } from '../../src/usage/readNewLines';

describe('readNewLines', () => {
  let dir: string;
  let file: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agentswitch-test-'));
    file = path.join(dir, 'log.jsonl');
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('returns every complete line when starting from offset 0', () => {
    fs.writeFileSync(file, 'one\ntwo\nthree\n');

    const { lines } = readNewLines(file, 0);

    expect(lines).toEqual(['one', 'two', 'three']);
  });

  it('returns only lines appended after the given offset', () => {
    fs.writeFileSync(file, 'one\ntwo\n');
    const first = readNewLines(file, 0);
    fs.appendFileSync(file, 'three\nfour\n');

    const second = readNewLines(file, first.newSize);

    expect(second.lines).toEqual(['three', 'four']);
  });

  it('does not return a trailing incomplete line, and leaves the offset before it so it is re-read once complete', () => {
    fs.writeFileSync(file, 'one\ntwo\npartial-no-newline-yet');

    const { lines, newSize } = readNewLines(file, 0);

    expect(lines).toEqual(['one', 'two']);
    fs.appendFileSync(file, '-now-complete\n');
    const second = readNewLines(file, newSize);
    expect(second.lines).toEqual(['partial-no-newline-yet-now-complete']);
  });

  it('rereads from the start if the file is smaller than the given offset (rotation/truncation)', () => {
    fs.writeFileSync(file, 'one\ntwo\nthree\n');
    const first = readNewLines(file, 0);
    fs.writeFileSync(file, 'rotated\n'); // shorter than before

    const second = readNewLines(file, first.newSize);

    expect(second.lines).toEqual(['rotated']);
  });

  it('returns no lines and an unchanged offset when nothing new has been written', () => {
    fs.writeFileSync(file, 'one\n');
    const first = readNewLines(file, 0);

    const second = readNewLines(file, first.newSize);

    expect(second.lines).toEqual([]);
    expect(second.newSize).toBe(first.newSize);
  });
});
