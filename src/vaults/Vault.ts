/**
 * A vault owns one tool's live credential file. It answers exactly two
 * questions — what's live right now, and make this live instead — so
 * everything above it (profile storage, the switch command, the status
 * bar) never learns a tool-specific detail. Snapshots are opaque JSON
 * objects: a vault must never drop fields it doesn't recognize, since the
 * underlying tool's schema can add fields we haven't seen yet.
 */
export interface Vault {
  readonly toolId: string;

  /** Reads and parses the live credential file. Throws if missing or unreadable. */
  captureLive(): Record<string, unknown>;

  /**
   * Same as captureLive(), but returns null instead of throwing when the
   * tool has never been signed into (file missing, empty, or invalid) —
   * "not signed in yet" is a value a caller can check, not an exception
   * it has to remember to catch.
   */
  captureLiveSafe(): Record<string, unknown> | null;

  /**
   * Applies `snapshot` onto the live credential file. Merge vs. whole-file
   * replace is a vault-specific decision (see ClaudeVault, which merges to
   * preserve unrelated state like MCP server logins).
   */
  applyLive(snapshot: Record<string, unknown>): void;
}
