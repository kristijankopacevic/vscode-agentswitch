import type { Vault } from '../../src/vaults/Vault';

/** `live: null` simulates a tool nobody has signed into yet. */
export class FakeVault implements Vault {
  live: Record<string, unknown> | null;

  constructor(
    public readonly toolId: string,
    initial: Record<string, unknown> | null,
  ) {
    this.live = initial;
  }

  captureLive(): Record<string, unknown> {
    if (this.live === null) throw new Error(`FakeVault(${this.toolId}): not signed in`);
    return this.live;
  }

  captureLiveSafe(): Record<string, unknown> | null {
    return this.live;
  }

  applyLive(snapshot: Record<string, unknown>): void {
    this.live = snapshot;
  }
}
