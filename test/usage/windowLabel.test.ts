import { describe, it, expect } from 'vitest';
import { describeWindow } from '../../src/usage/windowLabel';

describe('describeWindow', () => {
  it('labels a ~5 hour window as "5h"', () => {
    expect(describeWindow(300)).toBe('5h');
  });

  it('labels a window up to 6 hours as "5h" (Codex reports slightly varying minute counts)', () => {
    expect(describeWindow(360)).toBe('5h');
  });

  it('labels a ~7 day window as "7d"', () => {
    expect(describeWindow(10080)).toBe('7d');
  });

  it('labels anything 6 days or longer as "7d"', () => {
    expect(describeWindow(6 * 24 * 60)).toBe('7d');
  });

  it('falls back to a generic hour count for anything in between', () => {
    expect(describeWindow(1440)).toBe('24h');
  });
});
