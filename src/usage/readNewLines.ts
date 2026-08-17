import fs from 'node:fs';

export interface ReadResult {
  lines: string[];
  newSize: number;
}

/**
 * Reads only the bytes appended to `filePath` since `previousSize`, so a
 * refresh over a multi-thousand-line transcript costs the size of the new
 * turn, not the whole file. A trailing line without a final newline is left
 * unread — `newSize` stops before it — so it's picked up whole next time
 * instead of being parsed twice, half each time.
 */
export function readNewLines(filePath: string, previousSize: number): ReadResult {
  const { size: currentSize } = fs.statSync(filePath);
  const startOffset = currentSize < previousSize ? 0 : previousSize; // rotated/truncated: reread from start

  const length = currentSize - startOffset;
  if (length <= 0) return { lines: [], newSize: startOffset };

  const fd = fs.openSync(filePath, 'r');
  let text: string;
  try {
    const buf = Buffer.alloc(length);
    fs.readSync(fd, buf, 0, length, startOffset);
    text = buf.toString('utf8');
  } finally {
    fs.closeSync(fd);
  }

  const lastNewline = text.lastIndexOf('\n');
  if (lastNewline === -1) return { lines: [], newSize: startOffset };

  const complete = text.slice(0, lastNewline);
  const lines = complete.split('\n').filter((l) => l.length > 0);
  return { lines, newSize: startOffset + lastNewline + 1 };
}
