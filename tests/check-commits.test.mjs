// SPDX-License-Identifier: MIT OR Apache-2.0

// Regression for HEAD-only mode: an auto-generated merge subject must be skipped,
// exactly as CI already skips merges when it passes an explicit range.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT = join(dirname(dirname(fileURLToPath(import.meta.url))), 'scripts', 'check-commits.mjs');

function run(repo, args = []) {
  try {
    return {
      code: 0,
      output: execFileSync(process.execPath, [SCRIPT, ...args], {
        cwd: repo,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe']
      })
    };
  } catch (error) {
    return { code: error.status, output: `${error.stdout ?? ''}${error.stderr ?? ''}` };
  }
}

test('commit-subject gate skips generated merge subjects in HEAD-only mode', (t) => {
  const repo = mkdtempSync(join(process.env.TMPDIR || tmpdir(), 'ui-commits-'));
  t.after(() => rmSync(repo, { recursive: true, force: true }));
  const git = (...args) => execFileSync('git', args, { cwd: repo, stdio: 'ignore' });

  git('init', '-q', '-b', 'main');
  git('config', 'user.email', 'test@example.invalid');
  git('config', 'user.name', 'Test');
  git('config', 'commit.gpgsign', 'false');

  git('commit', '--allow-empty', '-m', 'chore: base');
  assert.equal(run(repo).code, 0, 'a conventional HEAD passes');

  git('commit', '--allow-empty', '-m', 'not a conventional subject');
  const bad = run(repo);
  assert.equal(bad.code, 1, 'a bad HEAD subject still fails');
  assert.match(bad.output, /missing conventional/);

  git('checkout', '-q', '-b', 'feature');
  git('commit', '--allow-empty', '-m', 'fix: branch work');
  git('checkout', '-q', 'main');
  git('merge', '--no-ff', '-m', 'Merge pull request #1 from test/feature', 'feature');

  const merged = run(repo);
  assert.equal(merged.code, 0, 'a generated merge subject is skipped');
  assert.match(merged.output, /commit subjects: 0\/0/, 'nothing authored is checked at a merge HEAD');
});
