import { describe, it, expect } from 'vitest';
import { describeError } from '../../src/ui/errorReporting';

describe('describeError', () => {
  it('returns an Error\'s message', () => {
    expect(describeError(new Error('boom'))).toBe('boom');
  });

  it('falls back to String() for a non-Error throw (e.g. a thrown string)', () => {
    expect(describeError('plain string')).toBe('plain string');
  });

  it('falls back to String() for an Error with an empty message', () => {
    expect(describeError(new Error(''))).toBe('Error');
  });
});
