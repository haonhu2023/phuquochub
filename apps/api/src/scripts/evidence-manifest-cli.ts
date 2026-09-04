import { readFileSync } from 'fs';
import 'reflect-metadata';

// GENERIC EVIDENCE MANIFEST CLI (evidence-manifest-tooling, 2026-09-04). Thin wiring only — all
// real logic lives in apps/api/src/modules/evidence/tooling/*: evidence-manifest-validator.ts
// (pure, offline) and evidence-manifest-importer.ts (DB-port-based). This file's only job is to
// read one JSON file, parse argv, and connect the real ports (bare DataSource + PR #8's own
// SourcesRepository/EvidenceArtifactsRepository/EvidenceService — never reimplemented here).
//
// Dry-run by default, same convention as every governed script in this repo. `--execute` requires
// `--db-name` to ALSO be passed — Phase 5's security review of this tool found that
// runEvidenceManifestImport()'s `requiredDatabaseName` option is opt-in at the LIBRARY level (a
// caller could omit it), so this CLI closes that gap by refusing to open a DB connection for
// `--execute` at all unless the caller states which database they expect, which is then verified
// against `SELECT current_database()` before any write, same as every prior governed script.
//
// Usage:
//   npm run admin:evidence-manifest -- --file=<path> --offline
//   npm run admin:evidence-manifest -- --file=<path> --db-name=<name>
//   npm run admin:evidence-manifest -- --file=<path> --db-name=<name> --execute
//   npm run admin:evidence-manifest -- --help

const USAGE = `Usage:
  npm run admin:evidence-manifest -- --file=<path> --offline
  npm run admin:evidence-manifest -- --file=<path> --db-name=<name>
  npm run admin:evidence-manifest -- --file=<path> --db-name=<name> --execute
  npm run admin:evidence-manifest -- --help

--offline        Static validation only (evidence-manifest-validator.ts). No DB connection at all.
--db-name=<name> Required for any DB-connecting run (dry-run or execute). Verified against
                 SELECT current_database() before anything else happens.
--execute        Actually write (source/evidence_artifacts/place_translation_evidence_links).
                 Requires --db-name. Omit for dry-run (the default whenever --db-name is given
                 without --execute).

Exit codes:
  0  --help, or a run completed with zero error-severity issues
  1  file not readable / invalid JSON / static validation failed / DB identity mismatch / any
     entry ended SKIPPED_ERROR
  2  command-line usage error`;

export type CliArgsResult =
  | { readonly kind: 'help' }
  | { readonly kind: 'offline'; readonly filePath: string }
  | { readonly kind: 'db-run'; readonly filePath: string; readonly dbName: string; readonly execute: boolean }
  | { readonly kind: 'usage-error'; readonly message: string };

/** Pure — no filesystem, no DB, no side effects. */
export function parseCliArgs(argv: readonly string[]): CliArgsResult {
  if (argv.includes('--help')) return { kind: 'help' };

  const fileArg = argv.find((a) => a.startsWith('--file='));
  if (!fileArg) return { kind: 'usage-error', message: 'missing required --file=<path>' };
  const filePath = fileArg.slice('--file='.length);
  if (!filePath) return { kind: 'usage-error', message: '--file= must not be empty' };

  const offline = argv.includes('--offline');
  const dbNameArg = argv.find((a) => a.startsWith('--db-name='));
  const execute = argv.includes('--execute');

  if (offline) {
    if (dbNameArg || execute) {
      return { kind: 'usage-error', message: '--offline cannot be combined with --db-name or --execute' };
    }
    return { kind: 'offline', filePath };
  }

  if (!dbNameArg) {
    return { kind: 'usage-error', message: 'either --offline or --db-name=<name> is required' };
  }
  const dbName = dbNameArg.slice('--db-name='.length);
  if (!dbName) return { kind: 'usage-error', message: '--db-name= must not be empty' };

  return { kind: 'db-run', filePath, dbName, execute };
}

function readManifest(filePath: string): unknown {
  const raw = readFileSync(filePath, 'utf8');
  return JSON.parse(raw);
}

async function runOffline(filePath: string): Promise<number> {
  const { validateManifestStatic } = await import('../modules/evidence/tooling/evidence-manifest-validator');
  const manifest = readManifest(filePath) as Parameters<typeof validateManifestStatic>[0];
  const result = validateManifestStatic(manifest);
  console.log(JSON.stringify(result, null, 2));
  return result.valid ? 0 : 1;
}

async function runDbConnected(filePath: string, dbName: string, execute: boolean): Promise<number> {
  const manifest = readManifest(filePath) as import('../modules/evidence/tooling/evidence-manifest.types').EvidenceManifest;

  const { default: dataSource } = await import('../core/database/data-source');
  const { Source } = await import('../modules/sources/entities/source.entity');
  const { SourcesRepository } = await import('../modules/sources/repositories/sources.repository');
  const { EvidenceArtifact } = await import('../modules/evidence/entities/evidence-artifact.entity');
  const { PlaceTranslationEvidenceLink } = await import('../modules/evidence/entities/place-translation-evidence-link.entity');
  const { EvidenceArtifactsRepository } = await import('../modules/evidence/repositories/evidence-artifacts.repository');
  const { EvidenceService } = await import('../modules/evidence/evidence.service');
  const { runEvidenceManifestImport } = await import('../modules/evidence/tooling/evidence-manifest-importer');

  await dataSource.initialize();
  try {
    const sourcesRepo = new SourcesRepository(dataSource.getRepository(Source));
    const evidenceRepo = new EvidenceArtifactsRepository(
      dataSource.getRepository(EvidenceArtifact),
      dataSource.getRepository(PlaceTranslationEvidenceLink),
    );
    const evidenceService = new EvidenceService(evidenceRepo);

    const result = await runEvidenceManifestImport(
      manifest,
      {
        db: { query: (sql, params) => dataSource.query(sql, params) },
        sources: {
          findByTypeAndExternalRef: (type, externalRef) => sourcesRepo.findByTypeAndExternalRef(type as never, externalRef),
          createSource: async (input) => {
            const source = sourcesRepo.create({
              type: input.type as never,
              kind: input.kind as never,
              title: input.title,
              url: input.url,
              externalRef: input.externalRef,
              publisher: input.publisher,
              reliability: input.reliability,
              language: input.language,
              retrievedAt: input.retrievedAt,
            });
            return sourcesRepo.save(source);
          },
        },
        artifacts: {
          ensureEvidenceArtifact: (input) => evidenceService.ensureEvidenceArtifact(input),
          linkEvidenceToTranslation: (translationId, evidenceId, relationshipType) =>
            evidenceService.linkEvidenceToTranslation(translationId, evidenceId, relationshipType),
        },
      },
      { execute, requiredDatabaseName: dbName },
    );

    console.log(JSON.stringify(result, null, 2));
    if (result.aborted) return 1;
    return result.results.some((r) => r.status === 'SKIPPED_ERROR') ? 1 : 0;
  } finally {
    await dataSource.destroy();
  }
}

export async function runCli(argv: readonly string[]): Promise<number> {
  const parsed = parseCliArgs(argv);
  switch (parsed.kind) {
    case 'help':
      console.log(USAGE);
      return 0;
    case 'usage-error':
      console.error(`Usage error: ${parsed.message}\n\n${USAGE}`);
      return 2;
    case 'offline':
      try {
        return await runOffline(parsed.filePath);
      } catch (err) {
        console.error(`Failed to read/parse/validate manifest: ${err instanceof Error ? err.message : String(err)}`);
        return 1;
      }
    case 'db-run':
      try {
        return await runDbConnected(parsed.filePath, parsed.dbName, parsed.execute);
      } catch (err) {
        console.error(`Fatal error: ${err instanceof Error ? err.message : String(err)}`);
        return 1;
      }
  }
}

// `require.main === module` — only runs when executed directly, not when imported by tests.
if (require.main === module) {
  runCli(process.argv.slice(2)).then((code) => {
    process.exitCode = code;
  });
}
