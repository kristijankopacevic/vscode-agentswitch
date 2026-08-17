import * as vscode from 'vscode';

// Entry point. Command bodies are placeholders until Phase 3 (switch
// orchestration) and Phase 6 (dashboard) land — this only wires activation
// so the extension loads and `npm run package` produces a real .vsix.
export function activate(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('agentswitch.switchAccount', () => {
      void vscode.window.showInformationMessage('AgentSwitch: account switching is not implemented yet.');
    }),
    vscode.commands.registerCommand('agentswitch.showUsage', () => {
      void vscode.window.showInformationMessage('AgentSwitch: the usage dashboard is not implemented yet.');
    }),
  );
}

export function deactivate(): void {
  // Nothing to tear down yet.
}
