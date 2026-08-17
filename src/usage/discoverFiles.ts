import fs from 'node:fs';
import * as path from 'node:path';

export interface ClaudeTranscriptFile {
  path: string;
  project: string;
}

/** `~/.claude/projects/<project>/*.jsonl` — project name comes from the directory. */
export function listClaudeTranscriptFiles(projectsDir: string): ClaudeTranscriptFile[] {
  if (!fs.existsSync(projectsDir)) return [];
  const files: ClaudeTranscriptFile[] = [];
  for (const project of fs.readdirSync(projectsDir, { withFileTypes: true })) {
    if (!project.isDirectory()) continue;
    const projectDir = path.join(projectsDir, project.name);
    for (const entry of fs.readdirSync(projectDir)) {
      if (entry.endsWith('.jsonl')) {
        files.push({ path: path.join(projectDir, entry), project: project.name });
      }
    }
  }
  return files;
}

/** `~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl` */
export function listCodexRolloutFiles(sessionsDir: string): string[] {
  if (!fs.existsSync(sessionsDir)) return [];
  const files: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith('.jsonl')) files.push(full);
    }
  };
  walk(sessionsDir);
  return files;
}
