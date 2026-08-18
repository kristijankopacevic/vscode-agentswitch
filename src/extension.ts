import * as vscode from 'vscode';
import { buildAppContext, migrateCodexSwitcherIfNeeded, type AppContext } from './appContext';
import { createStatusBarItems, updateStatusBarItems } from './ui/statusBar';
import { showSwitchAccountFlow, showAllAccountsFlow } from './ui/switchQuickPick';
import { showDashboard, refreshDashboardIfOpen } from './ui/dashboard/panel';
import { listClaudeTranscriptFiles, listCodexRolloutFiles } from './usage/discoverFiles';

const USAGE_REFRESH_INTERVAL_MS = 5 * 60 * 1000;

async function refreshUsage(app: AppContext): Promise<void> {
  await app.usage.refresh(listClaudeTranscriptFiles(app.claudeProjectsDir), listCodexRolloutFiles(app.codexSessionsDir));
}

export function activate(context: vscode.ExtensionContext): void {
  const app = buildAppContext(context);
  const statusBarItems = createStatusBarItems();

  const refreshAll = async (): Promise<void> => {
    await refreshUsage(app);
    updateStatusBarItems(statusBarItems, app);
    refreshDashboardIfOpen(app);
  };

  context.subscriptions.push(
    statusBarItems.codex,
    statusBarItems.claude,
    statusBarItems.allAccounts,
    vscode.commands.registerCommand('agentswitch.switchAccount', async () => {
      await showSwitchAccountFlow(app, () => updateStatusBarItems(statusBarItems, app));
    }),
    vscode.commands.registerCommand('agentswitch.showAllAccounts', async () => {
      await showAllAccountsFlow(app, () => updateStatusBarItems(statusBarItems, app));
    }),
    vscode.commands.registerCommand('agentswitch.showUsage', async () => {
      await refreshUsage(app);
      showDashboard(app);
    }),
  );

  const interval = setInterval(() => void refreshAll(), USAGE_REFRESH_INTERVAL_MS);
  context.subscriptions.push({ dispose: () => clearInterval(interval) });

  void migrateCodexSwitcherIfNeeded(context, app.profiles).then((importedCount) => {
    if (importedCount > 0) {
      void vscode.window.showInformationMessage(
        `AgentSwitch: imported ${importedCount} Codex account${importedCount === 1 ? '' : 's'} from codex-switcher. ` +
          `Each needs one sign-in — sign into that account, then use "AgentSwitch: Switch Account" → "Add current account…" to save it.`,
      );
    }
  });

  updateStatusBarItems(statusBarItems, app);
  void refreshAll();
}

export function deactivate(): void {
  // Disposables registered via context.subscriptions handle teardown.
}
