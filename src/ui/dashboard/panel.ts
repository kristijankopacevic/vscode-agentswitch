import * as vscode from 'vscode';
import fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import { renderDashboardHtml, type DashboardData } from './render';
import { readClaudeStatsSummary } from '../../usage/ClaudeUsageReader';
import type { AppContext } from '../../appContext';
import type { ToolId } from '../../profiles/ProfileStore';

const TOOL_LABEL: Record<ToolId, string> = { codex: 'Codex', claude: 'Claude' };
const UNATTRIBUTED_LABEL = 'Unattributed (recorded before AgentSwitch tracked this account)';

function readClaudeCostUSD(): number {
  const statsPath = path.join(os.homedir(), '.claude', 'stats-cache.json');
  if (!fs.existsSync(statsPath)) return 0;
  try {
    return readClaudeStatsSummary(JSON.parse(fs.readFileSync(statsPath, 'utf8'))).totalCostUSD;
  } catch {
    return 0; // a malformed or mid-write stats-cache.json must not break the dashboard
  }
}

export function buildDashboardData(app: AppContext): DashboardData {
  const breakdown = app.usage.getCurrentBreakdown();

  // Per-tool all-time totals: sum whichever profiles belong to that tool,
  // since the breakdown's byProfile map spans both tools by profile id.
  let codexTotal = 0;
  let claudeTotal = 0;
  const profileRows: DashboardData['byProfile'] = [];
  for (const [profileId, bucket] of Object.entries(breakdown.byProfile)) {
    if (profileId === 'unattributed') {
      profileRows.push({
        label: UNATTRIBUTED_LABEL,
        toolLabel: 'Codex + Claude',
        inputTokens: bucket.inputTokens,
        outputTokens: bucket.outputTokens,
      });
      continue;
    }
    const profile = app.profiles.get(profileId);
    if (!profile) continue; // profile was removed since this usage was recorded
    if (profile.toolId === 'codex') codexTotal += bucket.inputTokens + bucket.outputTokens;
    else claudeTotal += bucket.inputTokens + bucket.outputTokens;
    profileRows.push({
      label: profile.label,
      toolLabel: TOOL_LABEL[profile.toolId],
      inputTokens: bucket.inputTokens,
      outputTokens: bucket.outputTokens,
    });
  }

  const projectRows = Object.entries(breakdown.byProject).map(([project, bucket]) => ({
    project,
    inputTokens: bucket.inputTokens,
    outputTokens: bucket.outputTokens,
  }));

  const switchHistory = app.switchLog.recent(50).map((entry) => ({
    ts: entry.ts,
    toolLabel: TOOL_LABEL[entry.toolId],
    profileLabel: app.profiles.get(entry.profileId)?.label ?? '(removed account)',
  }));

  return {
    totals: { codexTokens: codexTotal, claudeTokens: claudeTotal, claudeCostUSD: readClaudeCostUSD() },
    codexRateLimit: app.usage.getCodexRateLimit(),
    claudeRollingEstimate: {
      fiveHourTokens: sumTokens(app.usage.getClaudeRollingEstimate(5 * 60 * 60 * 1000, new Date().toISOString())),
      sevenDayTokens: sumTokens(app.usage.getClaudeRollingEstimate(7 * 24 * 60 * 60 * 1000, new Date().toISOString())),
    },
    byProfile: profileRows,
    byProject: projectRows,
    switchHistory,
  };
}

function sumTokens(bucket: { inputTokens: number; outputTokens: number }): number {
  return bucket.inputTokens + bucket.outputTokens;
}

let panel: vscode.WebviewPanel | undefined;

export function showDashboard(app: AppContext): void {
  const html = renderDashboardHtml(buildDashboardData(app), crypto.randomUUID());
  if (panel) {
    panel.reveal();
    panel.webview.html = html;
    return;
  }
  panel = vscode.window.createWebviewPanel('agentswitch.dashboard', 'AgentSwitch Usage', vscode.ViewColumn.Active, {
    enableScripts: true,
  });
  panel.webview.html = html;
  panel.onDidDispose(() => {
    panel = undefined;
  });
}

export function refreshDashboardIfOpen(app: AppContext): void {
  if (panel) panel.webview.html = renderDashboardHtml(buildDashboardData(app), crypto.randomUUID());
}
