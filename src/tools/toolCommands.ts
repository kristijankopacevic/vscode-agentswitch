import type { ToolId } from '../profiles/ProfileStore';

export type AuthVerb = 'login' | 'logout' | 'status';

/**
 * Builds the exact shell command line for a login/logout/status action,
 * to be run in a visible integrated terminal — the device-code and
 * browser handoff need to be interactive, so this never runs headlessly.
 * Codex has no path on PATH (see src/tools/codexBinary.ts) and no
 * separate "status" verb — `login status` is its equivalent.
 */
export function buildAuthCommand(toolId: ToolId, verb: AuthVerb, codexBinaryPath: string | null): string {
  if (toolId === 'claude') {
    if (verb === 'status') return 'claude auth status --json';
    return `claude auth ${verb}`;
  }

  // codex
  if (!codexBinaryPath) {
    throw new Error('No Codex binary path was resolved — cannot build a Codex auth command.');
  }
  // The leading "&" is PowerShell's call operator — without it, a quoted
  // path used as a command is a parser error ("Unexpected token 'login'"),
  // not a missing-binary problem. The terminal that runs this is always
  // pinned to powershell.exe (see authLauncher.ts) so this is safe.
  const quoted = `& "${codexBinaryPath}"`;
  if (verb === 'status') return `${quoted} login status`;
  return `${quoted} ${verb}`;
}
