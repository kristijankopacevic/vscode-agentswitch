import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { listClaudeTranscriptFiles, listCodexRolloutFiles } from '../../src/usage/discoverFiles';

describe('listClaudeTranscriptFiles', () => {
  let dir: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agentswitch-test-'));
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('returns each .jsonl file with the project name taken from its parent directory', () => {
    fs.mkdirSync(path.join(dir, 'project-a'));
    fs.writeFileSync(path.join(dir, 'project-a', 'session1.jsonl'), '');
    fs.mkdirSync(path.join(dir, 'project-b'));
    fs.writeFileSync(path.join(dir, 'project-b', 'session2.jsonl'), '');

    const files = listClaudeTranscriptFiles(dir);

    expect(files.sort((a, b) => a.project.localeCompare(b.project))).toEqual([
      { path: path.join(dir, 'project-a', 'session1.jsonl'), project: 'project-a' },
      { path: path.join(dir, 'project-b', 'session2.jsonl'), project: 'project-b' },
    ]);
  });

  it('ignores non-.jsonl files', () => {
    fs.mkdirSync(path.join(dir, 'project-a'));
    fs.writeFileSync(path.join(dir, 'project-a', 'notes.txt'), '');

    expect(listClaudeTranscriptFiles(dir)).toEqual([]);
  });

  it('returns an empty array if the projects directory does not exist', () => {
    expect(listClaudeTranscriptFiles(path.join(dir, 'missing'))).toEqual([]);
  });
});

describe('listCodexRolloutFiles', () => {
  let dir: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agentswitch-test-'));
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('recursively finds .jsonl files under YYYY/MM/DD directories', () => {
    const day = path.join(dir, '2026', '08', '11');
    fs.mkdirSync(day, { recursive: true });
    fs.writeFileSync(path.join(day, 'rollout-a.jsonl'), '');

    expect(listCodexRolloutFiles(dir)).toEqual([path.join(day, 'rollout-a.jsonl')]);
  });

  it('returns an empty array if the sessions directory does not exist', () => {
    expect(listCodexRolloutFiles(path.join(dir, 'missing'))).toEqual([]);
  });
});
