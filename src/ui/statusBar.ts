import * as vscode from 'vscode';
import type { ToolId } from '../profiles/ProfileStore';
import type { AppContext } from '../appContext';
import { buildAccountRows } from './accountRows';
import { formatCodexWindows, formatClaudeWindows, abbreviateTokens } from './formatUsage';

const TOOL_LABEL: Record<ToolId, string> = { codex: 'Codex', claude: 'Claude' };
const TOOL_ICON: Record<ToolId, string> = { codex: '$(rocket)', claude: '$(sparkle)' };
const FIVE_HOURS_MS = 5 * 60 * 60 * 1000;
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

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

function accountLines(app: AppContext, toolId: ToolId): string[] {
  const rows = buildAccountRows(app.profiles.list(toolId), (t) => app.orchestrator.activeProfileId(t));
  if (rows.length === 0) return ['(none saved — click to add the currently signed-in account)'];
  return rows.map((row) => `${row.isActive ? '● ' : '  '}${row.label}${row.needsReauth ? ' (needs sign-in)' : ''}`);
}

export function updateStatusBarItems(items: StatusBarItems, app: AppContext): void {
  const now = new Date().toISOString();
  const codexLimits = app.usage.getCodexRateLimits();
  const codexFiveHour = app.usage.getCodexRollingEstimate(FIVE_HOURS_MS, now);
  const codexSevenDay = app.usage.getCodexRollingEstimate(SEVEN_DAYS_MS, now);
  const codexSuffix = formatCodexWindows(
    codexLimits,
    codexFiveHour.inputTokens + codexFiveHour.outputTokens,
    codexSevenDay.inputTokens + codexSevenDay.outputTokens,
  );

  const fiveHour = app.usage.getClaudeRollingEstimate(FIVE_HOURS_MS, now);
  const sevenDay = app.usage.getClaudeRollingEstimate(SEVEN_DAYS_MS, now);
  const fiveHourTokens = fiveHour.inputTokens + fiveHour.outputTokens;
  const sevenDayTokens = sevenDay.inputTokens + sevenDay.outputTokens;
  const claudeSuffix = formatClaudeWindows(fiveHourTokens, sevenDayTokens);

  for (const toolId of ['codex', 'claude'] as ToolId[]) {
    const activeId = app.orchestrator.activeProfileId(toolId);
    const profile = activeId ? app.profiles.get(activeId) : undefined;
    const label = profile ? profile.label : 'no account';
    const suffix = toolId === 'codex' ? codexSuffix : claudeSuffix;

    const lines = [`AgentSwitch — ${TOOL_LABEL[toolId]} accounts:`, ...accountLines(app, toolId), ''];
    if (toolId === 'codex') {
      lines.push(
        codexLimits.primary || codexLimits.secondary
          ? `Rate limit (% exact from Codex, tokens estimated from recent sessions): ${codexSuffix || '—'}`
          : 'Rate limit: no data yet.',
      );
    } else {
      lines.push(
        `Estimated usage (Claude has no exact rate-limit feed on disk): 5h ~${abbreviateTokens(fiveHourTokens)} tok · 7d ~${abbreviateTokens(sevenDayTokens)} tok`,
      );
    }
    lines.push('', 'Click to switch, add, or remove an account.');

    const item = items[toolId];
    item.text = `${TOOL_ICON[toolId]} ${TOOL_LABEL[toolId]}: ${label}${suffix ? ` · ${suffix}` : ''}`;
    item.tooltip = new vscode.MarkdownString(lines.join('\n'));
  }

  const totalAccounts = app.profiles.list().length;
  items.allAccounts.text = `$(accounts) All Accounts${totalAccounts > 0 ? ` (${totalAccounts})` : ''}`;
}
