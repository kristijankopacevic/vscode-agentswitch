import * as vscode from 'vscode';
import type { ToolId } from '../profiles/ProfileStore';
import { NeedsReauthError } from '../switch/SwitchOrchestrator';
import type { AppContext } from '../appContext';
import { buildAccountRows, type AccountRow } from './accountRows';

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
    await addCurrentAccount(app, toolId, onChanged);
  } else if (picked.action.kind === 'remove') {
    await removeAccount(app, toolId, onChanged);
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

async function addCurrentAccount(app: AppContext, toolId: ToolId, onChanged: () => void): Promise<void> {
  const label = await vscode.window.showInputBox({ prompt: `Label for the currently signed-in ${TOOL_LABEL[toolId]} account` });
  if (!label) return;

  const snapshot = app.vaults[toolId].captureLive();
  const profile = await app.profiles.create({ toolId, label, snapshot });
  await app.orchestrator.adoptCurrentAsActive(toolId, profile.id);
  onChanged();
  void vscode.window.showInformationMessage(`AgentSwitch: added "${label}" as the active ${TOOL_LABEL[toolId]} account.`);
}

async function removeAccount(app: AppContext, toolId: ToolId, onChanged: () => void): Promise<void> {
  const removable = app.profiles.list(toolId);
  if (removable.length === 0) {
    void vscode.window.showInformationMessage(`No saved ${TOOL_LABEL[toolId]} accounts to remove.`);
    return;
  }
  const target = await vscode.window.showQuickPick(removable.map((p) => ({ label: p.label, profileId: p.id })));
  if (!target) return;

  await app.profiles.remove(target.profileId);
  onChanged();
}

async function switchTo(app: AppContext, row: AccountRow, onChanged: () => void): Promise<void> {
  const toolId = row.toolId;
  const label = row.label;

  if (row.isActive) {
    void vscode.window.showInformationMessage(`"${label}" is already the active ${TOOL_LABEL[toolId]} account.`);
    return;
  }
  if (row.needsReauth) {
    void vscode.window.showWarningMessage(
      `"${label}" was imported without saved credentials and needs one sign-in. Sign into that account in the ${TOOL_LABEL[toolId]} app or CLI, then use "Add current account…" to save it.`,
    );
    return;
  }

  try {
    await app.orchestrator.switchTo(toolId, row.profileId);
    onChanged();
    const choice = await vscode.window.showInformationMessage(
      `Switched ${TOOL_LABEL[toolId]} to "${label}". Reload the window and restart any running ${TOOL_LABEL[toolId]} CLI sessions to pick it up — both cache credentials in memory and can overwrite this switch if left running.`,
      'Reload Window',
    );
    if (choice === 'Reload Window') void vscode.commands.executeCommand('workbench.action.reloadWindow');
  } catch (err) {
    if (err instanceof NeedsReauthError) {
      // Defensive: buildAccountRows should have already caught this via needsReauth above.
      void vscode.window.showWarningMessage(`"${label}" needs one sign-in before it can be switched to.`);
      return;
    }
    throw err;
  }
}
