import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { CodexVault } from '../../src/vaults/CodexVault';

const FIXTURE = path.join(__dirname, '..', 'fixtures', 'codex-auth-sample.json');

describe('CodexVault', () => {
  let dir: string;
  let authPath: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agentswitch-test-'));
    authPath = path.join(dir, 'auth.json');
    fs.copyFileSync(FIXTURE, authPath);
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('captureLive() returns the parsed contents of the live auth file', () => {
    const vault = new CodexVault(authPath);

    const snapshot = vault.captureLive();

    expect(snapshot).toEqual(JSON.parse(fs.readFileSync(authPath, 'utf8')));
  });

  it('applyLive() then captureLive() round-trips to an equal snapshot', () => {
    const vault = new CodexVault(authPath);
    const original = vault.captureLive();
    const other = { ...original, tokens: { ...(original.tokens as object), account_id: 'account-two' } };

    vault.applyLive(other);
    const result = vault.captureLive();

    expect(result).toEqual(other);
  });

  it('applyLive() leaves the live file untouched if the underlying write fails', () => {
    const vault = new CodexVault(authPath);
    const before = fs.readFileSync(authPath, 'utf8');
    vi.spyOn(fs, 'renameSync').mockImplementation(() => {
      throw new Error('simulated crash');
    });

    expect(() => vault.applyLive({ replaced: true })).toThrow();
    expect(fs.readFileSync(authPath, 'utf8')).toBe(before);

    vi.restoreAllMocks();
  });
});
