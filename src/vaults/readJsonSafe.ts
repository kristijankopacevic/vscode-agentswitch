import fs from 'node:fs';

/**
 * Reads and parses a JSON object file, returning null instead of throwing
 * when the file is missing, empty, invalid JSON, or valid JSON that isn't
 * an object. Used by captureLiveSafe() so "not signed in yet" is a value
 * the caller can check, not an exception it has to remember to catch.
 */
export function readJsonSafe(filePath: string): Record<string, unknown> | null {
  let raw: string;
  try {
    raw = fs.readFileSync(filePath, 'utf8');
  } catch {
    return null;
  }
  if (raw.trim().length === 0) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
  return parsed as Record<string, unknown>;
}
