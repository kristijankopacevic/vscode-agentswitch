import fs from 'node:fs';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import { atomicWrite } from './atomicWrite';

/**
 * Timestamped backups of a live credential file, taken right before a
 * switch overwrites it. Lives in extension storage, never in the repo or a
 * synced folder — see the security notes in docs/design.md.
 */
export class BackupStore {
  constructor(
    private readonly dir: string,
    private readonly maxPerTool: number = 20,
    private readonly now: () => string = () => new Date().toISOString(),
  ) {
    fs.mkdirSync(this.dir, { recursive: true });
  }

  write(toolId: string, content: string): string {
    const filename = `${toolId}.${this.now().replace(/[:.]/g, '-')}.${crypto.randomUUID().slice(0, 8)}.json`;
    const target = path.join(this.dir, filename);
    atomicWrite(target, content);
    this.prune(toolId);
    return target;
  }

  list(toolId: string): string[] {
    return fs
      .readdirSync(this.dir)
      .filter((f) => f.startsWith(`${toolId}.`))
      .sort()
      .reverse()
      .map((f) => path.join(this.dir, f));
  }

  private prune(toolId: string): void {
    const excess = this.list(toolId).slice(this.maxPerTool);
    for (const file of excess) fs.rmSync(file, { force: true });
  }
}
