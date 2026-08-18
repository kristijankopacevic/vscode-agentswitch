import * as vscode from 'vscode';
import { buildAppContext, migrateCodexSwitcherIfNeeded, type AppContext } from './appContext';
import { createStatusBarItems, updateStatusBarItems } from './ui/statusBar';
import { showSwitchAccountFlow, showAllAccountsFlow } from './ui/switchQuickPick';
import { showLoginFlow, showLogoutFlow, showAddAnotherAccountFlow } from './ui/authFlows';
import { showDashboard, refreshDashboardIfOpen } from './ui/dashboard/panel';
import { listClaudeTranscriptFiles, listCodexRolloutFiles } from './usage/discoverFiles';
import { describeError } from './ui/errorReporting';

const USAGE_REFRESH_INTERVAL_MS = 5 * 60 * 1000;

async function refreshUsage(app: AppContext): Promise<void> {
  await app.usage.refresh(listClaudeTranscriptFiles(app.claudeProjectsDir), listCodexRolloutFiles(app.codexSessionsDir));
}

/**
 * Wraps a command body so a thrown exception becomes a visible error
 * message instead of silently vanishing — the uncaught-throw bug that
 * made "Add current account" look like it did nothing when the vault had
 * no live credentials to capture.
 */
function withErrorReporting(label: string, fn: () => Promise<void>): () => Promise<void> {
  return async () => {
    try {
      await fn();
    } catch (err) {
      void vscode.window.showErrorMessage(`AgentSwitch: ${label} failed — ${describeError(err)}`);
    }
  };
}

export function activate(context: vscode.ExtensionContext): void {
  const app = buildAppContext(context);
  const statusBarItems = createStatusBarItems();
  const onChanged = (): void => updateStatusBarItems(statusBarItems, app);

  const refreshAll = async (): Promise<void> => {
    await refreshUsage(app);
    onChanged();
    refreshDashboardIfOpen(app);
  };

  context.subscriptions.push(
    statusBarItems.codex,
    statusBarItems.claude,
    statusBarItems.allAccounts,
    vscode.commands.registerCommand(
      'agentswitch.switchAccount',
      withErrorReporting('Switch Account', () => showSwitchAccountFlow(app, onChanged)),
    ),
    vscode.commands.registerCommand(
      'agentswitch.showAllAccounts',
      withErrorReporting('Show All Accounts', () => showAllAccountsFlow(app, onChanged)),
    ),
    vscode.commands.registerCommand(
      'agentswitch.login',
      withErrorReporting('Log In', () => showLoginFlow(context, app, onChanged)),
    ),
    vscode.commands.registerCommand(
      'agentswitch.logout',
      withErrorReporting('Log Out', () => showLogoutFlow(context, app, onChanged)),
    ),
    vscode.commands.registerCommand(
      'agentswitch.addAnotherAccount',
      withErrorReporting('Add Another Account', () => showAddAnotherAccountFlow(context, app, onChanged)),
    ),
    vscode.commands.registerCommand(
      'agentswitch.showUsage',
      withErrorReporting('Show Usage Dashboard', async () => {
        await refreshUsage(app);
        showDashboard(context, app, onChanged);
      }),
    ),
  );

  const interval = setInterval(() => void refreshAll(), USAGE_REFRESH_INTERVAL_MS);
  context.subscriptions.push({ dispose: () => clearInterval(interval) });

  void migrateCodexSwitcherIfNeeded(context, app.profiles).then((importedCount) => {
    if (importedCount > 0) {
      void vscode.window.showInformationMessage(
        `AgentSwitch: imported ${importedCount} Codex account${importedCount === 1 ? '' : 's'} from codex-switcher. ` +
          `Each needs one sign-in — sign into that account, then use "AgentSwitch: Switch Account" → "Add current account…", ` +
          `which will offer to attach it instead of creating a duplicate.`,
      );
    }
  });

  onChanged();
  void refreshAll();
}

export function deactivate(): void {
  // Disposables registered via context.subscriptions handle teardown.
}
