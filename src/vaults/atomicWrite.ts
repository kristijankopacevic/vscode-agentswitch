import fs from 'node:fs';
import * as path from 'node:path';
import * as crypto from 'node:crypto';

/**
 * Writes `content` to `targetPath` atomically: write to a sibling temp file,
 * fsync it, then rename over the target. Rename is atomic on the same
 * filesystem (guaranteed here by placing the temp file next to the target),
 * so a crash or a concurrent reader can never observe a partially-written
 * credentials file — the target is either the old content or the new
 * content, never a truncated mix of both.
 */
export function atomicWrite(targetPath: string, content: string): void {
  const dir = path.dirname(targetPath);
  const tmpPath = path.join(dir, `.${path.basename(targetPath)}.tmp-${crypto.randomUUID()}`);

  const fd = fs.openSync(tmpPath, 'w', 0o600);
  try {
    fs.writeSync(fd, content, null, 'utf8');
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }

  try {
    fs.renameSync(tmpPath, targetPath);
  } catch (err) {
    // Rename failed: the target is untouched (we never wrote to it directly).
    // Clean up the orphaned temp file before propagating the error.
    fs.rmSync(tmpPath, { force: true });
    throw err;
  }
}
