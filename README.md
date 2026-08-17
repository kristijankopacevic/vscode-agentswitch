# AgentSwitch

Switch accounts for **Codex** and **Claude Code** — extension and CLI, both at once —
and track usage, cost, and rate-limit windows per account. One extension, replacing
separate Codex-only and Claude-only switchers.

> **Status: v0.1.** Switching, usage tracking (per-account, per-project, rate limits),
> and the dashboard are built. The logic layer (83 tests) is unit-tested; the VS Code
> UI itself (status bar, quick pick, webview) is type-checked and packaged but has not
> been interactively clicked through — install the `.vsix` and try it. Known gaps:
> Codex cost isn't shown (tokens only — no pricing table yet), and credential storage
> is Windows-only for now (Claude Code uses the macOS Keychain there, not a file).

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
3. **AgentSwitch: Switch Account** — pick Codex or Claude Code, then switch, add the
   currently signed-in account, or remove one.
4. **AgentSwitch: Show Usage Dashboard** — totals, rate-limit windows, per-account and
   per-project breakdowns, and switch history.
5. After switching, reload the window and restart any running CLI session for that
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
