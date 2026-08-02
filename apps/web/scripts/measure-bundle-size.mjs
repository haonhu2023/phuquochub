#!/usr/bin/env node
// Frontend Bundle Size Baseline & Regression Reference (2026-08-02). Node built-ins only (fs,
// path, zlib) — no dependency added for this. Measures the ACTUAL generated production artifacts
// under apps/web/.next after a clean `next build`; never guesses or reads from cache.
//
// Usage (from apps/web):
//   rm -rf .next && npx next build && node scripts/measure-bundle-size.mjs
//
// Prints a human-readable report to stdout. Pass --json for machine-readable output instead
// (same underlying measurements, no formatting).
import { readdirSync, statSync, readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const ROOT = process.cwd();
const NEXT_DIR = path.join(ROOT, '.next');
const STATIC_DIR = path.join(NEXT_DIR, 'static');
const CHUNKS_DIR = path.join(STATIC_DIR, 'chunks');
const SERVER_DIR = path.join(NEXT_DIR, 'server');

if (!existsSync(CHUNKS_DIR)) {
  console.error(
    `No .next/static/chunks found at ${CHUNKS_DIR}.\n` +
      'Run a clean production build first: rm -rf .next && npx next build',
  );
  process.exit(1);
}

function walk(dir) {
  const out = [];
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(p));
    else out.push(p);
  }
  return out;
}

const dirSizeBytes = (dir) => walk(dir).reduce((sum, f) => sum + statSync(f).size, 0);
const gzipSize = (buf) => zlib.gzipSync(buf, { level: 9 }).length;
const brotliSize = (buf) =>
  zlib.brotliCompressSync(buf, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 11 } }).length;
const kb = (bytes) => `${(bytes / 1024).toFixed(1)} KB`;

// ---- Directory totals ----
const totals = {
  static: dirSizeBytes(STATIC_DIR),
  chunks: dirSizeBytes(CHUNKS_DIR),
  server: dirSizeBytes(SERVER_DIR),
};

// ---- JS chunks (top level of static/chunks — what actually ships to the browser) ----
const jsFiles = readdirSync(CHUNKS_DIR)
  .filter((f) => f.endsWith('.js'))
  .map((f) => path.join(CHUNKS_DIR, f));

const jsMeasurements = jsFiles
  .map((f) => {
    const buf = readFileSync(f);
    return { file: path.basename(f), raw: buf.length, gzip: gzipSize(buf), brotli: brotliSize(buf) };
  })
  .sort((a, b) => b.raw - a.raw);

const totalJs = {
  raw: jsMeasurements.reduce((s, m) => s + m.raw, 0),
  gzip: jsMeasurements.reduce((s, m) => s + m.gzip, 0),
  brotli: jsMeasurements.reduce((s, m) => s + m.brotli, 0),
};

// ---- Content-based attribution (not filename-based) ----
const MARKERS = [
  ['maplibregl', 'MapLibre GL JS'],
  ['attribute vec2 a_pos', 'MapLibre GL JS (WebGL shader source)'],
  ['RTLTextPlugin', 'MapLibre GL JS (RTL text plugin)'],
  ['react-dom', 'React DOM'],
  ['next/dist', 'Next.js runtime'],
];
function attribute(fileAbsPath) {
  const content = readFileSync(fileAbsPath, 'utf8');
  return [...new Set(MARKERS.filter(([needle]) => content.includes(needle)).map(([, label]) => label))];
}
const top20 = jsMeasurements
  .slice(0, 20)
  .map((m) => ({ ...m, markers: attribute(path.join(CHUNKS_DIR, m.file)) }));

// ---- CSS ----
const cssFiles = readdirSync(CHUNKS_DIR)
  .filter((f) => f.endsWith('.css'))
  .map((f) => path.join(CHUNKS_DIR, f));
const cssMeasurements = cssFiles.map((f) => {
  const buf = readFileSync(f);
  return { file: path.basename(f), raw: buf.length, gzip: gzipSize(buf) };
});
const totalCss = {
  raw: cssMeasurements.reduce((s, m) => s + m.raw, 0),
  gzip: cssMeasurements.reduce((s, m) => s + m.gzip, 0),
};

// ---- Source maps ----
const allMaps = walk(NEXT_DIR).filter((f) => f.endsWith('.map'));
const staticMaps = allMaps.filter((f) => f.startsWith(STATIC_DIR));

// ---- Route-level client JS via App Router's page_client-reference-manifest.js ----
// Every route's manifest lists every client module (and its chunk files) needed to render that
// route, including shared framework chunks — this is the same "chunks referenced by the route's
// module graph" concept the old webpack-era "First Load JS" column measured, just read directly
// from the RSC manifest since Turbopack's `next build` output no longer prints that table.
const ROUTE_DIRS = {
  '/': 'app',
  '/search': 'app/(public)/search',
  '/explore': 'app/(public)/explore',
  '/map': 'app/(public)/map',
  '/hotels': 'app/(public)/hotels',
  '/restaurants': 'app/(public)/restaurants',
  '/tours': 'app/(public)/tours',
  '/dashboard': 'app/(dashboard)/dashboard',
};

function routeChunkSet(dir) {
  const manifestPath = path.join(SERVER_DIR, dir, 'page_client-reference-manifest.js');
  if (!existsSync(manifestPath)) return null;
  const content = readFileSync(manifestPath, 'utf8');
  const match = content.match(/globalThis\.__RSC_MANIFEST\[[^\]]+\]\s*=\s*(\{.*\});?\s*$/s);
  if (!match) return null;
  const parsed = JSON.parse(match[1]);
  const set = new Set();
  for (const mod of Object.values(parsed.clientModules ?? {})) {
    for (const c of mod.chunks ?? []) {
      if (typeof c === 'string' && c.endsWith('.js')) set.add(path.basename(c));
    }
  }
  return set;
}

const chunkByName = new Map(jsMeasurements.map((m) => [m.file, m]));
const routeEstimates = {};
const routeChunkSets = {};
for (const [route, dir] of Object.entries(ROUTE_DIRS)) {
  const set = routeChunkSet(dir);
  if (!set) {
    routeEstimates[route] = { error: 'manifest not found' };
    continue;
  }
  routeChunkSets[route] = set;
  let raw = 0;
  let gzip = 0;
  for (const name of set) {
    const m = chunkByName.get(name);
    if (m) {
      raw += m.raw;
      gzip += m.gzip;
    }
  }
  routeEstimates[route] = { chunkCount: set.size, raw, gzip };
}

// ---- Output ----
const asJson = process.argv.includes('--json');
if (asJson) {
  console.log(
    JSON.stringify({ totals, totalJs, top20, css: { files: cssMeasurements, total: totalCss }, sourceMaps: { total: allMaps.length, inStatic: staticMaps.length }, routeEstimates }, null, 2),
  );
  process.exit(0);
}

console.log('# Frontend Bundle Size Measurement\n');
console.log('## Directory totals');
console.log(`  .next/static         ${kb(totals.static)}`);
console.log(`  .next/static/chunks  ${kb(totals.chunks)}`);
console.log(`  .next/server         ${kb(totals.server)}`);

console.log('\n## Total client JS (all chunks in static/chunks)');
console.log(`  files: ${jsMeasurements.length}`);
console.log(`  raw:    ${kb(totalJs.raw)}`);
console.log(`  gzip:   ${kb(totalJs.gzip)}`);
console.log(`  brotli: ${kb(totalJs.brotli)}`);

console.log('\n## Total CSS');
console.log(`  files: ${cssMeasurements.length}`);
console.log(`  raw:  ${kb(totalCss.raw)}`);
console.log(`  gzip: ${kb(totalCss.gzip)}`);

console.log('\n## Source maps');
console.log(`  total found: ${allMaps.length}`);
console.log(`  shipped to client (.next/static): ${staticMaps.length}`);

console.log('\n## Largest 20 JS chunks');
for (const m of top20) {
  const markers = m.markers.length ? ` — ${m.markers.join(', ')}` : '';
  console.log(`  ${m.file.padEnd(24)} raw ${kb(m.raw).padStart(9)}  gzip ${kb(m.gzip).padStart(9)}  brotli ${kb(m.brotli).padStart(9)}${markers}`);
}

console.log('\n## Route-level client JS estimate (via page_client-reference-manifest.js)');
for (const [route, est] of Object.entries(routeEstimates)) {
  if (est.error) {
    console.log(`  ${route.padEnd(14)} ${est.error}`);
  } else {
    console.log(`  ${route.padEnd(14)} ${est.chunkCount} chunks  raw ${kb(est.raw).padStart(9)}  gzip ${kb(est.gzip).padStart(9)}`);
  }
}
