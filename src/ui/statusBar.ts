import * as vscode from 'vscode';
import type { ToolId } from '../profiles/ProfileStore';
import type { AppContext } from '../appContext';

const TOOL_LABEL: Record<ToolId, string> = { codex: 'Codex', claude: 'Claude' };
const TOOL_ICON: Record<ToolId, string> = { codex: '$(rocket)', claude: '$(sparkle)' };

export function createStatusBarItems(): Record<ToolId, vscode.StatusBarItem> {
  const make = (toolId: ToolId, priority: number): vscode.StatusBarItem => {
    const item = vscode.window.createStatusBarItem(`agentswitch.${toolId}`, vscode.StatusBarAlignment.Left, priority);
    item.command = 'agentswitch.switchAccount';
    item.show();
    return item;
  };
  return { codex: make('codex', 100), claude: make('claude', 99) };
}

export function updateStatusBarItems(items: Record<ToolId, vscode.StatusBarItem>, app: AppContext): void {
  for (const toolId of Object.keys(items) as ToolId[]) {
    const activeId = app.orchestrator.activeProfileId(toolId);
    const profile = activeId ? app.profiles.get(activeId) : undefined;
    const label = profile ? profile.label : 'no account';

    let suffix = '';
    let tooltip = `AgentSwitch: click to switch the active ${TOOL_LABEL[toolId]} account.`;
    if (toolId === 'codex') {
      const rateLimit = app.usage.getCodexRateLimit();
      if (rateLimit) suffix = ` · ${rateLimit.usedPercent}%`;
      tooltip += ' Percentage is exact, from Codex\'s own rate-limit data.';
    } else {
      const estimate = app.usage.getClaudeRollingEstimate(5 * 60 * 60 * 1000, new Date().toISOString());
      const total = estimate.inputTokens + estimate.outputTokens;
      if (total > 0) suffix = ` · ~${Math.round(total / 1000)}k tok/5h`;
      tooltip += ' Token count is an estimate — Claude has no exact rate-limit feed on disk.';
    }

    const item = items[toolId];
    item.text = `${TOOL_ICON[toolId]} ${TOOL_LABEL[toolId]}: ${label}${suffix}`;
    item.tooltip = tooltip;
  }
}
