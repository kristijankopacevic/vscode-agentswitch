/**
 * No `vscode` import here on purpose — this stays a plain function so it's
 * unit-testable directly. The vscode-dependent half (actually showing the
 * error, via `withErrorReporting()`) lives in extension.ts, the one place
 * that already needs a live vscode module.
 */
export function describeError(err: unknown): string {
  if (err instanceof Error && err.message) return err.message;
  return String(err);
}
