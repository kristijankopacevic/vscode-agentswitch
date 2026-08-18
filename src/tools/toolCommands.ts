import type { ToolId } from '../profiles/ProfileStore';

export type AuthVerb = 'login' | 'logout' | 'status';

/**
 * Builds the exact shell command line for a login/logout/status action,
 * to be run in a visible integrated terminal — the device-code and
 * browser handoff need to be interactive, so this never runs headlessly.
 * Codex has no path on PATH (see src/tools/codexBinary.ts) and no
 * separate "status" verb — `login status` is its equivalent. `platform`
 * defaults to the real OS but is a parameter so both platforms' quoting
 * can be tested from any host.
 */
export function buildAuthCommand(
  toolId: ToolId,
  verb: AuthVerb,
  codexBinaryPath: string | null,
  platform: NodeJS.Platform = process.platform,
): string {
  if (toolId === 'claude') {
    if (verb === 'status') return 'claude auth status --json';
    return `claude auth ${verb}`;
  }

  // codex
  if (!codexBinaryPath) {
    throw new Error('No Codex binary path was resolved — cannot build a Codex auth command.');
  }
  // On PowerShell (win32 — see authLauncher.ts, which pins the terminal to
  // it), a quoted path used as a command needs the "&" call operator or
  // the parser throws ("Unexpected token 'login'"). bash/zsh/sh (every
  // other platform's default shell) run a quoted path directly with no
  // such operator — and would error on one, since "&" backgrounds a job.
  const quoted = platform === 'win32' ? `& "${codexBinaryPath}"` : `"${codexBinaryPath}"`;
  if (verb === 'status') return `${quoted} login status`;
  return `${quoted} ${verb}`;
}
