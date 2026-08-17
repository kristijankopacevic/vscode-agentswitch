import { describe, it, expect } from 'vitest';
import { renderDashboardHtml, type DashboardData } from '../../../src/ui/dashboard/render';

const DATA: DashboardData = {
  totals: { codexTokens: 12345, claudeTokens: 67890, claudeCostUSD: 4.32 },
  codexRateLimit: { usedPercent: 17, windowMinutes: 10080 },
  claudeRollingEstimate: { fiveHourTokens: 4000, sevenDayTokens: 50000 },
  byProfile: [
    { label: 'Work', toolId: 'codex', inputTokens: 1000, outputTokens: 200 },
    { label: 'Personal', toolId: 'claude', inputTokens: 2000, outputTokens: 300 },
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

  it('includes the Codex exact rate-limit percentage', () => {
    const html = renderDashboardHtml(DATA, 'test-nonce');

    expect(html).toContain('17%');
  });

  it("labels the Claude rolling window as an estimate, and its tile value is a token count, never a percentage", () => {
    const html = renderDashboardHtml(DATA, 'test-nonce');

    expect(html.toLowerCase()).toContain('estimate');
    const claudeTile = html.match(/Claude — estimate[\s\S]*?<div class="tile-value">([^<]*)<\/div>/);
    expect(claudeTile?.[1]).toContain('tok');
    expect(claudeTile?.[1]).not.toContain('%');
  });

  it('includes one row per profile and per project', () => {
    const html = renderDashboardHtml(DATA, 'test-nonce');

    expect(html).toContain('Work');
    expect(html).toContain('Personal');
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
      codexRateLimit: null,
      claudeRollingEstimate: { fiveHourTokens: 0, sevenDayTokens: 0 },
      byProfile: [],
      byProject: [],
      switchHistory: [],
    };

    expect(() => renderDashboardHtml(empty, 'test-nonce')).not.toThrow();
  });
});
