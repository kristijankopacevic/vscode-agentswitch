import { describe, it, expect } from 'vitest';
import { abbreviateTokens, formatCodexWindows, formatClaudeWindows } from '../../src/ui/formatUsage';

describe('abbreviateTokens', () => {
  it('shows small counts exactly', () => {
    expect(abbreviateTokens(842)).toBe('842');
  });

  it('abbreviates thousands with a "k" suffix', () => {
    expect(abbreviateTokens(12345)).toBe('12k');
  });

  it('abbreviates millions with an "M" suffix', () => {
    expect(abbreviateTokens(2_340_000)).toBe('2.3M');
  });
});

describe('formatCodexWindows', () => {
  it('shows both windows as percent remaining, labelled by duration', () => {
    const text = formatCodexWindows({
      primary: { usedPercent: 17, windowMinutes: 300, resetsAt: 0 },
      secondary: { usedPercent: 42, windowMinutes: 10080, resetsAt: 0 },
    });

    expect(text).toBe('5h 83% left · 7d 58% left');
  });

  it('shows only the window that is present', () => {
    const text = formatCodexWindows({ primary: { usedPercent: 17, windowMinutes: 300, resetsAt: 0 }, secondary: null });

    expect(text).toBe('5h 83% left');
  });

  it('returns an empty string when no window data is available yet', () => {
    expect(formatCodexWindows({ primary: null, secondary: null })).toBe('');
  });
});

describe('formatClaudeWindows', () => {
  it('shows both windows as token counts, never as a percentage', () => {
    const text = formatClaudeWindows(4000, 340000);

    expect(text).toBe('5h ~4k tok · 7d ~340k tok');
    expect(text).not.toContain('%');
  });

  it('returns an empty string when there is no usage in either window', () => {
    expect(formatClaudeWindows(0, 0)).toBe('');
  });

  it('still shows the 7d window even when the 5h window is empty', () => {
    expect(formatClaudeWindows(0, 340000)).toBe('7d ~340k tok');
  });
});
