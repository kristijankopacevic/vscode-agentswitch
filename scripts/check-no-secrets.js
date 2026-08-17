#!/usr/bin/env node
// Pre-publish guard: fail the build if anything token-shaped is about to be
// committed or packaged. Run from repo root: `node scripts/check-no-secrets.js`.
//
// This is a coarse safety net, not a secrets scanner replacement — it exists
// because this extension handles live OAuth tokens for two vendors, and a
// leaked token in git history is effectively permanent.
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'out']);

// Patterns that flag as "token-shaped": JWTs, long opaque bearer-style secrets,
// and the specific field names our vaults read/write, when followed by a
// plausible real value rather than an empty string or short placeholder.
const PATTERNS = [
  { name: 'JWT-like token', re: /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/ },
  { name: 'sk-/rt-/at- style secret', re: /\b(sk|rt|at)-[A-Za-z0-9]{20,}\b/ },
  { name: 'long base64/opaque secret assigned to a token field', re: /"(access_token|refresh_token|id_token|accessToken|refreshToken|OPENAI_API_KEY)"\s*:\s*"[A-Za-z0-9._-]{40,}"/ },
];

const ALLOWLIST_MARKER = 'agentswitch-test-fixture-synthetic';

let violations = [];

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(p);
    } else {
      scanFile(p);
    }
  }
}

function scanFile(p) {
  let text;
  try {
    text = fs.readFileSync(p, 'utf8');
  } catch {
    return; // binary or unreadable; not our concern here
  }
  if (text.includes(ALLOWLIST_MARKER)) return; // explicitly-marked synthetic fixture
  for (const { name, re } of PATTERNS) {
    if (re.test(text)) {
      violations.push({ file: path.relative(ROOT, p), pattern: name });
    }
  }
}

walk(ROOT);

if (violations.length) {
  console.error('check-no-secrets: found token-shaped content:');
  for (const v of violations) console.error(`  ${v.file}  (${v.pattern})`);
  console.error('\nIf this is a synthetic test fixture, add the literal marker string');
  console.error(`"${ALLOWLIST_MARKER}" to the file (e.g. in a JSON "_note" field).`);
  process.exit(1);
}

console.log('check-no-secrets: clean');
