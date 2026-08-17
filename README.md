# AgentSwitch

Switch accounts for **Codex** and **Claude Code** — extension and CLI, both at once —
and track usage, cost, and rate-limit windows per account. One extension, replacing
separate Codex-only and Claude-only switchers.

> **Status: early development.** Vault layer (the part that reads/writes credential
> files) is built and tested. Switching UI, usage tracking, and the dashboard are not
> implemented yet — see the design doc below.

## Why one extension

Both tools' VS Code extensions and CLIs read the *same* credential file, so switching one
file switches both surfaces:

- Codex → `~/.codex/auth.json`
- Claude Code → `~/.claude/.credentials.json`

Claude Code's credentials file also holds `mcpOAuth` (logins for MCP servers, e.g. Power
BI) alongside the account token. Those belong to you and to the server, not to whichever
account is billing — so a switch **never touches `mcpOAuth`**; only `claudeAiOauth` and
`organizationUuid` change.

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
