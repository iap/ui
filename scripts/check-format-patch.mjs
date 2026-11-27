#!/usr/bin/env node
// SPDX-License-Identifier: MIT OR Apache-2.0
/**
 * Gate for patches produced by the untrusted fork-formatting workflow.
 *
 * The privileged workflow applies this patch to a trusted checkout, so the patch is
 * treated as hostile input: only hand-formatted source paths are allowed, never
 * workflows, lockfiles, generated output, binaries or secrets. A check that exists
 * but is not run is not a gate — tests/check-format-patch.test.mjs drives both sides.
 */
import { readFileSync, statSync } from 'node:fs';

const MAX_BYTES = 2 * 1024 * 1024;
const ALLOWED = [
  /^apps\//,
  /^docs\//,
  /^harness\/src\//,
  /^packages\//,
  /^scripts\//,
  /^tests\//,
  /^[^/]+\.md$/,
  /^\.editorconfig$/,
  /^\.prettier(rc\.json|ignore)$/,
  /^package\.json$/,
  /^tsconfig[^/]*\.json$/
];
const DENIED = [
  /^\.github\//,
  /^package-lock\.json$/,
  /^(dist|node_modules|verification|baselines|coverage)\//,
  /^\.env/,
  /\.(png|jpe?g|gif|webp|ico|pdf|zip|gz|woff2?)$/i
];

const file = process.argv[2];
if (!file) {
  console.error('usage: node scripts/check-format-patch.mjs <patch-file>');
  process.exit(2);
}

const problems = [];
let patch;
try {
  const size = statSync(file).size;
  if (size > MAX_BYTES) problems.push(`patch is ${size} bytes (max ${MAX_BYTES})`);
  patch = readFileSync(file, 'utf8');
} catch (error) {
  console.error(`format patch: cannot read ${file}: ${error.message}`);
  process.exit(1);
}

const paths = [];
for (const line of patch.split('\n')) {
  const match = /^diff --git a\/(.+) b\/(.+)$/.exec(line);
  if (match) {
    paths.push(match[1]);
    if (match[1] !== match[2]) problems.push(`asymmetric paths: ${match[1]} / ${match[2]}`);
    continue;
  }
  if (/^(---|\+\+\+) \/dev\/null$/.test(line)) {
    problems.push('file creation or deletion is not a formatting change');
    continue;
  }
  const header = /^(---|\+\+\+) ([^/]+)\/(.+)$/.exec(line);
  if (header) {
    paths.push(header[3]);
    if (header[3] === '/dev/null') problems.push('file creation or deletion is not a formatting change');
    continue;
  }
  if (
    /^(rename from|rename to|copy from|copy to|similarity index|dissimilarity index|old mode|new mode|new file mode|deleted file mode) /.test(
      line
    )
  ) {
    problems.push(`unsupported patch construct: ${line.split(' ')[0]}`);
  }
}
if (paths.length === 0) problems.push('patch contains no file diffs');
if (/^GIT binary patch|^Binary files /m.test(patch)) problems.push('binary patches are not allowed');

for (const path of paths) {
  if (path.includes('..') || path.startsWith('/') || path.includes('\\')) {
    problems.push(`unsafe path: ${path}`);
  } else if (DENIED.some((pattern) => pattern.test(path))) {
    problems.push(`denied path: ${path}`);
  } else if (!ALLOWED.some((pattern) => pattern.test(path))) {
    problems.push(`path outside the formatting scope: ${path}`);
  }
}

const passed = problems.length === 0;
console.log(`format patch: ${passed ? 'ok' : problems.join('; ')} (${paths.length} files)`);
process.exit(passed ? 0 : 1);
