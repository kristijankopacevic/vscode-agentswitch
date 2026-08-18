import * as vscode from 'vscode';
import type { ToolId } from '../profiles/ProfileStore';
import type { AppContext } from '../appContext';
import { buildAccountRows, type AccountRow } from './accountRows';
import { performSwitch } from './switchActions';
import { attachLiveToProfile, removeProfile } from './accountActions';

const TOOL_LABEL: Record<ToolId, string> = { codex: 'Codex', claude: 'Claude Code' };

type ProfileAction = { kind: 'switch'; row: AccountRow } | { kind: 'add' } | { kind: 'remove' };

function rowDescription(row: AccountRow): string | undefined {
  if (row.isActive) return '● Active';
  if (row.needsReauth) return '(needs sign-in)';
  return undefined;
}

function accountRowsForTool(app: AppContext, toolId: ToolId): AccountRow[] {
  return buildAccountRows(app.profiles.list(toolId), (t) => app.orchestrator.activeProfileId(t));
}

async function pickTool(): Promise<ToolId | undefined> {
  const picked = await vscode.window.showQuickPick(
    (['codex', 'claude'] as ToolId[]).map((toolId) => ({ label: TOOL_LABEL[toolId], toolId })),
    { placeHolder: 'Which tool?' },
  );
  return picked?.toolId;
}

export async function showSwitchAccountFlow(app: AppContext, onChanged: () => void): Promise<void> {
  const toolId = await pickTool();
  if (!toolId) return;

  const items: (vscode.QuickPickItem & { action: ProfileAction })[] = accountRowsForTool(app, toolId).map((row) => ({
    label: row.label,
    description: rowDescription(row),
    action: { kind: 'switch', row },
  }));
  items.push({ label: '$(add) Add current account…', action: { kind: 'add' } });
  items.push({ label: '$(trash) Remove an account…', action: { kind: 'remove' } });

  const picked = await vscode.window.showQuickPick(items, { placeHolder: `Switch ${TOOL_LABEL[toolId]} account` });
  if (!picked) return;

  if (picked.action.kind === 'add') {
    await saveCurrentAccount(app, toolId, onChanged);
  } else if (picked.action.kind === 'remove') {
    await removeAccountFlow(app, toolId, onChanged);
  } else {
    await switchTo(app, picked.action.row, onChanged);
  }
}

/** The unified view: every saved account for both tools in one list. */
export async function showAllAccountsFlow(app: AppContext, onChanged: () => void): Promise<void> {
  const rows = buildAccountRows(app.profiles.list(), (t) => app.orchestrator.activeProfileId(t));

  if (rows.length === 0) {
    void vscode.window.showInformationMessage(
      'No AgentSwitch accounts saved yet. Use "AgentSwitch: Switch Account" → "Add current account…" for Codex or Claude Code.',
    );
    return;
  }

  const items = rows.map((row) => ({
    label: `${row.label}`,
    description: `${TOOL_LABEL[row.toolId]}${row.isActive ? ' · ● Active' : row.needsReauth ? ' · needs sign-in' : ''}`,
    row,
  }));
  const picked = await vscode.window.showQuickPick(items, { placeHolder: 'All AgentSwitch accounts — pick one to switch to it' });
  if (!picked) return;

  await switchTo(app, picked.row, onChanged);
}

/**
 * Saves whatever's currently live as an AgentSwitch account. If any
 * needs-sign-in profile exists for this tool (e.g. one imported from
 * codex-switcher, which has an identity but no credentials), offers to
 * attach to that instead of creating a duplicate — attachLiveToProfile()
 * is the only path that can ever turn one of those into a usable account.
 * Shared by "Add current account…" and every login flow's "save it" step.
 */
export async function saveCurrentAccount(app: AppContext, toolId: ToolId, onChanged: () => void): Promise<void> {
  const live = app.vaults[toolId].captureLiveSafe();
  if (!live) {
    void vscode.window.showErrorMessage(
      `AgentSwitch: you're not signed into ${TOOL_LABEL[toolId]} yet. Use "AgentSwitch: Log In" first, then try again.`,
    );
    return;
  }

  const needsReauth = accountRowsForTool(app, toolId).filter((r) => r.needsReauth);
  if (needsReauth.length > 0) {
    const items = [
      ...needsReauth.map((r) => ({ label: `Attach to "${r.label}"`, description: '(needs sign-in)', profileId: r.profileId as string | undefined })),
      { label: '$(add) Create a new profile instead', description: undefined, profileId: undefined },
    ];
    const picked = await vscode.window.showQuickPick(items, {
      placeHolder: `Save the signed-in ${TOOL_LABEL[toolId]} account as…`,
    });
    if (!picked) return;

    if (picked.profileId) {
      const result = await attachLiveToProfile(app, toolId, picked.profileId);
      if (result.kind === 'attached') {
        onChanged();
        void vscode.window.showInformationMessage(`AgentSwitch: "${result.label}" is now signed in and active.`);
      } else if (result.kind === 'already-has-credentials') {
        void vscode.window.showInformationMessage(`AgentSwitch: "${result.label}" already has saved credentials — nothing changed.`);
      } else if (result.kind === 'not-signed-in') {
        void vscode.window.showErrorMessage(`AgentSwitch: you're not signed into ${TOOL_LABEL[toolId]} yet.`);
      }
      return;
    }
    // else: user chose "Create a new profile instead" — fall through below.
  }

  const label = await vscode.window.showInputBox({ prompt: `Label for the currently signed-in ${TOOL_LABEL[toolId]} account` });
  if (!label) return;

  const profile = await app.profiles.create({ toolId, label, snapshot: live });
  await app.orchestrator.adoptCurrentAsActive(toolId, profile.id);
  onChanged();
  void vscode.window.showInformationMessage(`AgentSwitch: added "${label}" as the active ${TOOL_LABEL[toolId]} account.`);
}

async function removeAccountFlow(app: AppContext, toolId: ToolId, onChanged: () => void): Promise<void> {
  const removable = accountRowsForTool(app, toolId);
  if (removable.length === 0) {
    void vscode.window.showInformationMessage(`No saved ${TOOL_LABEL[toolId]} accounts to remove.`);
    return;
  }

  const target = await vscode.window.showQuickPick(
    removable.map((row) => ({ label: row.label, description: rowDescription(row), row })),
    { placeHolder: 'Remove which account?' },
  );
  if (!target) return;

  const activeSuffix = target.row.isActive
    ? ` It's currently active — the ${TOOL_LABEL[toolId]} app/CLI stays signed in, but AgentSwitch will stop tracking it as an account.`
    : '';
  const confirmed = await vscode.window.showWarningMessage(
    `Remove "${target.row.label}"? This deletes its saved credentials from AgentSwitch.${activeSuffix}`,
    { modal: true },
    'Remove',
  );
  if (confirmed !== 'Remove') return;

  const result = await removeProfile(app, toolId, target.row.profileId);
  if (result.removed) onChanged();
}

async function switchTo(app: AppContext, row: AccountRow, onChanged: () => void): Promise<void> {
  const result = await performSwitch(app, row.toolId, row.profileId);

  if (result.kind === 'already-active') {
    void vscode.window.showInformationMessage(`"${result.label}" is already the active ${TOOL_LABEL[result.toolId]} account.`);
    return;
  }
  if (result.kind === 'needs-reauth') {
    void vscode.window.showWarningMessage(
      `"${result.label}" was imported without saved credentials and needs one sign-in. Sign into that account in the ${TOOL_LABEL[result.toolId]} app or CLI, then use "Add current account…" to save it.`,
    );
    return;
  }
  if (result.kind === 'not-found') {
    return; // the picker's list was stale; nothing to do
  }

  onChanged();
  const choice = await vscode.window.showInformationMessage(
    `Switched ${TOOL_LABEL[result.toolId]} to "${result.label}". Reload the window and restart any running ${TOOL_LABEL[result.toolId]} CLI sessions to pick it up — both cache credentials in memory and can overwrite this switch if left running.`,
    'Reload Window',
  );
  if (choice === 'Reload Window') void vscode.commands.executeCommand('workbench.action.reloadWindow');
}
