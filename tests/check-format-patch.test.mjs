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

  const src = 'packages/ui/src/components/Button.tsx';
  const base = diff(src);
  assert.equal(
    run(
      root,
      base.replace(
        '@@ -1 +1 @@',
        'similarity index 100%\nrename from ' + src + '\nrename to .github/workflows/ci.yml\n@@ -1 +1 @@'
      )
    ),
    false,
    'a rename into a protected path is denied'
  );
  assert.equal(
    run(root, base.replace('@@ -1 +1 @@', 'new file mode 120000\n@@ -1 +1 @@')),
    false,
    'symlink mode is denied'
  );
  assert.equal(
    run(root, base.replace('@@ -1 +1 @@', 'old mode 100644\nnew mode 100755\n@@ -1 +1 @@')),
    false,
    'executable-bit changes are denied'
  );
  assert.equal(
    run(root, base.replace('+++ b/' + src, '+++ b/.github/workflows/ci.yml')),
    false,
    'header destination is validated'
  );
  assert.equal(run(root, base.replace('--- a/' + src, '--- /dev/null')), false, 'file creation is denied');
});
