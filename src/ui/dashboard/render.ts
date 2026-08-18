import { describeWindow } from '../../usage/windowLabel';

export interface DashboardRateLimitWindow {
  usedPercent: number;
  windowMinutes: number;
}

export interface DashboardAccountRow {
  profileId: string;
  toolId: 'codex' | 'claude';
  label: string;
  isActive: boolean;
  needsReauth: boolean;
  inputTokens: number;
  outputTokens: number;
}

export interface DashboardData {
  totals: { codexTokens: number; claudeTokens: number; claudeCostUSD: number };
  /** Usage recorded before any account was tracked — a total, never guessed at per account. */
  unattributedTokens: number;
  codexRateLimits: { primary: DashboardRateLimitWindow | null; secondary: DashboardRateLimitWindow | null };
  claudeRollingEstimate: { fiveHourTokens: number; sevenDayTokens: number };
  /** Every saved account for both tools, whether or not it has recorded usage yet. */
  byAccount: DashboardAccountRow[];
  byProject: Array<{ project: string; inputTokens: number; outputTokens: number }>;
  /** Newest first. The raw switch log — this is the "over time" view: what changed and when, not a token trend. */
  switchHistory: Array<{ ts: string; toolLabel: string; profileLabel: string }>;
}

// Fixed categorical assignment by entity (the tool), never re-cycled or
// swapped per render. VS Code's --vscode-charts-* tokens are already
// adapted per installed theme (light/dark/high-contrast) by the host, so
// they stand in for a validated palette here instead of a fixed hex set.
const CODEX_COLOR = 'var(--vscode-charts-blue)';
const CLAUDE_COLOR = 'var(--vscode-charts-orange)';
const TOOL_LABEL: Record<DashboardAccountRow['toolId'], string> = { codex: 'Codex', claude: 'Claude' };

function esc(value: unknown): string {
  return String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

function fmt(n: number): string {
  return n.toLocaleString('en-US');
}

function statTile(label: string, value: string, color?: string): string {
  return `<div class="tile">
    <div class="tile-label">${esc(label)}</div>
    <div class="tile-value"${color ? ` style="color:${color}"` : ''}>${value}</div>
  </div>`;
}

function meter(percent: number, color: string): string {
  const clamped = Math.max(0, Math.min(100, percent));
  return `<div class="meter"><div class="meter-fill" style="width:${clamped}%;background:${color}"></div></div>`;
}

function windowRow(window: DashboardRateLimitWindow | null, color: string): string {
  if (!window) return '<div class="note">No data yet.</div>';
  return `<div class="window-row">
    <span class="window-label">${esc(describeWindow(window.windowMinutes))}</span>
    <span>${window.usedPercent}% used</span>
  </div>
  ${meter(window.usedPercent, color)}`;
}

function accountRowHtml(row: DashboardAccountRow): string[] {
  const tokens = fmt(row.inputTokens + row.outputTokens);
  let statusCell: string;
  if (row.isActive) {
    statusCell = '<span class="badge active">● Active</span>';
  } else if (row.needsReauth) {
    statusCell = '<span class="badge">Needs sign-in</span>';
  } else {
    statusCell = `<button type="button" data-action="switch" data-tool-id="${esc(row.toolId)}" data-profile-id="${esc(row.profileId)}">Switch</button>`;
  }
  return [esc(row.label), esc(TOOL_LABEL[row.toolId]), tokens, statusCell];
}

function table(headers: string[], rows: string[][]): string {
  if (rows.length === 0) return '<p class="empty">No data yet.</p>';
  const head = headers.map((h) => `<th>${esc(h)}</th>`).join('');
  const body = rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`).join('');
  return `<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
}

/** Pure: takes plain data, returns the full webview HTML string. No `vscode` import, so this is unit-testable. */
export function renderDashboardHtml(data: DashboardData, nonce: string): string {
  const csp = `default-src 'none'; style-src 'unsafe-inline'; img-src data:; script-src 'nonce-${nonce}';`;

  const accountRows = data.byAccount.map(accountRowHtml);
  const projectRows = data.byProject.map((p) => [esc(p.project), fmt(p.inputTokens + p.outputTokens)]);
  const historyRows = data.switchHistory.map((h) => [esc(h.ts), esc(h.toolLabel), esc(h.profileLabel)]);

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="${csp}">
<style>
  body { font-family: var(--vscode-font-family); color: var(--vscode-foreground); background: var(--vscode-editor-background); padding: 12px 16px; }
  h2 { font-size: 1em; font-weight: 600; margin: 20px 0 8px; color: var(--vscode-foreground); }
  .tiles { display: flex; gap: 16px; flex-wrap: wrap; }
  .tile { background: var(--vscode-editorWidget-background); border: 1px solid var(--vscode-widget-border); border-radius: 4px; padding: 8px 12px; min-width: 150px; }
  .tile-label { font-size: 0.8em; color: var(--vscode-descriptionForeground); }
  .tile-value { font-size: 1.3em; font-weight: 600; }
  .window-row { display: flex; justify-content: space-between; font-size: 0.85em; margin-top: 6px; }
  .window-row:first-of-type { margin-top: 2px; }
  .window-label { font-weight: 600; color: var(--vscode-foreground); }
  .meter { height: 5px; border-radius: 3px; background: var(--vscode-editorWidget-background); overflow: hidden; margin: 2px 0 6px; }
  .meter-fill { height: 100%; }
  table { border-collapse: collapse; width: 100%; font-size: 0.9em; }
  th, td { text-align: left; padding: 4px 10px 4px 0; border-bottom: 1px solid var(--vscode-widget-border); }
  th { color: var(--vscode-descriptionForeground); font-weight: 500; }
  .empty { color: var(--vscode-descriptionForeground); font-size: 0.9em; }
  .note { font-size: 0.8em; color: var(--vscode-descriptionForeground); margin-top: 4px; }
  .badge { font-size: 0.85em; color: var(--vscode-descriptionForeground); }
  .badge.active { color: var(--vscode-foreground); font-weight: 600; }
  button { font-size: 0.85em; padding: 2px 10px; cursor: pointer; background: var(--vscode-button-background); color: var(--vscode-button-foreground); border: none; border-radius: 3px; }
  button:hover { background: var(--vscode-button-hoverBackground); }
</style>
</head>
<body>
  <h2>Overview</h2>
  <div class="tiles">
    ${statTile('Codex tokens (all time)', fmt(data.totals.codexTokens), CODEX_COLOR)}
    ${statTile('Claude tokens (all time)', fmt(data.totals.claudeTokens), CLAUDE_COLOR)}
    ${statTile('Claude cost (all time)', `$${data.totals.claudeCostUSD.toFixed(2)}`)}
  </div>
  <p class="note">
    Codex cost is not shown — no local pricing table is configured yet.
    ${data.unattributedTokens > 0 ? ` · ${fmt(data.unattributedTokens)} tokens are unattributed (recorded before AgentSwitch tracked this account).` : ''}
  </p>

  <h2>Rate limit windows</h2>
  <div class="tiles">
    <div class="tile">
      <div class="tile-label">Codex — exact</div>
      ${windowRow(data.codexRateLimits.primary, CODEX_COLOR)}
      ${data.codexRateLimits.secondary ? windowRow(data.codexRateLimits.secondary, CODEX_COLOR) : ''}
    </div>
    <div class="tile">
      <div class="tile-label">Claude — estimate</div>
      <div class="window-row"><span class="window-label">5h</span><span>${fmt(data.claudeRollingEstimate.fiveHourTokens)} tok</span></div>
      <div class="window-row"><span class="window-label">7d</span><span>${fmt(data.claudeRollingEstimate.sevenDayTokens)} tok</span></div>
      <div class="note">Estimated from local transcripts — Claude has no exact rate-limit feed on disk.</div>
    </div>
  </div>

  <h2>Accounts</h2>
  ${table(['Account', 'Tool', 'Tokens', ''], accountRows)}

  <h2>By project</h2>
  ${table(['Project', 'Tokens'], projectRows)}

  <h2>Switch history</h2>
  ${table(['When', 'Tool', 'Account'], historyRows)}

  <script nonce="${nonce}">
    (function () {
      const vscode = acquireVsCodeApi();
      document.querySelectorAll('button[data-action="switch"]').forEach((button) => {
        button.addEventListener('click', () => {
          button.disabled = true;
          vscode.postMessage({
            type: 'switchAccount',
            toolId: button.getAttribute('data-tool-id'),
            profileId: button.getAttribute('data-profile-id'),
          });
        });
      });
    })();
  </script>
</body>
</html>`;
}
