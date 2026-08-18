import * as vscode from 'vscode';
import type { AppContext } from '../appContext';
import type { ToolId } from '../profiles/ProfileStore';
import { launchAuthCommand } from './authLauncher';
import { saveCurrentAccount } from './switchQuickPick';

const TOOL_LABEL: Record<ToolId, string> = { codex: 'Codex', claude: 'Claude Code' };

async function pickTool(): Promise<ToolId | undefined> {
  const picked = await vscode.window.showQuickPick(
    (['codex', 'claude'] as ToolId[]).map((toolId) => ({ label: TOOL_LABEL[toolId], toolId })),
    { placeHolder: 'Which tool?' },
  );
  return picked?.toolId;
}

/**
 * Launches login in a terminal, then offers to save the result. Login
 * success can't be detected synchronously — the terminal flow is
 * interactive and async — so this offers rather than auto-detects; see
 * the "Login success" limitation in docs/design.md.
 */
export async function showLoginFlow(context: vscode.ExtensionContext, app: AppContext, onChanged: () => void): Promise<void> {
  const toolId = await pickTool();
  if (!toolId) return;
  if (!launchAuthCommand(context, toolId, 'login')) return;

  const choice = await vscode.window.showInformationMessage(
    `Signing in to ${TOOL_LABEL[toolId]} in the terminal. Once that finishes, save it as an AgentSwitch account?`,
    'Save account',
    'Not now',
  );
  if (choice === 'Save account') await saveCurrentAccount(app, toolId, onChanged);
}

/**
 * Warns before logging out of an account AgentSwitch isn't tracking —
 * that's exactly how credentials get lost, since logout replaces the live
 * file with nothing and there'd be no saved snapshot to switch back to.
 */
export async function showLogoutFlow(context: vscode.ExtensionContext, app: AppContext, onChanged: () => void): Promise<void> {
  const toolId = await pickTool();
  if (!toolId) return;

  const live = app.vaults[toolId].captureLiveSafe();
  const isTracked = app.orchestrator.activeProfileId(toolId) !== undefined;
  if (live && !isTracked) {
    const choice = await vscode.window.showWarningMessage(
      `You're signed into ${TOOL_LABEL[toolId]}, but AgentSwitch isn't tracking this account. Logging out now means you'll lose access to it unless you save it first.`,
      'Save it first',
      'Log out anyway',
      'Cancel',
    );
    if (choice === undefined || choice === 'Cancel') return;
    if (choice === 'Save it first') await saveCurrentAccount(app, toolId, onChanged);
  }

  launchAuthCommand(context, toolId, 'logout');
}

/**
 * The guided multi-account journey: save the current account if it isn't
 * saved yet, log out, log back in as someone else, then save that too.
 * Each step is confirmed and abortable — without this, adding a second
 * account meant manually logging out first, which could silently destroy
 * the first account's credentials if they'd never been saved.
 */
export async function showAddAnotherAccountFlow(context: vscode.ExtensionContext, app: AppContext, onChanged: () => void): Promise<void> {
  const toolId = await pickTool();
  if (!toolId) return;

  const live = app.vaults[toolId].captureLiveSafe();
  const isTracked = app.orchestrator.activeProfileId(toolId) !== undefined;
  if (live && !isTracked) {
    const choice = await vscode.window.showInformationMessage(
      `Before switching accounts, save the currently signed-in ${TOOL_LABEL[toolId]} account?`,
      'Save it',
      'Skip',
    );
    if (choice === 'Save it') await saveCurrentAccount(app, toolId, onChanged);
  }

  const proceed = await vscode.window.showInformationMessage(
    `Next: log out of the current ${TOOL_LABEL[toolId]} account, then log in as someone else.`,
    'Continue',
    'Cancel',
  );
  if (proceed !== 'Continue') return;
  if (!launchAuthCommand(context, toolId, 'logout')) return;

  const loggedOut = await vscode.window.showInformationMessage(
    `Once logout finishes in the terminal, I'll start the new sign-in.`,
    'Continue to login',
    'Cancel',
  );
  if (loggedOut !== 'Continue to login') return;
  if (!launchAuthCommand(context, toolId, 'login')) return;

  const saveChoice = await vscode.window.showInformationMessage(
    `Once you've finished signing into the new ${TOOL_LABEL[toolId]} account, save it?`,
    'Save account',
    'Not now',
  );
  if (saveChoice === 'Save account') await saveCurrentAccount(app, toolId, onChanged);
}
