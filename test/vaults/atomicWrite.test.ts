import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { atomicWrite } from '../../src/vaults/atomicWrite';

describe('atomicWrite', () => {
  let dir: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agentswitch-test-'));
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('creates the target file with the exact content given', () => {
    const target = path.join(dir, 'auth.json');

    atomicWrite(target, '{"hello":"world"}');

    expect(fs.readFileSync(target, 'utf8')).toBe('{"hello":"world"}');
  });

  it('leaves the original file untouched if the rename step fails', () => {
    const target = path.join(dir, 'auth.json');
    fs.writeFileSync(target, 'ORIGINAL', 'utf8');
    vi.spyOn(fs, 'renameSync').mockImplementation(() => {
      throw new Error('simulated crash between temp-write and rename');
    });

    expect(() => atomicWrite(target, 'NEW')).toThrow();
    expect(fs.readFileSync(target, 'utf8')).toBe('ORIGINAL');

    vi.restoreAllMocks();
  });

  it('leaves no temp file behind in the directory after a successful write', () => {
    const target = path.join(dir, 'auth.json');

    atomicWrite(target, 'content');

    expect(fs.readdirSync(dir)).toEqual(['auth.json']);
  });
});
