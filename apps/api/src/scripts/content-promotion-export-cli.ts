import { writeFileSync } from 'fs';
import 'reflect-metadata';

// CONTENT PROMOTION — EXPORT (content-promotion-pipeline, 2026-09-04). Read-only against the
// SOURCE database (staging). Scans current place_translations, keeps only rows that pass
// evaluatePromotionEligibility() (APPROVED + is_public + is_production_data + production_eligible
// + is_current — see promotion-eligibility.ts), and writes a PromotionManifest JSON file. Never
// writes to any database.
//
// Usage:
//   npm run content-promotion:export -- --db-name=<source db> --out=<path> [--slug=<place-slug>]
//   npm run content-promotion:export -- --help

const USAGE = `Usage:
  npm run content-promotion:export -- --db-name=<source db> --out=<path> [--slug=<place-slug>]
  npm run content-promotion:export -- --help

Read-only against --db-name (verified via SELECT current_database() before any query). Exports
every CURRENT translation that is APPROVED and has is_public/is_production_data/production_eligible
all true into a PromotionManifest JSON file at --out. --slug restricts to one place (e.g. for a
golden-record dry run). Never writes to any database.

Exit codes:
  0  --help, or export completed (even with zero eligible rows)
  1  wrong database / write error
  2  command-line usage error`;

export type CliArgsResult =
  | { readonly kind: 'help' }
  | { readonly kind: 'export'; readonly dbName: string; readonly outPath: string; readonly slug?: string }
  | { readonly kind: 'usage-error'; readonly message: string };

export function parseCliArgs(argv: readonly string[]): CliArgsResult {
  if (argv.includes('--help')) return { kind: 'help' };
  const dbNameArg = argv.find((a) => a.startsWith('--db-name='));
  if (!dbNameArg) return { kind: 'usage-error', message: '--db-name=<name> is required' };
  const dbName = dbNameArg.slice('--db-name='.length);
  if (!dbName) return { kind: 'usage-error', message: '--db-name= must not be empty' };
  const outArg = argv.find((a) => a.startsWith('--out='));
  if (!outArg) return { kind: 'usage-error', message: '--out=<path> is required' };
  const outPath = outArg.slice('--out='.length);
  if (!outPath) return { kind: 'usage-error', message: '--out= must not be empty' };
  const slugArg = argv.find((a) => a.startsWith('--slug='));
  const slug = slugArg ? slugArg.slice('--slug='.length) : undefined;
  return { kind: 'export', dbName, outPath, slug };
}

export async function runCli(argv: readonly string[]): Promise<number> {
  const parsed = parseCliArgs(argv);
  if (parsed.kind === 'help') {
    console.log(USAGE);
    return 0;
  }
  if (parsed.kind === 'usage-error') {
    console.error(`Usage error: ${parsed.message}\n\n${USAGE}`);
    return 2;
  }

  const { default: dataSource } = await import('../core/database/data-source');
  const { exportPromotionManifest } = await import('../modules/content-promotion/promotion-exporter');

  await dataSource.initialize();
  try {
    const [{ current_database: actual }] = await dataSource.query('SELECT current_database()');
    if (actual !== parsed.dbName) {
      console.error(`ABORT — current_database()="${actual}", expected "${parsed.dbName}".`);
      return 1;
    }

    const { manifest, summary } = await exportPromotionManifest(
      { query: (sql, params) => dataSource.query(sql, params) },
      parsed.dbName,
      { placeSlug: parsed.slug },
    );
    writeFileSync(parsed.outPath, JSON.stringify(manifest, null, 2), 'utf8');
    console.log(JSON.stringify({ summary, out: parsed.outPath, entries_written: manifest.entries.length }, null, 2));
    return 0;
  } finally {
    await dataSource.destroy();
  }
}

if (require.main === module) {
  runCli(process.argv.slice(2)).then((code) => {
    process.exitCode = code;
  });
}
