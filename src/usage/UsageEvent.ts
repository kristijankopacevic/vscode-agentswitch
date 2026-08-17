export interface UsageEvent {
  ts: string;
  toolId: 'codex' | 'claude';
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadInputTokens: number;
  cacheCreationInputTokens: number;
  project?: string;
}
