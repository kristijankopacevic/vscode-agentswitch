import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { readJsonSafe } from '../../src/vaults/readJsonSafe';

describe('readJsonSafe', () => {
  let dir: string;
  let file: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agentswitch-test-'));
    file = path.join(dir, 'creds.json');
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('returns the parsed object for a valid JSON file', () => {
    fs.writeFileSync(file, JSON.stringify({ a: 1 }));

    expect(readJsonSafe(file)).toEqual({ a: 1 });
  });

  it('returns null when the file does not exist, instead of throwing', () => {
    expect(readJsonSafe(path.join(dir, 'missing.json'))).toBeNull();
  });

  it('returns null for an empty file, instead of throwing', () => {
    fs.writeFileSync(file, '');

    expect(readJsonSafe(file)).toBeNull();
  });

  it('returns null for a file containing only whitespace', () => {
    fs.writeFileSync(file, '   \n\t  ');

    expect(readJsonSafe(file)).toBeNull();
  });

  it('returns null for invalid JSON, instead of throwing', () => {
    fs.writeFileSync(file, '{ not valid json');

    expect(readJsonSafe(file)).toBeNull();
  });

  it('returns null for valid JSON that is not an object (e.g. an array or a bare number)', () => {
    fs.writeFileSync(file, '[1,2,3]');
    expect(readJsonSafe(file)).toBeNull();

    fs.writeFileSync(file, '42');
    expect(readJsonSafe(file)).toBeNull();
  });
});
