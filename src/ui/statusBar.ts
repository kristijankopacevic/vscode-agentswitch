import * as vscode from 'vscode';
import type { ToolId } from '../profiles/ProfileStore';
import type { AppContext } from '../appContext';
import { buildAccountRows } from './accountRows';

const TOOL_LABEL: Record<ToolId, string> = { codex: 'Codex', claude: 'Claude' };
const TOOL_ICON: Record<ToolId, string> = { codex: '$(rocket)', claude: '$(sparkle)' };

export interface StatusBarItems {
  codex: vscode.StatusBarItem;
  claude: vscode.StatusBarItem;
  allAccounts: vscode.StatusBarItem;
}

export function createStatusBarItems(): StatusBarItems {
  const codex = vscode.window.createStatusBarItem('agentswitch.codex', vscode.StatusBarAlignment.Left, 100);
  codex.command = 'agentswitch.switchAccount';
  codex.show();

  const claude = vscode.window.createStatusBarItem('agentswitch.claude', vscode.StatusBarAlignment.Left, 99);
  claude.command = 'agentswitch.switchAccount';
  claude.show();

  const allAccounts = vscode.window.createStatusBarItem('agentswitch.allAccounts', vscode.StatusBarAlignment.Left, 98);
  allAccounts.text = '$(accounts)';
  allAccounts.tooltip = 'AgentSwitch: see and switch every saved account, for both Codex and Claude Code';
  allAccounts.command = 'agentswitch.showAllAccounts';
  allAccounts.show();

  return { codex, claude, allAccounts };
}

function toolTooltip(app: AppContext, toolId: ToolId): string {
  const rows = buildAccountRows(app.profiles.list(toolId), (t) => app.orchestrator.activeProfileId(t));
  const lines = [`AgentSwitch — ${TOOL_LABEL[toolId]} accounts:`];
  if (rows.length === 0) {
    lines.push('(none saved — click to add the currently signed-in account)');
  } else {
    for (const row of rows) {
      lines.push(`${row.isActive ? '● ' : '  '}${row.label}${row.needsReauth ? ' (needs sign-in)' : ''}`);
    }
  }
  lines.push('', 'Click to switch, add, or remove an account.');
  return lines.join('\n');
}

export function updateStatusBarItems(items: StatusBarItems, app: AppContext): void {
  for (const toolId of ['codex', 'claude'] as ToolId[]) {
    const activeId = app.orchestrator.activeProfileId(toolId);
    const profile = activeId ? app.profiles.get(activeId) : undefined;
    const label = profile ? profile.label : 'no account';

    let suffix = '';
    if (toolId === 'codex') {
      const rateLimit = app.usage.getCodexRateLimit();
      if (rateLimit) suffix = ` · ${rateLimit.usedPercent}%`;
    } else {
      const estimate = app.usage.getClaudeRollingEstimate(5 * 60 * 60 * 1000, new Date().toISOString());
      const total = estimate.inputTokens + estimate.outputTokens;
      if (total > 0) suffix = ` · ~${Math.round(total / 1000)}k tok/5h`;
    }

    const item = items[toolId];
    item.text = `${TOOL_ICON[toolId]} ${TOOL_LABEL[toolId]}: ${label}${suffix}`;
    item.tooltip = new vscode.MarkdownString(
      toolTooltip(app, toolId) +
        (toolId === 'codex'
          ? '\n\n(percentage is exact, from Codex\'s own rate-limit data)'
          : '\n\n(token estimate — Claude has no exact rate-limit feed on disk)'),
    );
  }

  const totalAccounts = app.profiles.list().length;
  items.allAccounts.text = `$(accounts) All Accounts${totalAccounts > 0 ? ` (${totalAccounts})` : ''}`;
}
