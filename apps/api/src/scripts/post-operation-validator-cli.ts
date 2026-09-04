import { readFileSync } from 'fs';
import 'reflect-metadata';

// READ-ONLY post-operation validator CLI (release-closure task, 2026-09-04). Thin wiring only —
// all logic lives in evidence/tooling/post-operation-validator.ts (pure, DB-port based). This CLI
// never writes: every query issued is a SELECT (enforced by the pure function's own test suite).
//
// Usage:
//   npm run admin:post-operation-validator -- --file=<expectations.json> --db-name=<name>
//   npm run admin:post-operation-validator -- --help

const USAGE = `Usage:
  npm run admin:post-operation-validator -- --file=<expectations.json> --db-name=<name>
  npm run admin:post-operation-validator -- --help

Read-only. Verifies that a set of evidence/translation operations landed exactly as expected:
each expected evidence business_key exists exactly once, is still NEEDS_REVIEW (never auto-
promoted), and is linked to its expected translation targets; each expected translation target
exists, is still PENDING/NEEDS_CHANGES, and has is_public/is_production_data/production_eligible
all false. --db-name is required — this tool never guesses which database to check.

Exit codes:
  0  --help, or every check passed (findings may still include non-fatal warnings)
  1  file not readable / invalid JSON / any error-severity finding
  2  command-line usage error`;

export type CliArgsResult =
  | { readonly kind: 'help' }
  | { readonly kind: 'run'; readonly filePath: string; readonly dbName: string }
  | { readonly kind: 'usage-error'; readonly message: string };

export function parseCliArgs(argv: readonly string[]): CliArgsResult {
  if (argv.includes('--help')) return { kind: 'help' };

  const fileArg = argv.find((a) => a.startsWith('--file='));
  if (!fileArg) return { kind: 'usage-error', message: 'missing required --file=<path>' };
  const filePath = fileArg.slice('--file='.length);
  if (!filePath) return { kind: 'usage-error', message: '--file= must not be empty' };

  const dbNameArg = argv.find((a) => a.startsWith('--db-name='));
  if (!dbNameArg) return { kind: 'usage-error', message: '--db-name=<name> is required' };
  const dbName = dbNameArg.slice('--db-name='.length);
  if (!dbName) return { kind: 'usage-error', message: '--db-name= must not be empty' };

  return { kind: 'run', filePath, dbName };
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
  try {
    manifest = JSON.parse(readFileSync(parsed.filePath, 'utf8'));
  } catch (err) {
    console.error(`Failed to read/parse expectations file: ${err instanceof Error ? err.message : String(err)}`);
    return 1;
  }

  const { default: dataSource } = await import('../core/database/data-source');
  const { runPostOperationValidator } = await import('../modules/evidence/tooling/post-operation-validator');

  await dataSource.initialize();
  try {
    const [{ current_database: actual }] = await dataSource.query('SELECT current_database()');
    if (actual !== parsed.dbName) {
      console.error(`ABORT — current_database()="${actual}", expected "${parsed.dbName}". Refusing to check the wrong database.`);
      return 1;
    }

    const result = await runPostOperationValidator(manifest as never, { query: (sql, params) => dataSource.query(sql, params) });
    console.log(JSON.stringify(result, null, 2));
    return result.ok ? 0 : 1;
  } finally {
    await dataSource.destroy();
  }
}

if (require.main === module) {
  runCli(process.argv.slice(2)).then((code) => {
    process.exitCode = code;
  });
}
