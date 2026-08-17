import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { BackupStore } from '../../src/vaults/BackupStore';

describe('BackupStore', () => {
  let dir: string;
  let clock: number;
  const tick = () => new Date(clock++).toISOString();

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agentswitch-test-'));
    clock = 1000;
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('write() persists the content, retrievable via list()', () => {
    const store = new BackupStore(dir, 20, tick);

    store.write('codex', '{"a":1}');
    const [backup] = store.list('codex');

    expect(fs.readFileSync(backup, 'utf8')).toBe('{"a":1}');
  });

  it('list() returns backups newest first', () => {
    const store = new BackupStore(dir, 20, tick);

    store.write('codex', 'first');
    store.write('codex', 'second');

    const [newest, oldest] = store.list('codex');
    expect(fs.readFileSync(newest, 'utf8')).toBe('second');
    expect(fs.readFileSync(oldest, 'utf8')).toBe('first');
  });

  it('list() only returns backups for the given tool', () => {
    const store = new BackupStore(dir, 20, tick);

    store.write('codex', 'codex-backup');
    store.write('claude', 'claude-backup');

    expect(store.list('codex')).toHaveLength(1);
    expect(store.list('claude')).toHaveLength(1);
  });

  it('prunes to the configured maximum, dropping the oldest first', () => {
    const store = new BackupStore(dir, 2, tick);

    store.write('codex', 'one');
    store.write('codex', 'two');
    store.write('codex', 'three');

    const remaining = store.list('codex').map((p) => fs.readFileSync(p, 'utf8'));
    expect(remaining).toEqual(['three', 'two']);
  });
});
