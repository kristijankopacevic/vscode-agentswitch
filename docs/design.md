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
  lines of type `token_count` carrying `info.total_token_usage` **and** up to two real
  windows, `rate_limits.{primary, secondary}.{used_percent, window_minutes,
  resets_at}` — Codex's rate-limit windows are exact, no estimate needed.
  `describeWindow()` (`src/usage/windowLabel.ts`) labels each by its own
  `windowMinutes` (≤6h → "5h", ≥6d → "7d") rather than assuming position, since which
  slot carries which duration isn't guaranteed across plans. `UsageStore` keeps the
  last known value for each side independently — a refresh where only `primary`
  reports doesn't erase an already-known `secondary`. Codex writes no cost figures —
  tokens only, no cost. A pricing table with a refresh command is deferred to a
  follow-up; the dashboard says so explicitly rather than showing a silently-missing
  number.

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
- No network egress at all in v0.1 (the pinned Codex pricing refresh described above
  is part of the deferred pricing table, not yet built).
- `.gitignore` excludes anything credential-shaped; `scripts/check-no-secrets.js` runs in
  CI and fails the build if a token-shaped string is about to be committed.

## Dashboard

Views, backed entirely by the logic layer above: overview stat tiles, both of Codex's
exact rate-limit windows next to Claude's estimate (visibly labelled as such), an
**accounts table listing every saved profile** — not just ones with recorded usage —
each with a **Switch** button, an active badge, or a "needs sign-in" badge, a table
per project, and **switch history** — the raw switch log, not a token trend chart. An
earlier draft of this dashboard added an unplanned daily trend line and dropped switch
history; that was caught and reverted before release.

The dashboard's Switch buttons and the status bar's quick pick both call
`src/ui/switchActions.ts`'s `performSwitch()` — one tested function that decides
switched / already-active / needs-reauth / not-found, so the two surfaces can never
disagree about what a switch does. `render.ts` stays pure (no `vscode` import): it
emits `<button data-action="switch" data-tool-id="…" data-profile-id="…">`, and an
inlined, nonce-scoped script posts a `{type:'switchAccount', toolId, profileId}`
message back to the extension host, handled in `panel.ts` via
`webview.onDidReceiveMessage`.

## Verification limits

Everything in `src/vaults`, `src/profiles`, `src/attribution`, `src/switch`,
`src/usage`, `src/ui/switchActions.ts`, `src/ui/accountRows.ts`,
`src/ui/formatUsage.ts`, and `src/ui/dashboard/render.ts` is unit-tested (116 tests)
without a `vscode` import, run against synthetic fixtures. `src/appContext.ts`,
`src/ui/statusBar.ts`, `src/ui/switchQuickPick.ts`, `src/ui/dashboard/panel.ts`, and
`src/extension.ts` depend on the real `vscode` module and can only run inside a live
VS Code window — they are type-checked against `@types/vscode` and packaged into a
real `.vsix`, but "the status bar shows the right account" and "the dashboard's
Switch button switches correctly" are claims for a human to verify by installing it,
not claims an automated build can make.

## Known limitations

- **Attribution starts at install.** Historical usage recorded before AgentSwitch was
  installed has no associated account and is shown as an unattributed total.
- **Claude's rate-limit window is an estimate**; Codex's is exact (see above).
- **Windows-first.** On macOS, Claude Code stores credentials in the Keychain rather
  than a file, which `ClaudeVault` does not yet support.
- **Migrating from `vscode-codex-switcher`** imports account identities (name, email,
  plan) but not tokens — VS Code SecretStorage is namespaced per extension and cannot be
  read across extensions, so each imported account needs one re-authentication.
