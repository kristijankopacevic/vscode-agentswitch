import fs from 'node:fs';
import type { StateStore } from '../profiles/storage';
import { readNewLines } from './readNewLines';

/**
 * Polls a source file for lines appended since the last poll, persisting a
 * byte-offset watermark per file path in `state` so a fresh extension
 * activation resumes instead of re-parsing everything — your Claude
 * transcripts are already tens of thousands of lines across a dozen files,
 * and a full reparse per refresh would visibly stall the status bar.
 */
export class UsageIndex {
  private readonly watermarkKey: string;

  constructor(
    private readonly state: StateStore,
    toolId: string,
  ) {
    this.watermarkKey = `agentswitch.usageWatermarks.${toolId}`;
  }

  async pollNewLines(filePath: string): Promise<string[]> {
    if (!fs.existsSync(filePath)) return [];

    const watermarks = this.state.get<Record<string, number>>(this.watermarkKey) ?? {};
    const previousSize = watermarks[filePath] ?? 0;
    const { lines, newSize } = readNewLines(filePath, previousSize);

    if (newSize !== previousSize) {
      await this.state.update(this.watermarkKey, { ...watermarks, [filePath]: newSize });
    }
    return lines;
  }
}
