# Design

## Problem

Codex and Claude Code each support multiple accounts. Before this project, switching
required three separate extensions (a Codex switcher, a Claude switcher, and a Claude
usage monitor), each with its own profile model and status bar item, and none of them
answered "which account burned this week's quota."

## What's available locally

Both tools' extension and CLI read the same on-disk credential file, so switching one
file switches both surfaces — no need to script the CLI separately:

- Codex: `~/.codex/auth.json` — `auth_mode`, `OPENAI_API_KEY`, `tokens.{id_token,
  access_token, refresh_token, account_id}`, `last_refresh`.
- Claude Code: `~/.claude/.credentials.json` — `claudeAiOauth.{accessToken,
  refreshToken, expiresAt, refreshTokenExpiresAt, scopes, subscriptionType,
  rateLimitTier}`, `organizationUuid`, and separately `mcpOAuth` (MCP server logins,
  unrelated to which account is billing).

Usage and rate-limit data are both fully local:

- Claude: per-message truth in `~/.claude/projects/<project>/*.jsonl`
  (`message.usage.{input_tokens, cache_creation_input_tokens, cache_read_input_tokens,
  output_tokens}`), and pre-computed cost in `~/.claude/stats-cache.json`
  (`modelUsage.<model>.costUSD`) — we read that rather than maintaining a pricing table.
  There is **no continuous rate-limit feed** locally, so Claude's rate-limit window is an
  *estimate* derived from summed transcript usage, and is labelled as such everywhere it
  appears.
- Codex: per-session truth in `~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl`, `event_msg`
  lines of type `token_count` carrying `info.total_token_usage` **and** a real
  `rate_limits.primary.{used_percent, window_minutes, resets_at}` — Codex's rate-limit
  window is exact, no estimate needed. Codex writes no cost figures, so a small
  model→price table is maintained separately with a refresh command.

## Architecture

One vault per tool (`src/vaults/`), each answering the same three questions — what's
live, capture it, make something else live — so nothing above the vault layer (profile
storage, the switch command, the status bar, the dashboard) learns a tool-specific
detail. Adding a third tool later is one new file.

`ClaudeVault.applyLive()` is a **merge**, not a whole-file replace: it writes only
`claudeAiOauth` and `organizationUuid`, copying every other top-level key — known or not
— from the live file unchanged. `CodexVault.applyLive()` replaces the whole file; Codex
has no equivalent shared section.

Every write goes through `atomicWrite()`: write to a sibling temp file, fsync, rename
over the target. Rename is atomic on the same filesystem, so a crash mid-switch can never
leave a truncated credentials file — the target is either the old content or the new
content, never a mix.

## Security

- Tokens live only in VS Code SecretStorage (OS-encrypted) — never in a plaintext
  profile file.
- Every log line and error message is redacted before it can reach an output channel.
- No network egress except an optional, pinned Codex pricing refresh.
- `.gitignore` excludes anything credential-shaped; `scripts/check-no-secrets.js` runs in
  CI and fails the build if a token-shaped string is about to be committed.

## Known limitations

- **Attribution starts at install.** Historical usage recorded before AgentSwitch was
  installed has no associated account and is shown as an unattributed total.
- **Claude's rate-limit window is an estimate**; Codex's is exact (see above).
- **Windows-first.** On macOS, Claude Code stores credentials in the Keychain rather
  than a file, which `ClaudeVault` does not yet support.
- **Migrating from `vscode-codex-switcher`** imports account identities (name, email,
  plan) but not tokens — VS Code SecretStorage is namespaced per extension and cannot be
  read across extensions, so each imported account needs one re-authentication.
