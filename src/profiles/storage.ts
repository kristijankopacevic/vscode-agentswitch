/**
 * Matches vscode.Thenable so these interfaces are structurally satisfied by
 * the real vscode.Memento / vscode.SecretStorage at activation time, with no
 * adapter and no import of the `vscode` module from this file — which is
 * what lets ProfileStore be unit-tested with plain in-memory fakes.
 */
export type Thenable<T> = PromiseLike<T>;

/** Matches the shape of vscode.Memento (e.g. context.globalState). */
export interface StateStore {
  get<T>(key: string): T | undefined;
  update(key: string, value: unknown): Thenable<void>;
}

/** Matches the shape of vscode.SecretStorage (e.g. context.secrets). */
export interface SecretStore {
  get(key: string): Thenable<string | undefined>;
  store(key: string, value: string): Thenable<void>;
  delete(key: string): Thenable<void>;
}
