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
import { attachLiveToProfile, removeProfile } from '../accountActions';
import { saveCurrentAccount } from '../switchQuickPick';
import { showLoginFlow } from '../authFlows';

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

type DashboardAction = 'switch' | 'attach' | 'remove' | 'addAccount' | 'login';

interface DashboardMessage {
  action: DashboardAction;
  toolId: ToolId;
  profileId?: string;
}

function isDashboardMessage(msg: unknown): msg is DashboardMessage {
  const m = msg as Record<string, unknown>;
  if (!m || (m.toolId !== 'codex' && m.toolId !== 'claude')) return false;
  return m.action === 'switch' || m.action === 'attach' || m.action === 'remove'
    ? typeof m.profileId === 'string'
    : m.action === 'addAccount' || m.action === 'login';
}

let panel: vscode.WebviewPanel | undefined;

async function handleSwitch(app: AppContext, onChanged: () => void, toolId: ToolId, profileId: string): Promise<void> {
  const result = await performSwitch(app, toolId, profileId);
  if (result.kind === 'switched') {
    onChanged();
    const choice = await vscode.window.showInformationMessage(
      `Switched ${TOOL_LABEL[result.toolId]} to "${result.label}". Reload the window and restart any running ${TOOL_LABEL[result.toolId]} CLI sessions to pick it up.`,
      'Reload Window',
    );
    if (choice === 'Reload Window') void vscode.commands.executeCommand('workbench.action.reloadWindow');
  } else if (result.kind === 'needs-reauth') {
    void vscode.window.showWarningMessage(`"${result.label}" needs one sign-in first — use the "Sign in" button on that row.`);
  } else if (result.kind === 'already-active') {
    void vscode.window.showInformationMessage(`"${result.label}" is already the active account.`);
  }
  // 'not-found': the panel's data was stale; a re-render drops its button.
}

async function handleAttach(app: AppContext, onChanged: () => void, toolId: ToolId, profileId: string): Promise<void> {
  const result = await attachLiveToProfile(app, toolId, profileId);
  if (result.kind === 'attached') {
    onChanged();
    void vscode.window.showInformationMessage(`"${result.label}" is now signed in and active.`);
  } else if (result.kind === 'not-signed-in') {
    void vscode.window.showErrorMessage(
      `AgentSwitch: you're not signed into ${TOOL_LABEL[result.toolId]} yet. Use "Log in…" first, then try again.`,
    );
  } else if (result.kind === 'already-has-credentials') {
    void vscode.window.showInformationMessage(`"${result.label}" already has saved credentials.`);
  }
}

async function handleRemove(app: AppContext, onChanged: () => void, toolId: ToolId, profileId: string): Promise<void> {
  const row = buildAccountRows(app.profiles.list(toolId), (t) => app.orchestrator.activeProfileId(t)).find(
    (r) => r.profileId === profileId,
  );
  if (!row) return;

  const activeSuffix = row.isActive
    ? ` It's currently active — the ${TOOL_LABEL[toolId]} app/CLI stays signed in, but AgentSwitch will stop tracking it as an account.`
    : '';
  const confirmed = await vscode.window.showWarningMessage(
    `Remove "${row.label}"? This deletes its saved credentials from AgentSwitch.${activeSuffix}`,
    { modal: true },
    'Remove',
  );
  if (confirmed !== 'Remove') return;

  const result = await removeProfile(app, toolId, profileId);
  if (result.removed) onChanged();
}

async function handleMessage(
  context: vscode.ExtensionContext,
  app: AppContext,
  onChanged: () => void,
  message: unknown,
): Promise<void> {
  if (!isDashboardMessage(message)) return;

  if (message.action === 'switch' && message.profileId) await handleSwitch(app, onChanged, message.toolId, message.profileId);
  else if (message.action === 'attach' && message.profileId) await handleAttach(app, onChanged, message.toolId, message.profileId);
  else if (message.action === 'remove' && message.profileId) await handleRemove(app, onChanged, message.toolId, message.profileId);
  else if (message.action === 'addAccount') await saveCurrentAccount(app, message.toolId, onChanged);
  else if (message.action === 'login') await showLoginFlow(context, app, onChanged);

  refreshDashboardIfOpen(app);
}

export function showDashboard(context: vscode.ExtensionContext, app: AppContext, onChanged: () => void): void {
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
  panel.webview.onDidReceiveMessage((message) => void handleMessage(context, app, onChanged, message));
  panel.onDidDispose(() => {
    panel = undefined;
  });
}

export function refreshDashboardIfOpen(app: AppContext): void {
  if (panel) panel.webview.html = renderDashboardHtml(buildDashboardData(app), crypto.randomUUID());
}
