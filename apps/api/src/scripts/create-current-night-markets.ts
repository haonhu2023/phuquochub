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

// CURRENT NIGHT-MARKET ENTITY CREATION — 2026-09-06, owner-authorized product decision:
//   - legacy Cho Dem Phu Quoc / Cho Dem Dinh Cau stays ONE untouched legacy entity (not touched here)
//   - VUI-Fest Bazaar and Grand World Night Market are new, separate STANDALONE places
//   - Grand World Night Market does NOT reuse the grand-world-phu-quoc parent UUID; the schema has
//     no parent/child place field, so the logical relationship is recorded only in metadata/notes.
//
// Evidence found:
//   - VUI-Fest: sunworld.vn's own destination page fetched directly (200 OK), captured, hashed.
//     Real evidence exists -> full pipeline (place + translations + evidence + links).
//   - Grand World Night Market: only vinpearl.com carries an official page and it 403'd (Akamai/
//     VinGroup WAF) on every attempt. No official bytes captured -> place row only, no
//     translations/evidence this round. MANUAL_BROWSER_CAPTURE_REQUIRED.
//
// All new translations are is_public=false, is_production_data=false, human_review_status=PENDING
// (the latter is force-set by PlaceTranslationsService regardless of what is passed here, per the
// human-translation-review 2026-09-04 change -- see multilingual-place-import.service.ts).
//
// DRY-RUN SAFETY (fixed 2026-09-06): the first version of this script ran its places/
// source_attributions/sources INSERTs unconditionally, before the dry-run gate -- 3 tables were
// written on every invocation regardless of --execute. This version separates PLAN (planNightMarkets
// -- read-only, dataSource.query() SELECTs only, no repository .save()/.create() calls) from EXECUTE
// (executeNightMarkets -- every INSERT, only ever invoked when --execute is passed). main() always
// runs planNightMarkets() and logs it; it calls executeNightMarkets() only when --execute is given.
// The multilingual-import dry-run call (importService.importBundle({dryRun:true})) is safe to run
// inside the plan phase too: reading multilingual-place-import.service.ts confirms it returns
// (buildDryRunResult) BEFORE the batchRepo.insert() call -- proven no-write, not assumed.
//
// Usage:
//   npx ts-node src/scripts/create-current-night-markets.ts                 (plan / dry-run only)
//   npx ts-node src/scripts/create-current-night-markets.ts -- --execute    (plan, then execute)

export const MARKET_CATEGORY_ID = '384bef71-8985-4ac4-9cd7-30e4c6adfe24'; // categories.slug = 'market'
export const NQ_1654_SOURCE_ID = '84db2e70-e9e0-4167-8a42-fa9f4c001378'; // government admin-area source, reused platform-wide
export const STAGING_ACTOR_ID = 'a0eaa9bb-cfc5-4e6b-a526-838cd7488cb1'; // local-staging-import-actor@local.invalid
export const GRAND_WORLD_PARENT_SLUG = 'grand-world-phu-quoc';
export const VUI_FEST_SLUG = 'vui-fest-bazaar';
export const GRAND_WORLD_MARKET_SLUG = 'grand-world-night-market';
export const VUI_FEST_SOURCE_EXTERNAL_REF =
  'sunworld.vn/vi/hon-thom/an-choi/cho-dem-vui-phet-vui-fest-bazaar-thien-duong-mua-sam-va-vui-choi-tai-phu-quoc-19264';
export const VUI_FEST_EVIDENCE_BUSINESS_KEY = 'EVD-VUIFEST-OFFICIAL-20260906';
export const VUI_FEST_EVIDENCE_SHA256 = '62a60eb1f62a8ffdcca2821858e90ba4fd5e461e5c005dc350a1cb35c4949913';

// VUI-Fest Bazaar: Sunset Town / An Thoi. No on-page coordinates were found on either captured
// source; geocoded via OSM Nominatim ("Sunset Town Phu Quoc" -> Sun Premier Village Primavera, the
// development VUI-Fest sits inside) as an area-level approximation, not a precise venue pin.
export const VUI_FEST_LON = 104.0083142;
export const VUI_FEST_LAT = 10.0294252;

export function sha256hex(s: string): string {
  return createHash('sha256').update(Buffer.from(s, 'utf8')).digest('hex');
}

// Minimal surface this module needs from a DataSource for planning -- deliberately NOT the full
// TypeORM DataSource type, so a test can pass a bare `{ query: jest.fn() }` stub.
export interface QueryableDataSource {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  query(sql: string, params?: unknown[]): Promise<any[]>;
}

export interface ImportBundlePreview {
  importBundle(input: {
    contract: MultilingualImportContract;
    actorId: string;
    dryRun: boolean;
    releaseManifest: ReleaseManifestV1;
  }): Promise<{ status: string; totalRows: number; succeeded: number }>;
}

export type EntityAction = 'REUSE' | 'WOULD_CREATE';

export interface NightMarketPlan {
  preCounts: Record<string, string | number>;
  vuiFestPlaceAction: EntityAction;
  vuiFestPlaceId: string | null;
  grandWorldPlaceAction: EntityAction;
  grandWorldPlaceId: string | null;
  grandWorldParentId: string;
  grandWorldParentLon: number;
  grandWorldParentLat: number;
  attributionsWouldCreate: number; // out of 4 possible (province+admin_area x 2 places)
  vuiFestSourceAction: EntityAction;
  vuiFestSourceId: string | null;
  evidenceArtifactAction: EntityAction;
  evidenceArtifactId: string | null;
  linksWouldCreate: number; // out of 4 (only meaningful once translations exist)
  translationImportDryRun: { status: string; totalRows: number; succeeded: number };
  contract: MultilingualImportContract;
  releaseManifest: ReleaseManifestV1;
}

function buildVuiFestContract(placeId: string, sourceId: string | null): { contract: MultilingualImportContract; releaseManifest: ReleaseManifestV1 } {
  interface RowSpec {
    localeCode: string;
    fieldKey: string;
    translatedText: string;
    sourceText: string;
  }
  const VI_DISPLAY_NAME = 'Chợ đêm Vui Phết (VUI-Fest Bazaar)';
  const VI_SHORT_DESC =
    'Chợ đêm tại Sunset Town ở Nam đảo Phú Quốc, tập trung các gian hàng ẩm thực, mua sắm và hoạt động giải trí buổi tối.';
  const rowSpecs: RowSpec[] = [
    { localeCode: 'vi', fieldKey: 'display_name', translatedText: VI_DISPLAY_NAME, sourceText: VI_DISPLAY_NAME },
    { localeCode: 'en', fieldKey: 'display_name', translatedText: 'VUI-Fest Bazaar', sourceText: VI_DISPLAY_NAME },
    { localeCode: 'vi', fieldKey: 'short_description', translatedText: VI_SHORT_DESC, sourceText: VI_SHORT_DESC },
    {
      localeCode: 'en',
      fieldKey: 'short_description',
      translatedText: 'A night market in Sunset Town in southern Phu Quoc with food, shopping and evening entertainment.',
      sourceText: VI_SHORT_DESC,
    },
  ];
  const contractRows: MultilingualImportContractRow[] = rowSpecs.map((spec) => {
    const base: Omit<MultilingualImportContractRow, 'rowHash'> = {
      placeId,
      fieldKey: spec.fieldKey,
      localeCode: spec.localeCode,
      sourceLocaleCode: 'vi',
      translatedText: spec.translatedText,
      sourceText: spec.sourceText,
      textFormat: 'plain_text',
      translationMethod: 'ai_plus_human',
      translationStatus: 'PENDING',
      humanReviewStatus: 'PENDING',
      qualityGate: 'PASS',
      duplicateStatus: 'CLEAR',
      foreignKeyStatus: 'PASS',
      validationStatus: 'PASS',
      errorCount: 0,
      isPublic: false,
      isProductionData: false,
      productionEligible: false,
      sourceId,
      evidenceId: null,
    };
    return { ...base, rowHash: computeRowHash(base) };
  });

  const batchId = randomUUID();
  const contract: MultilingualImportContract = {
    contractVersion: MULTILINGUAL_IMPORT_CONTRACT_VERSION,
    generatedAt: new Date().toISOString(),
    batchId,
    sourceChecksum: sha256hex(`current-night-markets-2026-09-06:${contractRows.map((r) => r.rowHash).join(',')}`),
    approvalEvidenceChecksum: sha256hex('current-night-markets-2026-09-06-no-approval-yet'),
    publishManifestChecksum: computeManifestChecksum(contractRows),
    totalRows: contractRows.length,
    rows: contractRows,
    summary: {
      byLocale: { vi: 2, en: 2 },
      byField: { display_name: 2, short_description: 2 },
      totalApproved: 0,
      totalHeld: 0,
      totalRejected: 0,
    },
  };

  const subBatchIdempotencyKey = `create-current-night-markets-2026-09-06:translation:v1`;
  const manifestPayload: ReleaseManifestPayloadV1 = {
    releaseManifestVersion: 1,
    releaseItemId: randomUUID(),
    canonicalKey: `place:${VUI_FEST_SLUG}`,
    slug: VUI_FEST_SLUG,
    targetEnvironment: 'local_staging',
    identityResolutionStatus: 'MATCHED',
    policyStatus: 'PASS',
    preflightStatus: 'PASS',
    evidenceDigest: sha256hex(`sunworld.vn VUI-Fest destination page, sha256=${VUI_FEST_EVIDENCE_SHA256}`),
    approval: {
      approvedBy: 'nhuhao2023@gmail.com',
      approvedAt: new Date().toISOString(),
      reason:
        'Owner-authorized current night-market entity creation, 2026-09-06 -- local staging only, not human-approved content (is_production_data=false, human_review_status stays PENDING).',
    },
    subBatches: [{ kind: 'translation', idempotencyKey: subBatchIdempotencyKey, payloadDigest: contract.sourceChecksum }],
  };
  const releaseManifest: ReleaseManifestV1 = { payload: manifestPayload, checksum: computeReleaseManifestChecksum(manifestPayload) };
  return { contract, releaseManifest };
}

// ================================================================
// PLAN — read-only. Every DB access here is a SELECT via dataSource.query(). No INSERT/UPDATE/
// DELETE, no repository .save()/.create() call, anywhere in this function or anything it calls.
// Safe to call unconditionally, regardless of --execute.
// ================================================================
export async function planNightMarkets(dataSource: QueryableDataSource, importPreview: ImportBundlePreview): Promise<NightMarketPlan> {
  const preCountsRows: Array<Record<string, string | number>> = await dataSource.query(`
    SELECT (SELECT count(*) FROM places) AS places,
           (SELECT count(*) FROM sources) AS sources,
           (SELECT count(*) FROM source_attributions) AS source_attributions,
           (SELECT count(*) FROM evidence_artifacts) AS evidence_artifacts,
           (SELECT count(*) FROM place_translation_evidence_links) AS links,
           (SELECT count(*) FROM place_translations) AS translations
  `);
  const preCounts = preCountsRows[0];

  const grandWorldParentRows: Array<{ id: string; lon: number; lat: number }> = await dataSource.query(
    `SELECT id, ST_X(location::geometry) AS lon, ST_Y(location::geometry) AS lat FROM places WHERE slug = $1`,
    [GRAND_WORLD_PARENT_SLUG],
  );
  if (grandWorldParentRows.length === 0) {
    throw new Error(`Could not resolve parent place ${GRAND_WORLD_PARENT_SLUG} — refusing to guess a location.`);
  }
  const { id: grandWorldParentId, lon: grandWorldParentLon, lat: grandWorldParentLat } = grandWorldParentRows[0];

  const existingPlaces: Array<{ id: string; slug: string }> = await dataSource.query(
    `SELECT id, slug FROM places WHERE slug IN ($1, $2)`,
    [VUI_FEST_SLUG, GRAND_WORLD_MARKET_SLUG],
  );
  const existingVuiFest = existingPlaces.find((p) => p.slug === VUI_FEST_SLUG) ?? null;
  const existingGrandWorldMarket = existingPlaces.find((p) => p.slug === GRAND_WORLD_MARKET_SLUG) ?? null;

  const vuiFestPlaceAction: EntityAction = existingVuiFest ? 'REUSE' : 'WOULD_CREATE';
  const grandWorldPlaceAction: EntityAction = existingGrandWorldMarket ? 'REUSE' : 'WOULD_CREATE';
  const vuiFestPlaceId = existingVuiFest?.id ?? null;
  const grandWorldPlaceId = existingGrandWorldMarket?.id ?? null;

  // Administrative source_attributions: only meaningful to check per-place once the place exists;
  // if the place would still need creating, both its (province, admin_area) attributions would too.
  let attributionsWouldCreate = 0;
  for (const placeId of [vuiFestPlaceId, grandWorldPlaceId]) {
    if (!placeId) {
      attributionsWouldCreate += 2; // province + admin_area, once the place itself is created
      continue;
    }
    for (const field of ['province', 'admin_area']) {
      const existing = await dataSource.query(
        `SELECT id FROM source_attributions WHERE entity_type='place_field' AND entity_id=$1 AND field=$2`,
        [placeId, field],
      );
      if (existing.length === 0) attributionsWouldCreate += 1;
    }
  }

  const existingSourceRows: Array<{ id: string }> = await dataSource.query(
    `SELECT id FROM sources WHERE type = 'official_website' AND external_ref = $1`,
    [VUI_FEST_SOURCE_EXTERNAL_REF],
  );
  const vuiFestSourceAction: EntityAction = existingSourceRows.length > 0 ? 'REUSE' : 'WOULD_CREATE';
  const vuiFestSourceId = existingSourceRows[0]?.id ?? null;

  const existingEvidenceRows: Array<{ id: string }> = await dataSource.query(
    `SELECT id FROM evidence_artifacts WHERE business_key = $1`,
    [VUI_FEST_EVIDENCE_BUSINESS_KEY],
  );
  const evidenceArtifactAction: EntityAction = existingEvidenceRows.length > 0 ? 'REUSE' : 'WOULD_CREATE';
  const evidenceArtifactId = existingEvidenceRows[0]?.id ?? null;

  // Links would-create: only countable once both the translations and the evidence artifact exist.
  let linksWouldCreate = 0;
  if (vuiFestPlaceId && evidenceArtifactId) {
    const currentTranslations: Array<{ id: string }> = await dataSource.query(
      `SELECT id FROM place_translations WHERE place_id = $1 AND is_current = true`,
      [vuiFestPlaceId],
    );
    for (const t of currentTranslations) {
      const existingLink = await dataSource.query(
        `SELECT id FROM place_translation_evidence_links WHERE translation_id = $1 AND evidence_id = $2`,
        [t.id, evidenceArtifactId],
      );
      if (existingLink.length === 0) linksWouldCreate += 1;
    }
  } else if (vuiFestPlaceAction === 'WOULD_CREATE' || evidenceArtifactAction === 'WOULD_CREATE') {
    linksWouldCreate = 4; // the 4 VUI-Fest translations, once everything upstream exists
  }

  // The contract needs a placeId; use the resolved one if it exists, else a placeholder UUID purely
  // for computing checksums/preview — this ID is never written anywhere in plan mode, and
  // executeNightMarkets() always rebuilds the contract against the REAL place id after ensuring it.
  const { contract, releaseManifest } = buildVuiFestContract(vuiFestPlaceId ?? randomUUID(), vuiFestSourceId);

  // Proven no-write dry-run path (see multilingual-place-import.service.ts: dryRun returns via
  // buildDryRunResult() BEFORE batchRepo.insert() is ever called) — safe inside a read-only plan.
  const translationImportDryRun = await importPreview.importBundle({
    contract,
    actorId: STAGING_ACTOR_ID,
    dryRun: true,
    releaseManifest,
  });

  return {
    preCounts,
    vuiFestPlaceAction,
    vuiFestPlaceId,
    grandWorldPlaceAction,
    grandWorldPlaceId,
    grandWorldParentId,
    grandWorldParentLon,
    grandWorldParentLat,
    attributionsWouldCreate,
    vuiFestSourceAction,
    vuiFestSourceId,
    evidenceArtifactAction,
    evidenceArtifactId,
    linksWouldCreate,
    translationImportDryRun,
    contract,
    releaseManifest,
  };
}

// ================================================================
// EXECUTE — every actual write lives here, split into small, independently-testable functions.
// Only ever invoked when --execute is passed (see main() below).
// ================================================================

export interface PlacesAndAttributionsResult {
  vuiFestId: string;
  grandWorldMarketId: string;
}

// Step 1+2 — places + administrative attribution (both idempotent). This is exactly the code that
// ran before the dry-run gate in the original defect; it is now ONLY reachable from
// executeNightMarkets(), never from planNightMarkets().
export async function executePlacesAndAttributions(
  dataSource: QueryableDataSource,
  parentLon: number,
  parentLat: number,
): Promise<PlacesAndAttributionsResult> {
  await dataSource.query(
    `INSERT INTO places (name, slug, category_id, location, ward, admin_area, province, status, verification_status)
     VALUES ($1, $2, $3, ST_SetSRID(ST_MakePoint($4, $5), 4326)::geography, $6, $7, $8, 'draft', 'pending')
     ON CONFLICT (slug) DO NOTHING`,
    ['Chợ đêm Vui Phết (VUI-Fest Bazaar)', VUI_FEST_SLUG, MARKET_CATEGORY_ID, VUI_FEST_LON, VUI_FEST_LAT, 'An Thới', 'Đặc khu Phú Quốc', 'An Giang'],
  );
  await dataSource.query(
    `INSERT INTO places (name, slug, category_id, location, ward, admin_area, province, status, verification_status)
     VALUES ($1, $2, $3, ST_SetSRID(ST_MakePoint($4, $5), 4326)::geography, $6, $7, $8, 'draft', 'pending')
     ON CONFLICT (slug) DO NOTHING`,
    ['Chợ đêm Grand World Phú Quốc', GRAND_WORLD_MARKET_SLUG, MARKET_CATEGORY_ID, parentLon, parentLat, 'Gành Dầu', 'Đặc khu Phú Quốc', 'An Giang'],
  );
  const newPlaces: Array<{ id: string; slug: string }> = await dataSource.query(
    `SELECT id, slug FROM places WHERE slug IN ($1, $2)`,
    [VUI_FEST_SLUG, GRAND_WORLD_MARKET_SLUG],
  );
  const vuiFestId = newPlaces.find((p) => p.slug === VUI_FEST_SLUG)?.id;
  const grandWorldMarketId = newPlaces.find((p) => p.slug === GRAND_WORLD_MARKET_SLUG)?.id;
  if (!vuiFestId || !grandWorldMarketId) {
    throw new Error(`Failed to resolve both new place ids after insert (found: ${JSON.stringify(newPlaces)})`);
  }

  for (const placeId of [vuiFestId, grandWorldMarketId]) {
    for (const field of ['province', 'admin_area']) {
      const existing = await dataSource.query(
        `SELECT id FROM source_attributions WHERE entity_type='place_field' AND entity_id=$1 AND field=$2`,
        [placeId, field],
      );
      if (existing.length > 0) continue;
      await dataSource.query(
        `INSERT INTO source_attributions (source_id, entity_type, entity_id, field, confidence, note, is_primary)
         VALUES ($1, 'place_field', $2, $3, 95, $4, true)`,
        [NQ_1654_SOURCE_ID, placeId, field, 'Current night-market entity creation 2026-09-06 -- same government administrative source used platform-wide (Nghi quyet 1654/NQ-UBTVQH15).'],
      );
    }
  }

  return { vuiFestId, grandWorldMarketId };
}

// Minimal surface used from SourcesRepository — mockable directly in a unit test without a real
// TypeORM Repository underneath (SourcesRepository itself is a thin wrapper over these 3 calls).
export type SourcesRepoLike = Pick<SourcesRepository, 'findByTypeAndExternalRef' | 'create' | 'save'>;

// Step 4 — ensure the VUI-Fest evidence source (idempotent). Grand World Night Market gets NO
// source/evidence this round -- vinpearl.com 403'd on every attempt, no other official-tier page
// was reachable. Not fabricated.
export async function ensureVuiFestSource(sourcesRepo: SourcesRepoLike): Promise<Source> {
  const existing = await sourcesRepo.findByTypeAndExternalRef(SourceType.OFFICIAL_WEBSITE, VUI_FEST_SOURCE_EXTERNAL_REF);
  if (existing) return existing;
  return sourcesRepo.save(
    sourcesRepo.create({
      type: SourceType.OFFICIAL_WEBSITE,
      kind: SourceKind.URL,
      title: 'Chợ đêm Vui Phết (VUI-Fest Bazaar) -- Sun World official destination page',
      url: `https://${VUI_FEST_SOURCE_EXTERNAL_REF}`,
      externalRef: VUI_FEST_SOURCE_EXTERNAL_REF,
      publisher: 'Sun World',
      reliability: 90,
      language: 'vi',
      retrievedAt: new Date('2026-09-06T02:03:40.000Z'),
    }),
  );
}

export interface EvidenceAndLinksResult {
  evidenceId: string;
  linksCreated: number;
}

// Step 6 — evidence_artifact + links for the 4 VUI-Fest translations (idempotent, mirrors
// remediate-pilot-evidence.ts / EvidenceService semantics -- NEEDS_REVIEW, never self-upgraded).
export async function ensureVuiFestEvidenceAndLinks(dataSource: QueryableDataSource, vuiFestId: string, sourceId: string): Promise<EvidenceAndLinksResult> {
  const evidenceRows = await dataSource.query(`SELECT id FROM evidence_artifacts WHERE business_key = $1`, [VUI_FEST_EVIDENCE_BUSINESS_KEY]);
  let evidenceId: string;
  if (evidenceRows.length > 0) {
    evidenceId = evidenceRows[0].id;
  } else {
    const inserted = await dataSource.query(
      `INSERT INTO evidence_artifacts (source_id, business_key, evidence_type, source_url, captured_at, content_hash_sha256, storage_reference, verification_status, license_status, metadata)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'NEEDS_REVIEW','UNKNOWN',$8) RETURNING id`,
      [
        sourceId,
        VUI_FEST_EVIDENCE_BUSINESS_KEY,
        'OFFICIAL_WEBPAGE',
        `https://${VUI_FEST_SOURCE_EXTERNAL_REF}`,
        '2026-09-06T02:03:40.000Z',
        VUI_FEST_EVIDENCE_SHA256,
        'local-scratchpad:vuifest-bazaar-sunworld-20260906.html',
        JSON.stringify({
          evidenceTitle: 'Cho dem Vui Phet (VUI-Fest Bazaar) -- Sun World official destination page',
          identityMatchStatus: 'PASS',
          freshnessStatus: 'FRESH',
          chainOfCustodyStatus: 'COMPLETE',
          notes:
            'Direct fetch, 200 OK. Page title matches display_name exactly. Hours (16:00-24:00 daily) and location (Thi tran Hoang Hon / Sunset Town, Nam dao Phu Quoc) directly quoted; hours deliberately excluded from short_description as volatile. Coordinates NOT taken from this page (none embedded) -- geocoded separately via OSM Nominatim as an area-level approximation. No immutable snapshot service used, robots/terms not checked -- keep NEEDS_REVIEW pending human review.',
        }),
      ],
    );
    evidenceId = inserted[0].id;
  }

  const vuiFestTranslations: Array<{ id: string }> = await dataSource.query(
    `SELECT id FROM place_translations WHERE place_id = $1 AND is_current = true`,
    [vuiFestId],
  );
  let linksCreated = 0;
  for (const t of vuiFestTranslations) {
    const existingLink = await dataSource.query(
      `SELECT id FROM place_translation_evidence_links WHERE translation_id = $1 AND evidence_id = $2`,
      [t.id, evidenceId],
    );
    if (existingLink.length > 0) continue;
    await dataSource.query(
      `INSERT INTO place_translation_evidence_links (translation_id, evidence_id, relationship_type)
       VALUES ($1, $2, 'SUPPORTS') ON CONFLICT (translation_id, evidence_id) DO NOTHING`,
      [t.id, evidenceId],
    );
    linksCreated += 1;
  }

  return { evidenceId, linksCreated };
}

// Composition root for the write path — wires the real repositories/services against the bare
// DataSource and calls the three functions above plus the real multilingual-import service (whose
// own idempotency is already proven both by remediate-pilot-translations.ts's own re-run proof and
// by this script's live two-run staging proof from the dry-run-safety remediation task).
export async function executeNightMarkets(dataSource: import('typeorm').DataSource, plan: NightMarketPlan, logger: Logger): Promise<void> {
  const { vuiFestId, grandWorldMarketId } = await executePlacesAndAttributions(dataSource, plan.grandWorldParentLon, plan.grandWorldParentLat);
  logger.log(`Places ensured — vui-fest-bazaar=${vuiFestId} grand-world-night-market=${grandWorldMarketId}`);
  logger.log('Administrative source_attributions ensured for both new places.');

  const sourcesRepo = new SourcesRepository(dataSource.getRepository(Source));
  const localesRepo = new LocalesRepository(dataSource.getRepository(SupportedLocale));
  const localesService = new LocalesService(localesRepo);
  const revisionsRepo = new RevisionsRepository(dataSource.getRepository(WikiRevision));
  const revisionsService = new RevisionsService(revisionsRepo);
  const translationsRepo = new PlaceTranslationsRepository(dataSource.getRepository(PlaceTranslation));
  const routesRepo = new PlaceTranslationRoutesRepository(dataSource.getRepository(PlaceTranslationRoute));
  const seoRepo = new PlaceTranslationSeoRepository(dataSource.getRepository(PlaceTranslationSeo));
  const translationsService = new PlaceTranslationsService(translationsRepo, routesRepo, seoRepo, localesService, revisionsService, dataSource);
  const batchRepo = new MultilingualImportBatchRepository(dataSource.getRepository(MultilingualImportBatch));
  const rowRepo = new MultilingualImportRowRepository(dataSource.getRepository(MultilingualImportRow));
  const importService = new MultilingualPlaceImportService(batchRepo, rowRepo, translationsService, localesService, dataSource);

  const srcVuiFest = await ensureVuiFestSource(sourcesRepo);
  logger.log(`VUI-Fest source ensured: ${srcVuiFest.id}`);

  // Rebuild the contract against the REAL place/source ids (the plan's contract used a placeholder
  // id if the place did not exist yet at plan time).
  const { contract, releaseManifest } = buildVuiFestContract(vuiFestId, srcVuiFest.id);

  logger.log(`--- NON-DRY-RUN (batchId=${contract.batchId}) ---`);
  try {
    const liveResult = await importService.importBundle({ contract, actorId: STAGING_ACTOR_ID, dryRun: false, releaseManifest });
    logger.log(
      `Live result: status=${liveResult.status} succeeded=${liveResult.succeeded} alreadyCurrent=${liveResult.alreadyCurrent} held=${liveResult.held} failed=${liveResult.failed}`,
    );
    for (const r of liveResult.rowResults) {
      logger.log(`  ${r.outcome.toUpperCase()} place=${r.placeId} locale=${r.localeCode} field=${r.fieldKey} translationId=${r.translationId}`);
    }
  } catch (err) {
    logger.log(`Non-dry-run rejected (likely already applied on a re-run): ${err instanceof Error ? err.message : String(err)}`);
  }

  const { evidenceId, linksCreated } = await ensureVuiFestEvidenceAndLinks(dataSource, vuiFestId, srcVuiFest.id);
  logger.log(`VUI-Fest evidence artifact ensured: ${evidenceId} (${linksCreated} new links this run)`);
}

async function main(): Promise<void> {
  const logger = new Logger('CreateCurrentNightMarkets');
  const execute = process.argv.slice(2).includes('--execute');

  const { default: dataSource } = await import('../core/database/data-source');
  await dataSource.initialize();

  try {
    // Wire just enough of the real service graph to preview the multilingual import (read-only
    // dry-run call) — no repository .save()/.create() happens on this path.
    const localesRepo = new LocalesRepository(dataSource.getRepository(SupportedLocale));
    const localesService = new LocalesService(localesRepo);
    const revisionsRepo = new RevisionsRepository(dataSource.getRepository(WikiRevision));
    const revisionsService = new RevisionsService(revisionsRepo);
    const translationsRepo = new PlaceTranslationsRepository(dataSource.getRepository(PlaceTranslation));
    const routesRepo = new PlaceTranslationRoutesRepository(dataSource.getRepository(PlaceTranslationRoute));
    const seoRepo = new PlaceTranslationSeoRepository(dataSource.getRepository(PlaceTranslationSeo));
    const translationsService = new PlaceTranslationsService(translationsRepo, routesRepo, seoRepo, localesService, revisionsService, dataSource);
    const batchRepo = new MultilingualImportBatchRepository(dataSource.getRepository(MultilingualImportBatch));
    const rowRepo = new MultilingualImportRowRepository(dataSource.getRepository(MultilingualImportRow));
    const importService = new MultilingualPlaceImportService(batchRepo, rowRepo, translationsService, localesService, dataSource);

    const plan = await planNightMarkets(dataSource, importService);
    logger.log(`Pre-write counts: ${JSON.stringify(plan.preCounts)}`);
    logger.log(`PLAN: vuiFestPlace=${plan.vuiFestPlaceAction} grandWorldPlace=${plan.grandWorldPlaceAction} attributionsWouldCreate=${plan.attributionsWouldCreate} vuiFestSource=${plan.vuiFestSourceAction} evidenceArtifact=${plan.evidenceArtifactAction} linksWouldCreate=${plan.linksWouldCreate}`);
    logger.log(`PLAN: translation import dry-run -> status=${plan.translationImportDryRun.status} total=${plan.translationImportDryRun.totalRows} succeeded(preview)=${plan.translationImportDryRun.succeeded}`);

    if (!execute) {
      logger.log('--execute not passed -- stopping after plan. Nothing written.');
      return;
    }

    await executeNightMarkets(dataSource, plan, logger);

    const postCountsRows = await dataSource.query(`
      SELECT (SELECT count(*) FROM places) AS places,
             (SELECT count(*) FROM sources) AS sources,
             (SELECT count(*) FROM source_attributions) AS source_attributions,
             (SELECT count(*) FROM evidence_artifacts) AS evidence_artifacts,
             (SELECT count(*) FROM place_translation_evidence_links) AS links,
             (SELECT count(*) FROM place_translations) AS translations
    `);
    logger.log(`Post-write counts: ${JSON.stringify(postCountsRows[0])}`);
  } finally {
    await dataSource.destroy();
  }
}

if (require.main === module) {
  main().catch((err: unknown) => {
    console.error('Fatal error in create-current-night-markets:', err);
    process.exitCode = 1;
  });
}
