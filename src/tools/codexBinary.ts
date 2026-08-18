import fs from 'node:fs';
import * as path from 'node:path';

export interface ResolvedCodexBinary {
  path: string;
  version: string;
}

const FOLDER_PATTERN = /^openai\.chatgpt-(.+)-win32-x64$/;

function compareVersions(a: string, b: string): number {
  const partsA = a.split('.').map(Number);
  const partsB = b.split('.').map(Number);
  const len = Math.max(partsA.length, partsB.length);
  for (let i = 0; i < len; i++) {
    const diff = (partsA[i] ?? 0) - (partsB[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

/**
 * The Codex CLI isn't on PATH — it ships bundled inside the ChatGPT VS
 * Code extension, at a path that's an assumption about another
 * extension's internal layout (see the Windows-first limitation in
 * docs/design.md), not a public API. Multiple versions can coexist on
 * disk (VS Code doesn't always clean up an old one), so this picks the
 * newest version whose binary actually exists, skipping any that don't.
 */
export function resolveCodexBinary(extensionsDir: string): ResolvedCodexBinary | null {
  let entries: string[];
  try {
    entries = fs.readdirSync(extensionsDir);
  } catch {
    return null;
  }

  const versions = entries
    .map((name) => FOLDER_PATTERN.exec(name)?.[1])
    .filter((v): v is string => v !== undefined)
    .sort(compareVersions)
    .reverse();

  for (const version of versions) {
    const binaryPath = path.join(extensionsDir, `openai.chatgpt-${version}-win32-x64`, 'bin', 'windows-x86_64', 'codex.exe');
    if (fs.existsSync(binaryPath)) return { path: binaryPath, version };
  }
  return null;
}
