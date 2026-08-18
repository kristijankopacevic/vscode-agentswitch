import * as vscode from 'vscode';
import * as path from 'node:path';
import type { ToolId } from '../profiles/ProfileStore';
import { resolveCodexBinary } from '../tools/codexBinary';
import { buildAuthCommand, type AuthVerb } from '../tools/toolCommands';

const TOOL_LABEL: Record<ToolId, string> = { codex: 'Codex', claude: 'Claude Code' };

/**
 * The directory holding every installed extension — derived from this
 * extension's own location rather than hardcoding `~/.vscode/extensions`,
 * so it stays correct under VS Code Insiders, portable installs, and
 * non-default user-data directories.
 */
function extensionsDir(context: vscode.ExtensionContext): string {
  return path.dirname(context.extensionUri.fsPath);
}

/**
 * Launches a login/logout/status command in a visible integrated
 * terminal — never headlessly, since the device-code and browser handoff
 * is interactive and needs to be seen. Returns false (and shows its own
 * error) if the command couldn't be built, e.g. the Codex binary wasn't
 * found — see docs/design.md's "Windows-only assumption" limitation.
 */
export function launchAuthCommand(context: vscode.ExtensionContext, toolId: ToolId, verb: AuthVerb): boolean {
  let codexPath: string | null = null;
  if (toolId === 'codex') {
    const resolved = resolveCodexBinary(extensionsDir(context));
    if (!resolved) {
      void vscode.window.showErrorMessage(
        'AgentSwitch: could not find the Codex CLI. It ships bundled inside the "ChatGPT" (openai.chatgpt) VS Code extension — make sure that extension is installed.',
      );
      return false;
    }
    codexPath = resolved.path;
  }

  const command = buildAuthCommand(toolId, verb, codexPath);
  const terminal = vscode.window.createTerminal(`AgentSwitch: ${TOOL_LABEL[toolId]} ${verb}`);
  terminal.show();
  terminal.sendText(command);
  return true;
}
