export interface DashboardData {
  totals: { codexTokens: number; claudeTokens: number; claudeCostUSD: number };
  codexRateLimit: { usedPercent: number; windowMinutes: number } | null;
  claudeRollingEstimate: { fiveHourTokens: number; sevenDayTokens: number };
  byProfile: Array<{ label: string; toolLabel: string; inputTokens: number; outputTokens: number }>;
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

function table(headers: string[], rows: string[][]): string {
  if (rows.length === 0) return '<p class="empty">No data yet.</p>';
  const head = headers.map((h) => `<th>${esc(h)}</th>`).join('');
  const body = rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`).join('');
  return `<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
}

/** Pure: takes plain data, returns the full webview HTML string. No `vscode` import, so this is unit-testable. */
export function renderDashboardHtml(data: DashboardData, nonce: string): string {
  const csp = `default-src 'none'; style-src 'unsafe-inline'; img-src data:; script-src 'nonce-${nonce}';`;

  const profileRows = data.byProfile.map((p) => [esc(p.label), esc(p.toolLabel), fmt(p.inputTokens + p.outputTokens)]);
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
  .tile { background: var(--vscode-editorWidget-background); border: 1px solid var(--vscode-widget-border); border-radius: 4px; padding: 8px 12px; min-width: 120px; }
  .tile-label { font-size: 0.8em; color: var(--vscode-descriptionForeground); }
  .tile-value { font-size: 1.3em; font-weight: 600; }
  .meter { height: 6px; border-radius: 3px; background: var(--vscode-editorWidget-background); overflow: hidden; margin-top: 4px; }
  .meter-fill { height: 100%; }
  table { border-collapse: collapse; width: 100%; font-size: 0.9em; }
  th, td { text-align: left; padding: 4px 10px 4px 0; border-bottom: 1px solid var(--vscode-widget-border); }
  th { color: var(--vscode-descriptionForeground); font-weight: 500; }
  .empty { color: var(--vscode-descriptionForeground); font-size: 0.9em; }
  .note { font-size: 0.8em; color: var(--vscode-descriptionForeground); margin-top: 4px; }
</style>
</head>
<body>
  <h2>Overview</h2>
  <div class="tiles">
    ${statTile('Codex tokens (all time)', fmt(data.totals.codexTokens), CODEX_COLOR)}
    ${statTile('Claude tokens (all time)', fmt(data.totals.claudeTokens), CLAUDE_COLOR)}
    ${statTile('Claude cost (all time)', `$${data.totals.claudeCostUSD.toFixed(2)}`)}
  </div>
  <p class="note">Codex cost is not shown — no local pricing table is configured yet.</p>

  <h2>Rate limit windows</h2>
  <div class="tiles">
    <div class="tile">
      <div class="tile-label">Codex — exact</div>
      <div class="tile-value">${data.codexRateLimit ? `${data.codexRateLimit.usedPercent}%` : '—'}</div>
      ${data.codexRateLimit ? meter(data.codexRateLimit.usedPercent, CODEX_COLOR) : ''}
    </div>
    <div class="tile">
      <div class="tile-label">Claude — estimate (last 5h)</div>
      <div class="tile-value">${fmt(data.claudeRollingEstimate.fiveHourTokens)} tok</div>
      <div class="note">Estimated from local transcripts — Claude has no exact rate-limit feed on disk.</div>
    </div>
  </div>

  <h2>By account</h2>
  ${table(['Account', 'Tool', 'Tokens'], profileRows)}

  <h2>By project</h2>
  ${table(['Project', 'Tokens'], projectRows)}

  <h2>Switch history</h2>
  ${table(['When', 'Tool', 'Account'], historyRows)}

  <script nonce="${nonce}">
    // Placeholder for future interactivity (e.g. a refresh button).
  </script>
</body>
</html>`;
}
