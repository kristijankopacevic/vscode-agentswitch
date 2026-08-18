import fs from 'node:fs';
import * as path from 'node:path';

export interface ResolvedCodexBinary {
  path: string;
  version: string;
}

interface PlatformLayout {
  /** The VS Code targetPlatform suffix on the extension's own folder name, e.g. "openai.chatgpt-<version>-win32-x64". */
  folderSuffix: string;
  /** Candidate names for the bin/<name>/ subfolder holding the binary — tried in order, first match wins. */
  binSubfolders: string[];
  binaryName: string;
}

/**
 * Windows is confirmed (`bin/windows-x86_64/codex.exe`, verified on this
 * project's own machine). Linux's bin subfolder name is a best guess based
 * on the Windows naming convention and has not been verified against a real
 * install — if it's wrong, resolution safely returns null (see below)
 * rather than guessing further, and the two candidates here are the most
 * likely names to cover it. macOS is not attempted at all: unlike the
 * bin-folder-name guess, there is no reasonable fallback if it's wrong, and
 * ClaudeVault doesn't support the Keychain there yet anyway (see
 * docs/design.md's platform limitations) — so a wrong guess there would
 * fail for a second, unrelated reason and be more confusing to debug.
 */
function layoutForPlatform(platform: NodeJS.Platform): PlatformLayout | null {
  if (platform === 'win32') {
    return { folderSuffix: 'win32-x64', binSubfolders: ['windows-x86_64'], binaryName: 'codex.exe' };
  }
  if (platform === 'linux') {
    return { folderSuffix: 'linux-x64', binSubfolders: ['linux-x86_64', 'linux-x64'], binaryName: 'codex' };
  }
  return null;
}

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
 * extension's internal layout (see docs/design.md), not a public API.
 * Multiple versions can coexist on disk (VS Code doesn't always clean up
 * an old one), so this picks the newest version whose binary actually
 * exists, skipping any that don't. `platform` defaults to the real OS but
 * is a parameter so both platforms' behavior can be tested from any host.
 */
export function resolveCodexBinary(extensionsDir: string, platform: NodeJS.Platform = process.platform): ResolvedCodexBinary | null {
  const layout = layoutForPlatform(platform);
  if (!layout) return null;

  let entries: string[];
  try {
    entries = fs.readdirSync(extensionsDir);
  } catch {
    return null;
  }

  const folderPattern = new RegExp(`^openai\\.chatgpt-(.+)-${layout.folderSuffix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`);
  const versions = entries
    .map((name) => folderPattern.exec(name)?.[1])
    .filter((v): v is string => v !== undefined)
    .sort(compareVersions)
    .reverse();

  for (const version of versions) {
    for (const binSubfolder of layout.binSubfolders) {
      const binaryPath = path.join(extensionsDir, `openai.chatgpt-${version}-${layout.folderSuffix}`, 'bin', binSubfolder, layout.binaryName);
      if (fs.existsSync(binaryPath)) return { path: binaryPath, version };
    }
  }
  return null;
}
