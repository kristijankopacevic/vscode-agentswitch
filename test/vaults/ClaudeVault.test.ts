import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { ClaudeVault } from '../../src/vaults/ClaudeVault';

const FIXTURE = path.join(__dirname, '..', 'fixtures', 'claude-credentials-sample.json');

// A second account's snapshot, as if captured earlier from a different live
// file. Its own mcpOAuth must never reach the live file — MCP server logins
// are shared across accounts, not swapped with them.
const PROFILE_B_SNAPSHOT = {
  mcpOAuth: {
    'some-other-server|deadbeef': { serverName: 'some-other-server' },
  },
  claudeAiOauth: {
    accessToken: 'synthetic-access-token-B',
    refreshToken: 'synthetic-refresh-token-B',
    expiresAt: 9000,
    refreshTokenExpiresAt: 9999,
    scopes: ['scope-b'],
    subscriptionType: 'pro',
    rateLimitTier: 'default_claude_pro',
  },
  organizationUuid: '00000000-0000-0000-0000-00000000000b',
};

describe('ClaudeVault', () => {
  let dir: string;
  let credentialsPath: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agentswitch-test-'));
    credentialsPath = path.join(dir, '.credentials.json');
    fs.copyFileSync(FIXTURE, credentialsPath);
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('captureLive() returns the parsed contents of the live credentials file', () => {
    const vault = new ClaudeVault(credentialsPath);

    const snapshot = vault.captureLive();

    expect(snapshot).toEqual(JSON.parse(fs.readFileSync(credentialsPath, 'utf8')));
  });

  it('applyLive() replaces claudeAiOauth and organizationUuid with the given snapshot\'s values', () => {
    const vault = new ClaudeVault(credentialsPath);

    vault.applyLive(PROFILE_B_SNAPSHOT);
    const result = vault.captureLive();

    expect(result.claudeAiOauth).toEqual(PROFILE_B_SNAPSHOT.claudeAiOauth);
    expect(result.organizationUuid).toEqual(PROFILE_B_SNAPSHOT.organizationUuid);
  });

  it("applyLive() never writes the incoming snapshot's mcpOAuth — the live file's own mcpOAuth survives untouched", () => {
    const vault = new ClaudeVault(credentialsPath);
    const liveMcpOAuthBefore = vault.captureLive().mcpOAuth;

    vault.applyLive(PROFILE_B_SNAPSHOT);
    const result = vault.captureLive();

    expect(result.mcpOAuth).toEqual(liveMcpOAuthBefore);
    expect(result.mcpOAuth).not.toEqual(PROFILE_B_SNAPSHOT.mcpOAuth);
  });

  it('applyLive() preserves top-level keys it does not know about', () => {
    fs.writeFileSync(
      credentialsPath,
      JSON.stringify({ ...JSON.parse(fs.readFileSync(credentialsPath, 'utf8')), futureField: 'keep-me' }),
    );
    const vault = new ClaudeVault(credentialsPath);

    vault.applyLive(PROFILE_B_SNAPSHOT);
    const result = vault.captureLive();

    expect(result.futureField).toBe('keep-me');
  });

  it('captureLiveSafe() returns the same object as captureLive() when signed in', () => {
    const vault = new ClaudeVault(credentialsPath);

    expect(vault.captureLiveSafe()).toEqual(vault.captureLive());
  });

  it('captureLiveSafe() returns null instead of throwing when never signed in (file missing)', () => {
    const vault = new ClaudeVault(path.join(dir, 'does-not-exist.json'));

    expect(vault.captureLiveSafe()).toBeNull();
  });

  it('applyLive() leaves the live file untouched if the underlying write fails', () => {
    const vault = new ClaudeVault(credentialsPath);
    const before = fs.readFileSync(credentialsPath, 'utf8');
    vi.spyOn(fs, 'renameSync').mockImplementation(() => {
      throw new Error('simulated crash');
    });

    expect(() => vault.applyLive(PROFILE_B_SNAPSHOT)).toThrow();
    expect(fs.readFileSync(credentialsPath, 'utf8')).toBe(before);

    vi.restoreAllMocks();
  });
});
