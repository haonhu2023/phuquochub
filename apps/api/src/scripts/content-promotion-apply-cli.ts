import { readFileSync } from 'fs';
import 'reflect-metadata';

// CONTENT PROMOTION — APPLY (content-promotion-pipeline, 2026-09-04). Reads a manifest produced by
// content-promotion-export-cli.ts and, against the TARGET database (production), resolves each
// entry's production identity (external identifier > manual mapping > exact unique slug — never
// fuzzy), then dry-runs or applies. Dry-run by default; --apply is explicit and required, exactly
// like every other governed script/CLI in this repo.
//
// Usage:
//   npm run content-promotion:apply -- --manifest=<path> --db-name=<target db> [--mappings=<path>]
//   npm run content-promotion:apply -- --manifest=<path> --db-name=<target db> --apply [--mappings=<path>]
//   npm run content-promotion:apply -- --help

const USAGE = `Usage:
  npm run content-promotion:apply -- --manifest=<path> --db-name=<target db> [--mappings=<path>]
  npm run content-promotion:apply -- --manifest=<path> --db-name=<target db> --apply [--mappings=<path>]
  npm run content-promotion:apply -- --help

--db-name is required for any run (even dry-run) — this tool never guesses which database to
target, verified against SELECT current_database() before anything else. --mappings optionally
points to a JSON array of ManualIdentityMapping entries (the ONLY way a non-exact identity match
may ever be accepted). Omit --apply for a dry-run (the default).

Exit codes:
  0  --help, or the run completed with zero BLOCKED_CONFLICT entries (BLOCKED_IDENTITY/BLOCKED_PENDING are expected, not failures)
  1  file/DB error, database identity mismatch, or any conflict
  2  command-line usage error`;

export type CliArgsResult =
  | { readonly kind: 'help' }
  | { readonly kind: 'run'; readonly manifestPath: string; readonly dbName: string; readonly mappingsPath?: string; readonly apply: boolean }
  | { readonly kind: 'usage-error'; readonly message: string };

export function parseCliArgs(argv: readonly string[]): CliArgsResult {
  if (argv.includes('--help')) return { kind: 'help' };
  const manifestArg = argv.find((a) => a.startsWith('--manifest='));
  if (!manifestArg) return { kind: 'usage-error', message: '--manifest=<path> is required' };
  const manifestPath = manifestArg.slice('--manifest='.length);
  if (!manifestPath) return { kind: 'usage-error', message: '--manifest= must not be empty' };
  const dbNameArg = argv.find((a) => a.startsWith('--db-name='));
  if (!dbNameArg) return { kind: 'usage-error', message: '--db-name=<name> is required' };
  const dbName = dbNameArg.slice('--db-name='.length);
  if (!dbName) return { kind: 'usage-error', message: '--db-name= must not be empty' };
  const mappingsArg = argv.find((a) => a.startsWith('--mappings='));
  const mappingsPath = mappingsArg ? mappingsArg.slice('--mappings='.length) : undefined;
  const apply = argv.includes('--apply');
  return { kind: 'run', manifestPath, dbName, mappingsPath, apply };
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

  let manifest: unknown;
  let mappings: unknown = [];
  try {
    manifest = JSON.parse(readFileSync(parsed.manifestPath, 'utf8'));
    if (parsed.mappingsPath) mappings = JSON.parse(readFileSync(parsed.mappingsPath, 'utf8'));
  } catch (err) {
    console.error(`Failed to read/parse manifest or mappings: ${err instanceof Error ? err.message : String(err)}`);
    return 1;
  }

  const { default: dataSource } = await import('../core/database/data-source');
  const { runContentPromotion } = await import('../modules/content-promotion/promotion-importer');

  await dataSource.initialize();
  try {
    const result = await runContentPromotion(
      manifest as never,
      { query: (sql, params) => dataSource.query(sql, params) },
      { apply: parsed.apply, requiredTargetDatabaseName: parsed.dbName, manualMappings: mappings as never },
    );
    console.log(JSON.stringify(result, null, 2));
    if (result.aborted) return 1;
    return result.conflicts > 0 ? 1 : 0;
  } finally {
    await dataSource.destroy();
  }
}

if (require.main === module) {
  runCli(process.argv.slice(2)).then((code) => {
    process.exitCode = code;
  });
}
