import * as vscode from 'vscode';
import type { ToolId } from '../profiles/ProfileStore';
import { NeedsReauthError } from '../switch/SwitchOrchestrator';
import type { AppContext } from '../appContext';

const TOOL_LABEL: Record<ToolId, string> = { codex: 'Codex', claude: 'Claude Code' };

type ProfileAction = { kind: 'switch'; profileId: string } | { kind: 'add' } | { kind: 'remove' };

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

  const items: (vscode.QuickPickItem & { action: ProfileAction })[] = app.profiles.list(toolId).map((p) => ({
    label: p.label,
    description: p.hasSnapshot ? undefined : '(needs sign-in)',
    action: { kind: 'switch', profileId: p.id },
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
    await switchTo(app, toolId, picked.action.profileId, picked.label, onChanged);
  }
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

async function switchTo(app: AppContext, toolId: ToolId, profileId: string, label: string, onChanged: () => void): Promise<void> {
  try {
    await app.orchestrator.switchTo(toolId, profileId);
    onChanged();
    const choice = await vscode.window.showInformationMessage(
      `Switched ${TOOL_LABEL[toolId]} to "${label}". Reload the window and restart any running ${TOOL_LABEL[toolId]} CLI sessions to pick it up — both cache credentials in memory and can overwrite this switch if left running.`,
      'Reload Window',
    );
    if (choice === 'Reload Window') void vscode.commands.executeCommand('workbench.action.reloadWindow');
  } catch (err) {
    if (err instanceof NeedsReauthError) {
      void vscode.window.showWarningMessage(
        `"${label}" was imported without saved credentials and needs one sign-in. Sign into that account in the ${TOOL_LABEL[toolId]} app or CLI, then use "Add current account…" to save it.`,
      );
      return;
    }
    throw err;
  }
}
