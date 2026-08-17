import type { Vault } from '../../src/vaults/Vault';

export class FakeVault implements Vault {
  live: Record<string, unknown>;

  constructor(
    public readonly toolId: string,
    initial: Record<string, unknown>,
  ) {
    this.live = initial;
  }

  captureLive(): Record<string, unknown> {
    return this.live;
  }

  applyLive(snapshot: Record<string, unknown>): void {
    this.live = snapshot;
  }
}
