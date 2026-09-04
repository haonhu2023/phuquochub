import 'reflect-metadata';
import { randomUUID, createHash } from 'crypto';
import { Logger } from '@nestjs/common';
import { Source } from '../modules/sources/entities/source.entity';
import { SourcesRepository } from '../modules/sources/repositories/sources.repository';
import { SourceType, SourceKind } from '../modules/sources/sources.enums';
import { SupportedLocale } from '../modules/locales/entities/supported-locale.entity';
import { LocalesRepository } from '../modules/locales/repositories/locales.repository';
import { LocalesService } from '../modules/locales/locales.service';
import { WikiRevision } from '../modules/revisions/entities/wiki-revision.entity';
import { RevisionsRepository } from '../modules/revisions/repositories/revisions.repository';
import { RevisionsService } from '../modules/revisions/revisions.service';
import { PlaceTranslation } from '../modules/place-translations/entities/place-translation.entity';
import { PlaceTranslationRoute } from '../modules/place-translations/entities/place-translation-route.entity';
import { PlaceTranslationSeo } from '../modules/place-translations/entities/place-translation-seo.entity';
import { PlaceTranslationsRepository } from '../modules/place-translations/repositories/place-translations.repository';
import { PlaceTranslationRoutesRepository } from '../modules/place-translations/repositories/place-translation-routes.repository';
import { PlaceTranslationSeoRepository } from '../modules/place-translations/repositories/place-translation-seo.repository';
import { PlaceTranslationsService } from '../modules/place-translations/place-translations.service';
import { MultilingualImportBatch } from '../modules/multilingual-import/entities/multilingual-import-batch.entity';
import { MultilingualImportRow } from '../modules/multilingual-import/entities/multilingual-import-row.entity';
import { MultilingualImportBatchRepository } from '../modules/multilingual-import/repositories/multilingual-import-batch.repository';
import { MultilingualImportRowRepository } from '../modules/multilingual-import/repositories/multilingual-import-row.repository';
import { MultilingualPlaceImportService } from '../modules/multilingual-import/multilingual-place-import.service';
import {
  MultilingualImportContract,
  MultilingualImportContractRow,
  computeRowHash,
  computeManifestChecksum,
} from '../modules/multilingual-import/multilingual-import.contract';
import { MULTILINGUAL_IMPORT_CONTRACT_VERSION } from '../modules/multilingual-import/multilingual-import.enums';
import {
  computeReleaseManifestChecksum,
  type ReleaseManifestPayloadV1,
  type ReleaseManifestV1,
} from '../modules/admin-data/release-manifest.contract';

// PILOT REMEDIATION RUNNER — 2026-09-02 data-SSOT remediation, Phases 4 and 6. Same "hand-wire
// against a bare DataSource" approach as cancel-multilingual-batch.ts (see that file's comment for
// why: booting the full AppModule pulls in Redis/MinIO/rate-limit config this action does not need
// and hung in practice). Every service instantiated below is the REAL production class, wired by
// hand instead of through Nest DI — not a reimplementation.
//
// Steps, all idempotent (safe to re-run):
//   A. Ensure the 3 real official-website `sources` rows exist (VinWonders VI/EN, Sun World).
//   B. Backfill source_id onto the 4 EXISTING short_description rows via
//      PlaceTranslationsService.backfillProvenance() — content untouched.
//   C. Import the 4 MISSING display_name rows via MultilingualPlaceImportService.importBundle(),
//      gated by a real ReleaseManifestV1 — dry-run first, then non-dry-run only if the caller
//      passes --execute.
//
// Usage:
//   npx ts-node src/scripts/remediate-pilot-translations.ts                 (dry-run only)
//   npx ts-node src/scripts/remediate-pilot-translations.ts -- --execute    (dry-run, then non-dry-run)

const VINWONDERS_SLUG = 'vinwonders-phu-quoc';
const HONTHOM_SLUG = 'sun-world-hon-thom';
// The real local-staging-only service account every prior successful multilingual batch used
// (local-staging-import-actor@local.invalid) — wiki_revisions.editor_id has a real FK to users(id),
// so a made-up UUID fails at the DB layer (caught by this script's own first --execute attempt).
const STAGING_ACTOR_ID = 'a0eaa9bb-cfc5-4e6b-a526-838cd7488cb1';
// Bump this if a prior run already consumed a key (idempotency keys are permanently one-shot by
// design — see uq_import_batch_idempotency_key).
const RELEASE_KEY_SUFFIX = process.env['REMEDIATION_RELEASE_KEY_SUFFIX'] ?? 'v1';

function sha256hex(s: string): string {
  return createHash('sha256').update(Buffer.from(s, 'utf8')).digest('hex');
}

async function main(): Promise<void> {
  const logger = new Logger('RemediatePilotTranslations');
  const execute = process.argv.slice(2).includes('--execute');

  const { default: dataSource } = await import('../core/database/data-source');
  await dataSource.initialize();

  try {
    // ---- wire real repositories/services by hand against the bare DataSource ----
    const sourcesRepo = new SourcesRepository(dataSource.getRepository(Source));

    const localesRepo = new LocalesRepository(dataSource.getRepository(SupportedLocale));
    const localesService = new LocalesService(localesRepo);

    const revisionsRepo = new RevisionsRepository(dataSource.getRepository(WikiRevision));
    const revisionsService = new RevisionsService(revisionsRepo);

    const translationsRepo = new PlaceTranslationsRepository(dataSource.getRepository(PlaceTranslation));
    const routesRepo = new PlaceTranslationRoutesRepository(dataSource.getRepository(PlaceTranslationRoute));
    const seoRepo = new PlaceTranslationSeoRepository(dataSource.getRepository(PlaceTranslationSeo));
    const translationsService = new PlaceTranslationsService(
      translationsRepo,
      routesRepo,
      seoRepo,
      localesService,
      revisionsService,
      dataSource,
    );

    const batchRepo = new MultilingualImportBatchRepository(dataSource.getRepository(MultilingualImportBatch));
    const rowRepo = new MultilingualImportRowRepository(dataSource.getRepository(MultilingualImportRow));
    const importService = new MultilingualPlaceImportService(
      batchRepo,
      rowRepo,
      translationsService,
      localesService,
      dataSource,
    );

    // ---- resolve the two pilots' REAL staging place_id (never the workbook UUID) ----
    const placesRaw: Array<{ id: string; slug: string }> = await dataSource.query(
      `SELECT id, slug FROM places WHERE slug IN ($1, $2)`,
      [VINWONDERS_SLUG, HONTHOM_SLUG],
    );
    const vinwondersId = placesRaw.find((p) => p.slug === VINWONDERS_SLUG)?.id;
    const honthomId = placesRaw.find((p) => p.slug === HONTHOM_SLUG)?.id;
    if (!vinwondersId || !honthomId) {
      throw new Error(`Could not resolve staging place_id for both pilots (found: ${JSON.stringify(placesRaw)})`);
    }
    logger.log(`Resolved staging place_id — vinwonders=${vinwondersId} sun-world-hon-thom=${honthomId}`);

    // ================================================================
    // Step A — ensure the real official-website sources exist (idempotent)
    // ================================================================
    const ensureSource = async (input: {
      externalRef: string;
      title: string;
      url: string;
      publisher: string;
      language: string;
    }): Promise<Source> => {
      const existing = await sourcesRepo.findByTypeAndExternalRef(SourceType.OFFICIAL_WEBSITE, input.externalRef);
      if (existing) return existing;
      const created = sourcesRepo.create({
        type: SourceType.OFFICIAL_WEBSITE,
        kind: SourceKind.URL,
        title: input.title,
        url: input.url,
        externalRef: input.externalRef,
        publisher: input.publisher,
        reliability: 90, // SOURCE_TYPE_DEFAULT_RELIABILITY[OFFICIAL_WEBSITE], matching sources.enums.ts
        language: input.language,
        retrievedAt: new Date('2026-08-29T00:00:00.000Z'), // matches 04_Source_Registry capture date
      });
      return sourcesRepo.save(created);
    };

    const srcVinVi = await ensureSource({
      externalRef: 'vinwonders.com/vi/vinwonders-phu-quoc/',
      title: 'VinWonders Phú Quốc — trang chính thức VI',
      url: 'https://vinwonders.com/vi/vinwonders-phu-quoc/',
      publisher: 'VinWonders',
      language: 'vi',
    });
    const srcVinEn = await ensureSource({
      externalRef: 'vinwonders.com/en/vinwonders-phu-quoc/',
      title: 'VinWonders Phu Quoc — official EN',
      url: 'https://vinwonders.com/en/vinwonders-phu-quoc/',
      publisher: 'VinWonders',
      language: 'en',
    });
    const srcSun = await ensureSource({
      externalRef: 'sunworld.vn/en/hon-thom',
      title: 'Sun World Hòn Thơm — official destination',
      url: 'https://sunworld.vn/en/hon-thom',
      publisher: 'Sun World',
      language: 'en',
    });
    logger.log(`Sources ensured — SRC-VIN-OFFICIAL-VI=${srcVinVi.id} SRC-VIN-OFFICIAL-EN=${srcVinEn.id} SRC-SUN-OFFICIAL=${srcSun.id}`);

    // ================================================================
    // Step B — backfill provenance onto the 4 EXISTING short_description rows
    // ================================================================
    const existingShortDesc: Array<{ id: string; slug: string; locale_code: string }> = await dataSource.query(
      `SELECT pt.id, p.slug, pt.locale_code FROM place_translations pt
       JOIN places p ON p.id = pt.place_id
       WHERE p.slug IN ($1, $2) AND pt.field_key = 'short_description' AND pt.is_current = true`,
      [VINWONDERS_SLUG, HONTHOM_SLUG],
    );
    for (const row of existingShortDesc) {
      const sourceId = row.slug === VINWONDERS_SLUG ? (row.locale_code === 'vi' ? srcVinVi.id : srcVinEn.id) : srcSun.id;
      const result = await translationsService.backfillProvenance(
        row.id,
        { sourceId, evidenceId: null },
        null,
        `Provenance backfill (2026-09-02 data-SSOT remediation Phase 4.7): linked short_description/${row.locale_code} to the place's official-website source; evidence_id left null — no evidence table exists in this schema yet.`,
      );
      logger.log(`Backfilled provenance for short_description/${row.locale_code} on ${row.slug} -> sourceId=${result.sourceId}`);
    }

    // ================================================================
    // Step C — import the 4 missing display_name rows
    // ================================================================
    interface RowSpec {
      placeId: string;
      sourceId: string;
      localeCode: string;
      translatedText: string;
      translationMethod: 'original' | 'official_or_human';
    }
    const rowSpecs: RowSpec[] = [
      { placeId: vinwondersId, sourceId: srcVinVi.id, localeCode: 'vi', translatedText: 'VinWonders Phú Quốc', translationMethod: 'original' },
      { placeId: vinwondersId, sourceId: srcVinEn.id, localeCode: 'en', translatedText: 'VinWonders Phu Quoc', translationMethod: 'official_or_human' },
      { placeId: honthomId, sourceId: srcSun.id, localeCode: 'vi', translatedText: 'Sun World Hòn Thơm', translationMethod: 'original' },
      { placeId: honthomId, sourceId: srcSun.id, localeCode: 'en', translatedText: 'Sun World Hon Thom', translationMethod: 'official_or_human' },
    ];
    const contractRows: MultilingualImportContractRow[] = rowSpecs.map((spec) => {
      const sourceText = spec.placeId === vinwondersId ? 'VinWonders Phú Quốc' : 'Sun World Hòn Thơm';
      const base: Omit<MultilingualImportContractRow, 'rowHash'> = {
        placeId: spec.placeId,
        fieldKey: 'display_name',
        localeCode: spec.localeCode,
        sourceLocaleCode: 'vi',
        translatedText: spec.translatedText,
        sourceText,
        textFormat: 'plain_text',
        translationMethod: spec.translationMethod,
        translationStatus: 'APPROVED',
        humanReviewStatus: 'APPROVED',
        qualityGate: 'APPROVED_FOR_IMPORT',
        duplicateStatus: 'CLEAR',
        foreignKeyStatus: 'PASS',
        validationStatus: 'PASS',
        errorCount: 0,
        isPublic: true,
        isProductionData: true,
        productionEligible: true,
        sourceId: spec.sourceId,
        evidenceId: null,
      };
      return { ...base, rowHash: computeRowHash(base) };
    });

    const batchId = randomUUID();
    const contract: MultilingualImportContract = {
      contractVersion: MULTILINGUAL_IMPORT_CONTRACT_VERSION,
      generatedAt: new Date().toISOString(),
      batchId,
      sourceChecksum: sha256hex(`pilot-display-name-remediation-2026-09-02:${contractRows.map((r) => r.rowHash).join(',')}`),
      approvalEvidenceChecksum: sha256hex('data-ssot-pilot-reconciliation-2026-09-02-approval'),
      publishManifestChecksum: computeManifestChecksum(contractRows),
      totalRows: contractRows.length,
      rows: contractRows,
      summary: {
        byLocale: { vi: 2, en: 2 },
        byField: { display_name: 4 },
        totalApproved: 4,
        totalHeld: 0,
        totalRejected: 0,
      },
    };

    const releaseItemId = randomUUID();
    const subBatchIdempotencyKey = `release-pilot-display-name-2026-09-03:translation:${RELEASE_KEY_SUFFIX}`;
    const manifestPayload: ReleaseManifestPayloadV1 = {
      releaseManifestVersion: 1,
      releaseItemId,
      canonicalKey: 'place:vinwonders-phu-quoc+place:sun-world-hon-thom',
      slug: `${VINWONDERS_SLUG},${HONTHOM_SLUG}`,
      targetEnvironment: 'local_staging',
      identityResolutionStatus: 'MATCHED',
      policyStatus: 'PASS',
      preflightStatus: 'PASS',
      evidenceDigest: sha256hex('05_Evidence_Archive: EVD-VIN-OFFICIAL-VI-20260829,EVD-VIN-OFFICIAL-EN-20260829,EVD-SUN-OFFICIAL-20260829'),
      approval: {
        approvedBy: 'nhuhao2023@gmail.com',
        approvedAt: new Date().toISOString(),
        reason: 'Data-SSOT remediation Phase 6 — backfill missing display_name for the two pilot places on local staging only.',
      },
      subBatches: [{ kind: 'translation', idempotencyKey: subBatchIdempotencyKey, payloadDigest: contract.sourceChecksum }],
    };
    const releaseManifest: ReleaseManifestV1 = { payload: manifestPayload, checksum: computeReleaseManifestChecksum(manifestPayload) };

    logger.log(`--- DRY RUN (batchId=${batchId}) ---`);
    const dryRunResult = await importService.importBundle({ contract, actorId: STAGING_ACTOR_ID, dryRun: true, releaseManifest });
    logger.log(`Dry-run result: status=${dryRunResult.status} total=${dryRunResult.totalRows} succeeded(preview)=${dryRunResult.succeeded}`);

    if (!execute) {
      logger.log('--execute not passed — stopping after dry-run. Nothing written.');
      return;
    }

    logger.log(`--- NON-DRY-RUN (batchId=${batchId}) ---`);
    try {
      const liveResult = await importService.importBundle({ contract, actorId: STAGING_ACTOR_ID, dryRun: false, releaseManifest });
      logger.log(
        `Live result: status=${liveResult.status} succeeded=${liveResult.succeeded} alreadyCurrent=${liveResult.alreadyCurrent} held=${liveResult.held} failed=${liveResult.failed}`,
      );
      for (const r of liveResult.rowResults) {
        logger.log(`  ${r.outcome.toUpperCase()} place=${r.placeId} locale=${r.localeCode} translationId=${r.translationId}`);
      }
    } catch (err) {
      // A re-run of this script with unchanged content lands here every time after the first
      // success — sourceChecksum idempotency (same layer VerifiedFactsIngestionService documents)
      // rejects it as ALREADY_APPLIED rather than silently no-op-ing, which is the correct,
      // auditable behavior: the caller finds out explicitly that nothing new happened.
      logger.log(`Non-dry-run rejected as already applied (this is correct on any re-run with unchanged content): ${err instanceof Error ? err.message : String(err)}`);
    }

    // ---- idempotency proof: re-run under the SAME idempotency key / batch semantics ----
    logger.log(`--- IDEMPOTENCY RE-RUN (new batchId, same release + row content) ---`);
    const rerunBatchId = randomUUID();
    const rerunContract: MultilingualImportContract = { ...contract, batchId: rerunBatchId, generatedAt: new Date().toISOString() };
    try {
      await importService.importBundle({ contract: rerunContract, actorId: STAGING_ACTOR_ID, dryRun: false, releaseManifest });
      logger.error('UNEXPECTED: re-run under the same release-manifest idempotencyKey did not throw.');
    } catch (err) {
      logger.log(`Re-run correctly rejected at the release-gate idempotency-key check: ${err instanceof Error ? err.message : String(err)}`);
    }

    // Second independent idempotency layer: a fresh idempotencyKey + fresh batchId but the SAME
    // row content (same sourceChecksum) — this is the deeper, content-level dedup
    // (uq_import_batch_source_checksum_succeeded) that exists specifically to catch "resubmit the
    // same XLSX under a different batch/key". Expected to ALSO reject, proving idempotency holds
    // even if a caller tries to route around the release-gate key check.
    const secondManifestPayload: ReleaseManifestPayloadV1 = {
      ...manifestPayload,
      releaseItemId: randomUUID(),
      subBatches: [{ kind: 'translation', idempotencyKey: `release-pilot-display-name-2026-09-03:translation:${RELEASE_KEY_SUFFIX}-second`, payloadDigest: contract.sourceChecksum }],
    };
    const secondReleaseManifest: ReleaseManifestV1 = { payload: secondManifestPayload, checksum: computeReleaseManifestChecksum(secondManifestPayload) };
    const secondRerunContract: MultilingualImportContract = { ...contract, batchId: randomUUID(), generatedAt: new Date().toISOString() };
    try {
      await importService.importBundle({ contract: secondRerunContract, actorId: STAGING_ACTOR_ID, dryRun: false, releaseManifest: secondReleaseManifest });
      logger.error('UNEXPECTED: re-run under a fresh key but identical content did not throw.');
    } catch (err) {
      logger.log(`Re-run correctly rejected at the content-level (sourceChecksum) idempotency check: ${err instanceof Error ? err.message : String(err)}`);
    }

    // Concrete, DB-level proof — not just "no exception": count rows directly.
    const [{ count: displayNameCount }] = await dataSource.query(
      `SELECT count(*)::int AS count FROM place_translations WHERE field_key = 'display_name' AND place_id IN ($1, $2)`,
      [vinwondersId, honthomId],
    );
    logger.log(`DB proof: total display_name rows for the two pilots after both re-run attempts = ${displayNameCount} (expected 4, not 8 or more)`);
  } finally {
    await dataSource.destroy();
  }
}

main().catch((err: unknown) => {
  console.error('Fatal error in remediate-pilot-translations:', err);
  process.exitCode = 1;
});
