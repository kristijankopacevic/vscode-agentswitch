import { describe, it, expect } from 'vitest';
import { renderDashboardHtml, type DashboardData } from '../../../src/ui/dashboard/render';

const DATA: DashboardData = {
  totals: { codexTokens: 12345, claudeTokens: 67890, claudeCostUSD: 4.32 },
  unattributedTokens: 10,
  codexRateLimits: {
    primary: { usedPercent: 17, windowMinutes: 300 },
    secondary: { usedPercent: 42, windowMinutes: 10080 },
  },
  claudeRollingEstimate: { fiveHourTokens: 4000, sevenDayTokens: 50000 },
  byAccount: [
    { profileId: 'p-work', toolId: 'codex', label: 'Work', isActive: true, needsReauth: false, inputTokens: 1000, outputTokens: 200 },
    {
      profileId: 'p-personal',
      toolId: 'claude',
      label: 'Personal',
      isActive: false,
      needsReauth: false,
      inputTokens: 2000,
      outputTokens: 300,
    },
    { profileId: 'p-new', toolId: 'codex', label: 'Imported', isActive: false, needsReauth: true, inputTokens: 0, outputTokens: 0 },
  ],
  byProject: [{ project: 'my-repo', inputTokens: 500, outputTokens: 100 }],
  switchHistory: [
    { ts: '2026-08-17T09:00:00.000Z', toolLabel: 'Codex', profileLabel: 'Work' },
    { ts: '2026-08-16T14:00:00.000Z', toolLabel: 'Claude', profileLabel: 'Personal' },
  ],
};

describe('renderDashboardHtml', () => {
  it('includes the overall token and cost totals', () => {
    const html = renderDashboardHtml(DATA, 'test-nonce');

    expect(html).toContain('12,345');
    expect(html).toContain('67,890');
    expect(html).toContain('$4.32');
  });

  it('shows both Codex rate-limit windows, labelled by duration, as exact percentages', () => {
    const html = renderDashboardHtml(DATA, 'test-nonce');

    expect(html).toContain('5h');
    expect(html).toContain('17%');
    expect(html).toContain('7d');
    expect(html).toContain('42%');
  });

  it("shows both Claude windows as token counts, and labels them as an estimate, never a percentage in that tile", () => {
    const html = renderDashboardHtml(DATA, 'test-nonce');

    expect(html.toLowerCase()).toContain('estimate');
    const claudeSection = html.slice(html.indexOf('Claude — estimate'), html.indexOf('</div>', html.indexOf('Claude — estimate')) + 200);
    expect(claudeSection).toContain('4,000');
    expect(claudeSection).toContain('50,000');
  });

  it('lists every saved account, including one with no recorded usage yet', () => {
    const html = renderDashboardHtml(DATA, 'test-nonce');

    expect(html).toContain('Work');
    expect(html).toContain('Personal');
    expect(html).toContain('Imported');
  });

  it('marks the active account and does not give it a switch button', () => {
    const html = renderDashboardHtml(DATA, 'test-nonce');

    expect(html).toContain('Active');
    const row = html.slice(html.indexOf('Work'), html.indexOf('Personal'));
    expect(row).not.toContain('data-action="switch"');
  });

  it('gives a signed-in, inactive account a switch button carrying its profile id and tool', () => {
    const html = renderDashboardHtml(DATA, 'test-nonce');

    const row = html.slice(html.indexOf('Personal'), html.indexOf('Imported'));
    expect(row).toContain('data-action="switch"');
    expect(row).toContain('data-profile-id="p-personal"');
    expect(row).toContain('data-tool-id="claude"');
  });

  it('gives an account needing sign-in a Sign-in button instead of a switch button', () => {
    const html = renderDashboardHtml(DATA, 'test-nonce');

    const start = html.indexOf('Imported');
    const row = html.slice(start, html.indexOf('</tr>', start));
    expect(row).toContain('data-action="attach"');
    expect(row).toContain('data-profile-id="p-new"');
    expect(row).toContain('data-tool-id="codex"');
    expect(row).not.toContain('data-action="switch"');
  });

  it('gives every account row a Remove button carrying its profile id and tool, active accounts included', () => {
    const html = renderDashboardHtml(DATA, 'test-nonce');

    const start = html.indexOf('Work');
    const row = html.slice(start, html.indexOf('</tr>', start));
    expect(row).toContain('data-action="remove"');
    expect(row).toContain('data-profile-id="p-work"');
    expect(row).toContain('data-tool-id="codex"');
  });

  it('includes an "Add current account" and a "Log in" action for each tool', () => {
    const html = renderDashboardHtml(DATA, 'test-nonce');

    for (const toolId of ['codex', 'claude']) {
      expect(html).toContain(`data-action="addAccount" data-tool-id="${toolId}"`);
      expect(html).toContain(`data-action="login" data-tool-id="${toolId}"`);
    }
  });

  it('shows unattributed usage as a note, not as a fake account row', () => {
    const html = renderDashboardHtml(DATA, 'test-nonce');

    expect(html.toLowerCase()).toContain('unattributed');
    expect(html).not.toMatch(/<td>\s*unattributed/i);
  });

  it('includes one row per project', () => {
    const html = renderDashboardHtml(DATA, 'test-nonce');

    expect(html).toContain('my-repo');
  });

  it('includes the switch history as a table with a timestamp column, newest entry first', () => {
    const html = renderDashboardHtml(DATA, 'test-nonce');

    expect(html).toMatch(/<th>\s*When\s*<\/th>/i);
    const firstRowIndex = html.indexOf('2026-08-17');
    const secondRowIndex = html.indexOf('2026-08-16');
    expect(firstRowIndex).toBeGreaterThan(-1);
    expect(secondRowIndex).toBeGreaterThan(firstRowIndex);
  });

  it('carries the given nonce on every inline script tag', () => {
    const html = renderDashboardHtml(DATA, 'test-nonce');

    const scriptTags = html.match(/<script\b[^>]*>/g) ?? [];
    expect(scriptTags.length).toBeGreaterThan(0);
    for (const tag of scriptTags) expect(tag).toContain('nonce="test-nonce"');
  });

  it('references no external resource — no http(s) URLs, no non-nonced script, no external stylesheet', () => {
    const html = renderDashboardHtml(DATA, 'test-nonce');

    expect(html).not.toMatch(/https?:\/\//);
    expect(html).not.toMatch(/<link\b/);
    expect(html).not.toMatch(/<script\s+src=/);
  });

  it('renders without throwing when there is no data yet', () => {
    const empty: DashboardData = {
      totals: { codexTokens: 0, claudeTokens: 0, claudeCostUSD: 0 },
      unattributedTokens: 0,
      codexRateLimits: { primary: null, secondary: null },
      claudeRollingEstimate: { fiveHourTokens: 0, sevenDayTokens: 0 },
      byAccount: [],
      byProject: [],
      switchHistory: [],
    };

    expect(() => renderDashboardHtml(empty, 'test-nonce')).not.toThrow();
  });
});
