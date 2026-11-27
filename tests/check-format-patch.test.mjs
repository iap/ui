// SPDX-License-Identifier: MIT OR Apache-2.0

// The patch validator runs on hostile input from a fork PR. Prove both directions:
// formatted source patches pass; workflows, lockfiles, binaries and traversal fail.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT = join(dirname(dirname(fileURLToPath(import.meta.url))), 'scripts', 'check-format-patch.mjs');

function run(root, patch) {
  const file = join(root, 'format.patch');
  writeFileSync(file, patch);
  try {
    execFileSync(process.execPath, [SCRIPT, file], { encoding: 'utf8', stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

const diff = (path) => `diff --git a/${path} b/${path}\n--- a/${path}\n+++ b/${path}\n@@ -1 +1 @@\n-old\n+new\n`;

test('format patch gate', (t) => {
  const root = mkdtempSync(join(process.env.TMPDIR || tmpdir(), 'ui-patch-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));

  assert.equal(run(root, diff('packages/ui/src/components/Button.tsx')), true, 'formatted source passes');
  assert.equal(run(root, diff('README.md')), true, 'root markdown passes');
  assert.equal(run(root, diff('.github/workflows/ci.yml')), false, 'workflows are denied');
  assert.equal(run(root, diff('package-lock.json')), false, 'lockfiles are denied');
  assert.equal(run(root, diff('verification/browser-suite-report.json')), false, 'generated output is denied');
  assert.equal(run(root, diff('../secrets.txt')), false, 'traversal is denied');
  assert.equal(run(root, 'GIT binary patch\nliteral 4\nabcd\n'), false, 'binary patches are denied');
  assert.equal(run(root, 'not a patch\n'), false, 'an empty patch is denied');
});
