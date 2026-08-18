# AgentSwitch

Switch accounts for **Codex** and **Claude Code** — extension and CLI, both at once —
and track usage, cost, and rate-limit windows per account. One extension, replacing
separate Codex-only and Claude-only switchers.

> **Status: v0.4.** Login, logout, adding, and removing accounts are all built now —
> the extension was silently never registering with VS Code through v0.3, which is
> why those looked broken; see the v0.3 → v0.4 notes below for what was actually a bug
> versus what was genuinely missing. The logic layer (155 tests) is unit-tested; the VS
> Code UI itself (status bar, quick pick, webview, terminal launching) is type-checked
> and packaged but has not been interactively clicked through — install the `.vsix`
> and try it. Known gaps: Codex cost isn't shown (tokens only — no pricing table yet),
> credential storage is Windows-only for now (Claude Code uses the macOS Keychain
> there, not a file), and login success can't be detected automatically — the
> extension offers to save an account after launching login rather than knowing when
> you've actually finished.
>
> **v0.3 → v0.4:** four real defects, found from a report of "can't log in, add, or
> delete accounts":
> 1. `captureLive()` threw uncaught on a missing/empty/invalid credential file, so "Add
>    current account" silently did nothing if you weren't signed in yet. Fixed with
>    `captureLiveSafe()`, used everywhere a command reads the live file, plus every
>    command is now wrapped so a thrown error becomes a visible message instead of
>    vanishing.
> 2. Profiles imported from `codex-switcher` had no saved credentials and **no path
>    ever existed to fill them in** — "Add current account" always created a
>    duplicate. Fixed: it now offers to attach to a needs-sign-in profile first.
> 3. **There was no login or logout anywhere in the extension.** Three new commands —
>    `AgentSwitch: Log In`, `Log Out`, `Add Another Account` — launch the real
>    `claude auth login/logout` or `codex login/logout` in a visible terminal (Codex's
>    CLI isn't on PATH; it's resolved from inside the installed ChatGPT extension).
> 4. Removing a profile left a dangling "active" pointer at a deleted id, and had no
>    confirmation. Both fixed — removal now clears that pointer and asks first.
>
> Separately: three old version folders sat on disk without ever being registered in
> VS Code's extension manifest, so **no status bar items and no commands existed at
> all** for a while — that's most of why things looked unreachable rather than broken.
> Reload the window after installing to make sure a fresh version actually loads.
>
> **v0.2 → v0.3:** the status bar now shows both of Codex's rate-limit windows (5h
> and weekly, as exact "% left") and both of Claude's (5h and 7d, as estimated token
> counts — Claude has no exact feed, so it's tokens, never a fabricated percentage).
> The usage dashboard is now interactive: it lists every saved account, not just ones
> with recorded usage, and each gets a **Switch** button that switches directly from
> the panel via the same code path the status bar's picker uses.
>
> **v0.1 → v0.2:** `activationEvents` was empty in v0.1, so the extension never
> activated on its own and the status bar items never appeared. Fixed with
> `onStartupFinished`. Also added a third status bar item and an all-accounts view
> across both tools, and active-account markers in every picker.

## Why one extension

Both tools' VS Code extensions and CLIs read the *same* credential file, so switching one
file switches both surfaces:

- Codex → `~/.codex/auth.json`
- Claude Code → `~/.claude/.credentials.json`

Claude Code's credentials file also holds `mcpOAuth` (logins for MCP servers, e.g. Power
BI) alongside the account token. Those belong to you and to the server, not to whichever
account is billing — so a switch **never touches `mcpOAuth`**; only `claudeAiOauth` and
`organizationUuid` change.

## Using it

1. Install the `.vsix` (Extensions view → `...` → Install from VSIX), or build one
   yourself with `npm run package`.
2. If you have `dondakeltd.vscode-codex-switcher` installed, its Codex account
   identities are imported automatically on first activation — each needs one
   sign-in before it can be switched to, since tokens can't be read across
   extensions' SecretStorage.
3. Three status bar items appear on the bottom-right (bottom-left in some themes):
   **Codex: `<account>` · 5h _N_% left · 7d _N_% left**, **Claude: `<account>` · 5h
   ~_N_k tok · 7d ~_N_k tok**, and **All Accounts** — click any of them.
   - Codex's windows are exact percentages, straight from Codex's own rate-limit data.
     Claude's are token counts, not percentages — Claude has no exact rate-limit feed
     on disk, so there's no known cap to be a percentage *of*; showing a fake one would
     be worse than showing the honest number.
   - Clicking Codex or Claude opens that tool's picker: switch, add the currently
     signed-in account, or remove one. The active account is marked **● Active**, and
     hovering either item shows every saved account for that tool plus the full
     rate-limit breakdown.
   - Clicking **All Accounts** (or running **AgentSwitch: Show All Accounts**) lists
     every saved account for *both* tools together, active ones marked — pick one to
     switch straight to it.
4. **Never signed in yet, or want a second account?**
   - **AgentSwitch: Log In** — pick a tool, and it opens a terminal running the real
     login (`claude auth login` or `codex login`) so you can complete the actual
     sign-in. Afterward it offers to save the result as a profile.
   - **AgentSwitch: Add Another Account** — the guided path for going from one account
     to two: saves the current one if it isn't saved yet, logs out, logs back in as
     someone else, then offers to save that too. Each step can be cancelled.
   - **AgentSwitch: Log Out** — warns first if the live account isn't saved to any
     profile, since logging out then would lose access to it.
   - **"Add current account…"** (in the Switch Account picker, or the dashboard) now
     checks for a needs-sign-in profile first and offers to attach to it — so
     accounts imported from `codex-switcher` (or any other needs-sign-in profile) can
     actually become usable, instead of always creating a duplicate.
5. **AgentSwitch: Show Usage Dashboard** — an interactive panel: overview totals,
   both tools' rate-limit windows, and every saved account with **Switch** (or a
   **Sign in** button for a needs-sign-in profile) and **Remove** next to it — plus
   an **Add current account** / **Log in…** pair per tool at the top, per-project
   breakdown, and switch history. Every action here calls the exact same code the
   status bar picker uses. Removing asks for confirmation first.
6. After switching, reload the window and restart any running CLI session for that
   tool — both Codex and Claude Code cache credentials in memory and can overwrite a
   fresh switch if left running.

If you're replacing `vscode-codex-switcher`, `claudeswap`, or `claude-code-usage`,
uninstall them first — two extensions writing the same credential file will fight
each other, and that failure looks like random logouts.

## Design

The full design, including what data is available locally for usage/rate-limit tracking
and what's intentionally out of scope, is in
[`docs/design.md`](docs/design.md).

## Development

```
npm install
npm test          # vitest
npm run typecheck  # tsc --noEmit
npm run lint       # eslint
npm run build      # esbuild bundle
npm run package    # full check + vsce package
```

## Security

Tokens live only in VS Code's SecretStorage (OS-encrypted) — never in a plaintext
profile file. `scripts/check-no-secrets.js` runs in CI on every push and fails the
build if anything token-shaped is about to be committed.

## License

MIT — see [LICENSE](LICENSE).
