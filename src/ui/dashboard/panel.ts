import * as vscode from 'vscode';
import fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import { renderDashboardHtml, type DashboardData } from './render';
import { readClaudeStatsSummary } from '../../usage/ClaudeUsageReader';
import type { AppContext } from '../../appContext';
import type { ToolId } from '../../profiles/ProfileStore';
import { buildAccountRows } from '../accountRows';
import { performSwitch } from '../switchActions';

const TOOL_LABEL: Record<ToolId, string> = { codex: 'Codex', claude: 'Claude' };
const FIVE_HOURS_MS = 5 * 60 * 60 * 1000;
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

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
  const usageByProfileId = breakdown.byProfile;

  // Every saved account, whether or not it has recorded usage yet — the
  // dashboard's accounts table must show all of them, not just active ones.
  const accountRows = buildAccountRows(app.profiles.list(), (t) => app.orchestrator.activeProfileId(t));
  let codexTotal = 0;
  let claudeTotal = 0;
  const byAccount: DashboardData['byAccount'] = accountRows.map((row) => {
    const bucket = usageByProfileId[row.profileId];
    const inputTokens = bucket?.inputTokens ?? 0;
    const outputTokens = bucket?.outputTokens ?? 0;
    if (row.toolId === 'codex') codexTotal += inputTokens + outputTokens;
    else claudeTotal += inputTokens + outputTokens;
    return { profileId: row.profileId, toolId: row.toolId, label: row.label, isActive: row.isActive, needsReauth: row.needsReauth, inputTokens, outputTokens };
  });

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

  const unattributed = usageByProfileId['unattributed'];
  const codexRateLimits = app.usage.getCodexRateLimits();
  const now = new Date().toISOString();

  return {
    totals: { codexTokens: codexTotal, claudeTokens: claudeTotal, claudeCostUSD: readClaudeCostUSD() },
    unattributedTokens: unattributed ? unattributed.inputTokens + unattributed.outputTokens : 0,
    codexRateLimits,
    claudeRollingEstimate: {
      fiveHourTokens: sumTokens(app.usage.getClaudeRollingEstimate(FIVE_HOURS_MS, now)),
      sevenDayTokens: sumTokens(app.usage.getClaudeRollingEstimate(SEVEN_DAYS_MS, now)),
    },
    byAccount,
    byProject: projectRows,
    switchHistory,
  };
}

function sumTokens(bucket: { inputTokens: number; outputTokens: number }): number {
  return bucket.inputTokens + bucket.outputTokens;
}

interface SwitchAccountMessage {
  type: 'switchAccount';
  toolId: ToolId;
  profileId: string;
}

function isSwitchAccountMessage(msg: unknown): msg is SwitchAccountMessage {
  const m = msg as Record<string, unknown>;
  return !!m && m.type === 'switchAccount' && typeof m.profileId === 'string' && (m.toolId === 'codex' || m.toolId === 'claude');
}

let panel: vscode.WebviewPanel | undefined;

async function handleMessage(app: AppContext, onChanged: () => void, message: unknown): Promise<void> {
  if (!isSwitchAccountMessage(message)) return;

  const result = await performSwitch(app, message.toolId, message.profileId);
  if (result.kind === 'switched') {
    onChanged();
    refreshDashboardIfOpen(app);
    const choice = await vscode.window.showInformationMessage(
      `Switched ${TOOL_LABEL[result.toolId]} to "${result.label}". Reload the window and restart any running ${TOOL_LABEL[result.toolId]} CLI sessions to pick it up.`,
      'Reload Window',
    );
    if (choice === 'Reload Window') void vscode.commands.executeCommand('workbench.action.reloadWindow');
  } else if (result.kind === 'needs-reauth') {
    void vscode.window.showWarningMessage(
      `"${result.label}" was imported without saved credentials and needs one sign-in first. Sign into that account, then use "Add current account…" to save it.`,
    );
  } else if (result.kind === 'already-active') {
    void vscode.window.showInformationMessage(`"${result.label}" is already the active account.`);
  }
  // 'not-found': the panel's data was stale (e.g. the profile was removed
  // elsewhere); a re-render on the next refresh will drop its button.
}

export function showDashboard(app: AppContext, onChanged: () => void): void {
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
  panel.webview.onDidReceiveMessage((message) => void handleMessage(app, onChanged, message));
  panel.onDidDispose(() => {
    panel = undefined;
  });
}

export function refreshDashboardIfOpen(app: AppContext): void {
  if (panel) panel.webview.html = renderDashboardHtml(buildDashboardData(app), crypto.randomUUID());
}
