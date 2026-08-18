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

The dashboard's Switch/Sign-in/Remove/Add/Log-in buttons and the status bar's quick
pick all call the same handful of tested functions —
`src/ui/switchActions.ts#performSwitch()`, `src/ui/accountActions.ts#attachLiveToProfile()`
and `#removeProfile()` — so the two surfaces can never disagree about what an action
does. `render.ts` stays pure (no `vscode` import): every button carries
`data-action`/`data-tool-id`/`data-profile-id`, and one nonce-scoped inline script
posts `{action, toolId, profileId}` back to the extension host, handled in `panel.ts`
via `webview.onDidReceiveMessage`. An earlier draft of this dashboard added an
unplanned daily trend line and dropped switch history; that was caught and reverted
before release.

## Login, logout, and the two-account journey

Nothing in the extension performs an OAuth login itself — that's not something a VS
Code extension can safely do on another tool's behalf, and each tool already owns a
real login flow. Instead, `src/ui/authLauncher.ts#launchAuthCommand()` opens a visible
integrated terminal and runs the *actual* command:

- Claude: `claude auth login` / `logout` / `status --json` — on PATH already.
- Codex: **not on PATH.** The CLI ships bundled inside the installed "ChatGPT"
  (`openai.chatgpt`) VS Code extension, at
  `<extension folder>/bin/windows-x86_64/codex.exe`. `src/tools/codexBinary.ts#resolveCodexBinary()`
  scans the extensions directory (derived from this extension's own
  `context.extensionUri`, not a hardcoded `~/.vscode/extensions` guess) for
  `openai.chatgpt-<version>-win32-x64` folders and picks the newest one whose binary
  actually exists — VS Code can leave old versions on disk (it did for AgentSwitch
  itself; see the v0.3 note below), so "highest version number" alone isn't enough.

Login success can't be detected synchronously — the terminal flow is interactive and
async — so `showLoginFlow()` *offers* to save the result once the terminal command is
launched, rather than polling for completion. `claude auth status --json` /
`codex login status` exist and could make this automatic in a follow-up.

**`showAddAnotherAccountFlow()`** is the guided path from one account to two: save the
current one if it isn't tracked yet (skipping straight to logout if it already is),
launch logout, launch login, offer to save the new one. Every step is a confirmable
prompt, not a silent chain — a `Cancel` at any point stops it without launching the
next step.

**Why imported profiles used to be permanent dead ends:** `ProfileStore.setSnapshot()`
existed from the start, but its only caller was `SwitchOrchestrator.switchTo()` (which
saves the *outgoing* account mid-switch) — nothing could ever fill in a profile that
had none to begin with. `attachLiveToProfile()` is the fix: it's the one path that
calls `setSnapshot()` directly, so a needs-sign-in import (or a manually created
placeholder) can become a real, usable account. "Add current account…" now checks for
needs-sign-in profiles first and offers to attach instead of always creating a
duplicate.

**Every command is wrapped in `withErrorReporting()`** (`src/extension.ts`), which
turns a thrown exception into a visible `showErrorMessage` instead of the command
silently doing nothing. That closes the exact hole `captureLive()` had: it threw on a
missing/empty/invalid credential file with no `try`/`catch` anywhere above it. UI code
now calls `captureLiveSafe()` (returns `null` instead of throwing) wherever "not
signed in yet" is a value the flow needs to check.

## Verification limits

Everything in `src/vaults`, `src/profiles`, `src/attribution`, `src/switch`,
`src/usage`, `src/tools`, `src/ui/switchActions.ts`, `src/ui/accountActions.ts`,
`src/ui/accountRows.ts`, `src/ui/formatUsage.ts`, `src/ui/errorReporting.ts`, and
`src/ui/dashboard/render.ts` is unit-tested (155 tests) without a `vscode` import, run
against synthetic fixtures. `src/appContext.ts`, `src/ui/statusBar.ts`,
`src/ui/switchQuickPick.ts`, `src/ui/authLauncher.ts`, `src/ui/authFlows.ts`,
`src/ui/dashboard/panel.ts`, and `src/extension.ts` depend on the real `vscode`
module — including terminal creation, which has no meaningful test double — and can
only run inside a live VS Code window. They're type-checked against `@types/vscode`
and packaged into a real `.vsix`, but "the login terminal launches the right command"
and "the dashboard's Remove button asks before deleting" are claims for a human to
verify by installing it, not claims an automated build can make.

## Known limitations

- **Attribution starts at install.** Historical usage recorded before AgentSwitch was
  installed has no associated account and is shown as an unattributed total.
- **Claude's rate-limit window is an estimate**; Codex's is exact (see above).
- **Windows-first.** On macOS, Claude Code stores credentials in the Keychain rather
  than a file, which `ClaudeVault` does not yet support; the Codex binary resolution
  is also Windows-path-shaped (`win32-x64`, `windows-x86_64`).
- **Migrating from `vscode-codex-switcher`** imports account identities (name, email,
  plan) but not tokens — VS Code SecretStorage is namespaced per extension and cannot be
  read across extensions, so each imported account needs one re-authentication —
  which `attachLiveToProfile()` now makes possible via the UI (it wasn't, through v0.3).
- **Login success isn't detected automatically.** The extension offers to save an
  account after launching login; it doesn't know when you've actually finished.
- **No credential deduplication.** Nothing stops two profiles holding the same
  underlying account under different labels — no account identity is extracted from a
  snapshot for comparison.
- **The Codex binary path is a coupling to another extension's internal layout**, not
  a public API. If the ChatGPT extension restructures its folder layout,
  `resolveCodexBinary()` returns `null` and the UI says so, rather than failing
  obscurely — but it is a real coupling worth knowing about.
