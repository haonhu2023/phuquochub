#!/usr/bin/env node
// Backports multer 2.3.0's fix for four DoS/file-descriptor-leak advisories
// (GHSA-wc9g-mqfw-jrwm, GHSA-qfvm-cv95-jqjf, GHSA-qvfw-j98x-7q72, GHSA-535w-7cp7-47q4) onto
// whatever multer 2.2.0 npm actually resolved, everywhere it landed in the tree.
//
// WHY THIS SCRIPT EXISTS instead of a normal version bump: @nestjs/platform-express pins
// multer to the EXACT string "2.2.0" (not a range) in every published 11.x release through at
// least 11.2.3 (checked 2026-09-09) -- there is no NestJS 11.x release yet that resolves this
// upstream. Two standard mechanisms were tried and rejected as unreliable/unsupported for this
// exact shape (an npm-workspaces-hoisted, exact-pinned nested dependency), not skipped for
// convenience:
//   - npm `overrides`: the correct, standard mechanism in principle, and it DOES work -- but
//     only intermittently in this repo/npm-11 combination, reproducing a long-standing,
//     unresolved npm/cli bug where overrides apply on some fresh `npm install` runs and are
//     silently dropped on others in a workspaces monorepo (npm/cli#5850, #7660, #4834, #6979,
//     #7018, #7987). Retried a clean `rm -rf node_modules package-lock.json && npm install`
//     roughly a dozen times during development of this fix; it worked exactly once.
//   - `patch-package`: the standard tool for exactly this "no upstream fix yet" scenario, but
//     it does not support npm workspaces hoisting a dependency into a WORKSPACE's own
//     node_modules (as opposed to the repo root's) -- confirmed against patch-package's own
//     open issues (ds300/patch-package#289, #277). Every invocation shape tried either
//     mis-resolved the nested path or failed to locate the workspace's lockfile.
//
// This script is the fallback: idempotent, dependency-free (no patch-package, no npm feature
// that has proven unreliable here), and works identically regardless of exactly where npm (or a
// future npm version, once workspaces+overrides is fixed) decides to place multer's node_modules
// entry -- including workspace-hoisted locations like apps/api/node_modules/..., which are a
// SEPARATE tree from the repo root's node_modules and would never be found by only walking down
// from the root. Reference fixed files are the REAL published multer@2.3.0 sources (verified
// byte-for-byte against the npm registry tarball; only the four files that actually differ from
// 2.2.0 are included here -- index.js and package.json's own dependency list are unchanged
// between the two versions).
//
// Safe to remove entirely, no reinstall needed elsewhere, the day @nestjs/platform-express ships
// a release that bumps its own multer pin past 2.3.0.
import { readFileSync, writeFileSync, readdirSync, realpathSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..');
const PATCH_DIR = join(__dirname, 'patches', 'multer-2.3.0');

// Only these four files differ between multer 2.2.0 and 2.3.0 (verified via a full recursive
// diff of both published tarballs) -- everything else, including index.js's exported API
// surface (multer(), .single(), .array(), .fields(), .none(), .any(), MulterError,
// diskStorage, memoryStorage) and package.json's own "engines"/"dependencies", is byte-identical.
const PATCHED_FILES = ['lib/make-middleware.js', 'lib/multer-error.js', 'lib/file-appender.js', 'storage/disk.js'];

// A cheap, unambiguous fingerprint that distinguishes vulnerable 2.2.0 content from already-fixed
// 2.3.0 content, so this script is a safe no-op on an already-patched or already-upgraded tree.
const FIXED_MARKER = 'exceedsArrayIndexLimit';

// Recursively scans a `node_modules` directory for every `multer` package folder inside it, at
// any nesting depth. A scope directory (`@nestjs`) is structurally just another `node_modules`-
// like listing of package folders, so it's scanned the same way rather than as a package itself.
function scanNodeModules(nodeModulesDir, found) {
  let entries;
  try {
    entries = readdirSync(nodeModulesDir, { withFileTypes: true });
  } catch {
    return; // doesn't exist / not readable -- nothing to do here
  }
  for (const entry of entries) {
    if (!entry.isDirectory() && !entry.isSymbolicLink()) continue;
    if (entry.name === '.bin') continue;
    const full = join(nodeModulesDir, entry.name);
    if (entry.name.startsWith('@')) {
      scanNodeModules(full, found); // scope dir: its children are the real package dirs
      continue;
    }
    if (entry.name === 'multer') {
      found.push(full);
      continue; // multer has no nested multer of its own
    }
    scanNodeModules(join(full, 'node_modules'), found); // this package's own nested deps, if any
  }
}

// npm workspaces hoists each workspace's dependencies into EITHER the repo root's node_modules
// OR that specific workspace's own node_modules (when a version conflict forces it there) -- so
// every workspace root named in package.json's "workspaces" globs needs its own scan, not just
// the repo root. Globs here are the two literal patterns this repo declares ("apps/*",
// "packages/*"); resolved by listing each parent directory rather than depending on a glob lib.
function workspaceRoots() {
  const roots = [REPO_ROOT];
  const { workspaces } = JSON.parse(readFileSync(join(REPO_ROOT, 'package.json'), 'utf8'));
  for (const pattern of workspaces ?? []) {
    if (!pattern.endsWith('/*')) continue;
    const parent = join(REPO_ROOT, pattern.slice(0, -2));
    let entries;
    try {
      entries = readdirSync(parent, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (entry.isDirectory()) roots.push(join(parent, entry.name));
    }
  }
  return roots;
}

function isVulnerable(multerDir) {
  try {
    const pkg = JSON.parse(readFileSync(join(multerDir, 'package.json'), 'utf8'));
    if (pkg.name !== 'multer') return false;
  } catch {
    return false;
  }
  try {
    const content = readFileSync(join(multerDir, 'lib', 'make-middleware.js'), 'utf8');
    return !content.includes(FIXED_MARKER);
  } catch {
    return false; // unreadable/unexpected shape -- leave it alone rather than guess
  }
}

function applyPatch(multerDir) {
  for (const rel of PATCHED_FILES) {
    const fixedContent = readFileSync(join(PATCH_DIR, rel), 'utf8');
    writeFileSync(join(multerDir, rel), fixedContent);
  }
}

const found = [];
for (const root of workspaceRoots()) {
  scanNodeModules(join(root, 'node_modules'), found);
}
// De-duplicate by REAL path, not string path: npm workspaces symlinks each workspace under
// node_modules/@scope/name (e.g. node_modules/@phuquochub/api -> apps/api), so the same physical
// multer directory is often reachable both through that symlink from the repo root scan AND
// directly through this package's own workspace-root scan -- two different strings, one file.
const candidates = [...new Set(found.map((dir) => realpathSync(dir)))];

let patchedCount = 0;
for (const dir of candidates) {
  if (isVulnerable(dir)) {
    applyPatch(dir);
    patchedCount++;
    console.log(`[patch-multer-security-fix] backported multer 2.3.0 fix onto ${dir}`);
  }
}

if (candidates.length === 0) {
  console.log('[patch-multer-security-fix] no installed multer found (nothing to do).');
} else if (patchedCount === 0) {
  console.log(`[patch-multer-security-fix] all ${candidates.length} installed multer copy(ies) already fixed.`);
} else {
  console.log(`[patch-multer-security-fix] patched ${patchedCount}/${candidates.length} installed multer copy(ies).`);
}
