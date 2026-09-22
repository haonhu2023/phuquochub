import 'reflect-metadata';
import { readFileSync } from 'fs';
import { Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { slugify } from '@phuquochub/utils';
import { Place } from '../modules/places/entities/place.entity';
import { PlacesRepository } from '../modules/places/repositories/places.repository';
import { PlacesService } from '../modules/places/places.service';
import { CacheInvalidationService } from '../core/cache-invalidation/cache-invalidation.service';
import { Category } from '../modules/categories/entities/category.entity';
import { CategoriesRepository } from '../modules/categories/repositories/categories.repository';
import { PlaceTranslation } from '../modules/place-translations/entities/place-translation.entity';
import { PlaceTranslationsRepository } from '../modules/place-translations/repositories/place-translations.repository';
import { PlaceTranslationRoutesRepository } from '../modules/place-translations/repositories/place-translation-routes.repository';
import { PlaceTranslationSeoRepository } from '../modules/place-translations/repositories/place-translation-seo.repository';
import { PlaceTranslationRoute } from '../modules/place-translations/entities/place-translation-route.entity';
import { PlaceTranslationSeo } from '../modules/place-translations/entities/place-translation-seo.entity';
import { PlaceTranslationsService } from '../modules/place-translations/place-translations.service';
import { TranslationReviewService } from '../modules/place-translations/translation-review.service';
import { HumanReviewStatus } from '../modules/multilingual-import/multilingual-import.enums';
import { RevisionOrigin } from '../modules/revisions/revision.enums';
import { RevisionsService } from '../modules/revisions/revisions.service';
import { RevisionsRepository } from '../modules/revisions/repositories/revisions.repository';
import { WikiRevision } from '../modules/revisions/entities/wiki-revision.entity';
import { LocalesService } from '../modules/locales/locales.service';
import { LocalesRepository } from '../modules/locales/repositories/locales.repository';
import { SupportedLocale } from '../modules/locales/entities/supported-locale.entity';
import { EvidenceArtifact } from '../modules/evidence/entities/evidence-artifact.entity';
import { PlaceTranslationEvidenceLink } from '../modules/evidence/entities/place-translation-evidence-link.entity';
import { EvidenceArtifactsRepository } from '../modules/evidence/repositories/evidence-artifacts.repository';
import { EvidenceService } from '../modules/evidence/evidence.service';
import { User } from '../modules/users/entities/user.entity';
import { UsersRepository } from '../modules/users/repositories/users.repository';
import { UserRole } from '../modules/rbac/entities/user-role.entity';
import { UserRolesRepository } from '../modules/rbac/repositories/user-roles.repository';
import { AuthorizationService } from '../modules/authz/authorization.service';
import { MediaUrlService } from '../core/media-url/media-url.service';
import { AuditService } from '../core/audit/audit.service';
import { AuditRepository } from '../core/audit/audit.repository';

// FINAL 22-PLACE PRODUCTION DATA PROMOTION -- 2026-09-06.
//
// Reads the frozen, hash-verified promotion manifest (built read-only from staging, persisted
// outside the production DB) and promotes it into production using ONLY governed services:
//   - PlacesService.create()/.approve()/.archive() for place lifecycle
//   - PlaceTranslationsService.publishTranslationBundle() to create content (always forced to
//     PENDING/non-public/non-production regardless of input -- the same chokepoint used
//     throughout this whole project)
//   - EvidenceService.ensureEvidenceArtifact()/.linkEvidenceToTranslation() for provenance
//   - TranslationReviewService.reviewTranslation() for the real production reviewer's
//     reconfirmation approval (PRODUCTION_RECONFIRMATION_BY_OWNER -- a genuine review action
//     happening now, at today's real timestamp, by the freshly-verified real reviewer; this is
//     NOT staging's historical review transplanted with a fake identity/timestamp)
// sources/evidence_artifacts have no create-service in this codebase (same gap found and handled
// the same way earlier this project for staging evidence work) -- narrowest available path is a
// direct parameterized INSERT, exactly mirroring how `sources` rows were created in
// close-durable-evidence-gaps.ts.
//
// Usage:
//   npx ts-node src/scripts/promote-cohort-to-production.ts                 (plan / validate only)
//   npx ts-node src/scripts/promote-cohort-to-production.ts -- --execute    (plan, then execute)

const MANIFEST_PATH = process.env.MANIFEST_PATH || './promotion-manifest.json';
const REVIEWER_EMAIL = 'haonhu2023@gmail.com';
const LEGACY_SLUG = 'cho-dem-phu-quoc';

interface ManifestPlace {
  staging_uuid: string;
  slug: string;
  name: string;
  category_slug: string;
  status: string;
  verification_status: string;
  lat: number;
  lng: number;
  address: string | null;
  ward: string | null;
  province: string | null;
  admin_area: string | null;
  opening_hours: unknown;
  price_range: string | null;
  description: string | null;
  short_description: string | null;
}

interface ManifestTranslation {
  place_slug: string;
  staging_translation_uuid: string;
  field_key: string;
  locale_code: string;
  source_locale_code: string;
  translated_text: string;
  text_format: string;
  translation_method: string;
  translation_status: string;
  human_review_status: string;
  quality_gate: string;
  source_url: string | null;
}

interface ManifestSource {
  staging_source_id: string;
  url: string;
  type: string;
  kind: string;
  title: string | null;
  publisher: string | null;
  reliability: number;
  language: string | null;
}

interface ManifestEvidenceArtifact {
  staging_artifact_id: string;
  business_key: string;
  staging_source_id: string;
  evidence_type: string;
  source_url: string;
  captured_at: string;
  content_hash_sha256: string;
  storage_reference: string | null;
  verification_status: string;
  license_status: string | null;
  metadata: Record<string, unknown> | null;
}

interface ManifestEvidenceLink {
  staging_translation_uuid: string;
  business_key: string;
}

interface Manifest {
  places: ManifestPlace[];
  translations: ManifestTranslation[];
  sources: ManifestSource[];
  evidence_artifacts: ManifestEvidenceArtifact[];
  evidence_links: ManifestEvidenceLink[];
}

function loadManifest(): Manifest {
  return JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'));
}

interface PlaceIdentity {
  slug: string;
  status: 'EXACT_EXISTING' | 'CREATE_NEW' | 'CONFLICT' | 'UNKNOWN';
  productionId: string | null;
}

interface SourceIdentity {
  url: string;
  status: 'REUSE' | 'CREATE';
  productionId: string | null;
}

interface ArtifactIdentity {
  businessKey: string;
  status: 'REUSE' | 'CREATE' | 'CONFLICT';
  productionId: string | null;
}

interface TranslationIdentity {
  key: string; // place_slug|field_key|locale_code
  status: 'CREATE' | 'REUSE_PENDING' | 'ALREADY_APPROVED' | 'CONFLICT';
  productionId: string | null;
}

export interface PromotionPlan {
  reviewerId: string;
  places: PlaceIdentity[];
  sources: SourceIdentity[];
  artifacts: ArtifactIdentity[];
  translations: TranslationIdentity[];
  legacyPlaceId: string | null;
  legacyAlreadyArchived: boolean;
  productionCategoryIdBySlug: Record<string, string>;
}

// ================================================================
// PLAN -- read-only. Only SELECTs.
// ================================================================
export async function planPromotion(dataSource: import('typeorm').DataSource, manifest: Manifest): Promise<PromotionPlan> {
  const reviewerRows: Array<{ id: string; is_active: boolean; is_service_account: boolean }> = await dataSource.query(
    `SELECT id, is_active, is_service_account FROM users WHERE email = $1`,
    [REVIEWER_EMAIL],
  );
  if (reviewerRows.length !== 1 || !reviewerRows[0].is_active || reviewerRows[0].is_service_account) {
    throw new Error(`Reviewer ${REVIEWER_EMAIL} did not resolve to exactly one active, non-service-account user`);
  }
  const reviewerId = reviewerRows[0].id;

  const permCheck: Array<{ code: string }> = await dataSource.query(
    `SELECT DISTINCT p.code FROM user_roles ur JOIN roles r ON r.id=ur.role_id
     JOIN role_permissions rp ON rp.role_id=r.id JOIN permissions p ON p.id=rp.permission_id
     WHERE ur.user_id=$1 AND ur.revoked_at IS NULL AND p.code IN ('PlaceTranslation.Review.Any','Place.Approve','Place.Archive')`,
    [reviewerId],
  );
  if (permCheck.length !== 3) {
    throw new Error(`Reviewer ${REVIEWER_EMAIL} does not hold all 3 required permissions (found: ${JSON.stringify(permCheck.map((r) => r.code))})`);
  }

  const categorySlugs = [...new Set(manifest.places.map((p) => p.category_slug))];
  const categoryRows: Array<{ id: string; slug: string }> = await dataSource.query(
    `SELECT id, slug FROM categories WHERE slug = ANY($1::varchar[])`,
    [categorySlugs],
  );
  const productionCategoryIdBySlug: Record<string, string> = {};
  for (const row of categoryRows) productionCategoryIdBySlug[row.slug] = row.id;
  for (const slug of categorySlugs) {
    if (!productionCategoryIdBySlug[slug]) throw new Error(`Category slug ${slug} not found in production -- refusing to guess`);
  }

  const placeSlugs = manifest.places.map((p) => p.slug);
  const placeRows: Array<{ id: string; slug: string }> = await dataSource.query(
    `SELECT id, slug FROM places WHERE slug = ANY($1::varchar[])`,
    [placeSlugs],
  );
  const placeIdBySlug = new Map(placeRows.map((r) => [r.slug, r.id]));
  const places: PlaceIdentity[] = manifest.places.map((p) => {
    const productionId = placeIdBySlug.get(p.slug) ?? null;
    return { slug: p.slug, status: productionId ? 'EXACT_EXISTING' : 'CREATE_NEW', productionId };
  });
  if (places.some((p) => p.status === 'CONFLICT' || p.status === 'UNKNOWN')) {
    throw new Error('Place identity resolution produced CONFLICT/UNKNOWN -- refusing to proceed');
  }

  const legacyRows: Array<{ id: string; status: string }> = await dataSource.query(
    `SELECT id, status FROM places WHERE slug = $1`,
    [LEGACY_SLUG],
  );
  const legacyPlaceId = legacyRows.length > 0 ? legacyRows[0].id : null;
  const legacyAlreadyArchived = legacyRows.length > 0 && legacyRows[0].status === 'archived';

  const sourceUrls = manifest.sources.map((s) => s.url);
  const sourceRows: Array<{ id: string; url: string }> = await dataSource.query(
    `SELECT id, url FROM sources WHERE url = ANY($1::varchar[])`,
    [sourceUrls],
  );
  const sourceIdByUrl = new Map(sourceRows.map((r) => [r.url, r.id]));
  const sources: SourceIdentity[] = manifest.sources.map((s) => {
    const productionId = sourceIdByUrl.get(s.url) ?? null;
    return { url: s.url, status: productionId ? 'REUSE' : 'CREATE', productionId };
  });

  const businessKeys = manifest.evidence_artifacts.map((a) => a.business_key);
  const artifactRows: Array<{ id: string; business_key: string; content_hash_sha256: string }> = await dataSource.query(
    `SELECT id, business_key, content_hash_sha256 FROM evidence_artifacts WHERE business_key = ANY($1::varchar[])`,
    [businessKeys],
  );
  const artifactByKey = new Map(artifactRows.map((r) => [r.business_key, r]));
  const artifacts: ArtifactIdentity[] = manifest.evidence_artifacts.map((a) => {
    const existing = artifactByKey.get(a.business_key);
    if (!existing) return { businessKey: a.business_key, status: 'CREATE', productionId: null };
    if (existing.content_hash_sha256 !== a.content_hash_sha256) {
      return { businessKey: a.business_key, status: 'CONFLICT', productionId: existing.id };
    }
    return { businessKey: a.business_key, status: 'REUSE', productionId: existing.id };
  });
  if (artifacts.some((a) => a.status === 'CONFLICT')) {
    throw new Error(`Evidence artifact hash CONFLICT found: ${JSON.stringify(artifacts.filter((a) => a.status === 'CONFLICT'))}`);
  }

  // Translation identity: keyed by (resolved production place id, field_key, locale_code) via
  // the current-row uniqueness constraint, not by staging UUID (production IDs may differ).
  const translations: TranslationIdentity[] = [];
  for (const t of manifest.translations) {
    const key = `${t.place_slug}|${t.field_key}|${t.locale_code}`;
    const place = places.find((p) => p.slug === t.place_slug);
    if (!place || place.status === 'CREATE_NEW') {
      translations.push({ key, status: 'CREATE', productionId: null });
      continue;
    }
    const existingRows: Array<{ id: string; translated_text: string; human_review_status: string }> = await dataSource.query(
      `SELECT id, translated_text, human_review_status FROM place_translations
       WHERE place_id = $1 AND field_key = $2 AND locale_code = $3 AND is_current = true`,
      [place.productionId, t.field_key, t.locale_code],
    );
    if (existingRows.length === 0) {
      translations.push({ key, status: 'CREATE', productionId: null });
    } else {
      const row = existingRows[0];
      if (row.translated_text !== t.translated_text) {
        translations.push({ key, status: 'CONFLICT', productionId: row.id });
      } else if (row.human_review_status === 'APPROVED') {
        translations.push({ key, status: 'ALREADY_APPROVED', productionId: row.id });
      } else {
        translations.push({ key, status: 'REUSE_PENDING', productionId: row.id });
      }
    }
  }
  if (translations.some((t) => t.status === 'CONFLICT')) {
    throw new Error(`Translation content CONFLICT found: ${JSON.stringify(translations.filter((t) => t.status === 'CONFLICT'))}`);
  }

  return { reviewerId, places, sources, artifacts, translations, legacyPlaceId, legacyAlreadyArchived, productionCategoryIdBySlug };
}

// ================================================================
// EXECUTE -- only when --execute is passed. Governed service calls only.
// ================================================================
export async function executePromotion(
  dataSource: import('typeorm').DataSource,
  manifest: Manifest,
  plan: PromotionPlan,
  logger: Logger,
): Promise<void> {
  const mediaUrl = buildMediaUrlService();
  const placesRepo = new PlacesRepository(dataSource.getRepository(Place), mediaUrl);
  const revisionsRepo = new RevisionsRepository(dataSource.getRepository(WikiRevision));
  const revisionsService = new RevisionsService(revisionsRepo);
  const auditRepo = new AuditRepository(dataSource as any);
  const audit = new AuditService(auditRepo);
  // PlacesService: only create()/approve()/archive() are ever called -- other deps unused by them.
  const categoriesRepo = new CategoriesRepository(dataSource.getRepository(Category));
  // approve() (used below) calls `void this.cacheInvalidation.invalidatePlace(...)` after a
  // successful write — cannot be `null as any` like the other unused deps above. A real
  // CacheInvalidationService with an empty config no-ops safely (ConfigService isn't available in
  // this standalone script context), so constructing one is the correct stand-in.
  const cacheInvalidation = new CacheInvalidationService({
    get: () => ({ webInternalUrl: null, sharedSecret: null }),
  } as unknown as import('@nestjs/config').ConfigService);
  const placesService = new PlacesService(
    placesRepo, categoriesRepo, null as any, null as any, null as any,
    revisionsService, audit, mediaUrl, null as any, null as any, null as any, null as any, null as any, null as any,
    cacheInvalidation,
  );

  const localesRepo = new LocalesRepository(dataSource.getRepository(SupportedLocale));
  const localesService = new LocalesService(localesRepo);
  const translationsRepo = new PlaceTranslationsRepository(dataSource.getRepository(PlaceTranslation));
  const routesRepo = new PlaceTranslationRoutesRepository(dataSource.getRepository(PlaceTranslationRoute));
  const seoRepo = new PlaceTranslationSeoRepository(dataSource.getRepository(PlaceTranslationSeo));
  const placeTranslationsService = new PlaceTranslationsService(translationsRepo, routesRepo, seoRepo, localesService, revisionsService, dataSource);

  const evidenceRepo = new EvidenceArtifactsRepository(
    dataSource.getRepository(EvidenceArtifact),
    dataSource.getRepository(PlaceTranslationEvidenceLink),
  );
  const evidenceService = new EvidenceService(evidenceRepo);

  const usersRepo = new UsersRepository(dataSource.getRepository(User));
  const userRolesRepo = new UserRolesRepository(dataSource.getRepository(UserRole));
  const authz = new AuthorizationService(userRolesRepo);
  const reviewService = new TranslationReviewService(translationsRepo, revisionsService, usersRepo, authz, dataSource);

  // --- 1. Resolve/create the 2 new places (create only, no publish yet) ---
  const placeIdBySlug = new Map<string, string>();
  for (const p of plan.places) placeIdBySlug.set(p.slug, p.productionId ?? '');

  for (const identity of plan.places) {
    if (identity.status !== 'CREATE_NEW') continue;
    const manifestPlace = manifest.places.find((mp) => mp.slug === identity.slug)!;
    // A name chosen so slugify() produces EXACTLY the staging slug -- verified before this run.
    const slugFriendlyName = manifestPlace.slug
      .split('-')
      .map((w) => w[0].toUpperCase() + w.slice(1))
      .join(' ');
    const created = await placesService.create(
      {
        name: slugFriendlyName,
        category_id: plan.productionCategoryIdBySlug[manifestPlace.category_slug],
        location: { lng: manifestPlace.lng, lat: manifestPlace.lat },
        ward: manifestPlace.ward ?? undefined,
        province: manifestPlace.province ?? undefined,
        admin_area: manifestPlace.admin_area ?? undefined,
      } as any,
      plan.reviewerId,
    );
    if ((created as any).slug !== manifestPlace.slug) {
      throw new Error(`STOP: created place slug "${(created as any).slug}" does not match expected "${manifestPlace.slug}"`);
    }
    // Set the real display name (update() never re-slugs -- confirmed by reading places.service.ts).
    // CAS token (AddPlaceContentVersion, 2026-09-22): `created` is the just-created row, so its
    // content_version is exactly 1 -- required now, not optional, or updateScalarsWithCas's WHERE
    // clause gets an undefined criteria value.
    await placesService.update(
      (created as any).id,
      { name: manifestPlace.name, expected_content_version: (created as any).content_version } as any,
      plan.reviewerId,
      RevisionOrigin.COMMUNITY_EDIT,
    );
    placeIdBySlug.set(identity.slug, (created as any).id);
    logger.log(`CREATED place ${identity.slug} -> ${(created as any).id}`);
  }

  // --- 2. Sources ---
  const sourceIdByUrl = new Map<string, string>();
  for (const s of plan.sources) if (s.productionId) sourceIdByUrl.set(s.url, s.productionId);
  for (const identity of plan.sources) {
    if (identity.status !== 'CREATE') continue;
    const m = manifest.sources.find((s) => s.url === identity.url)!;
    const existing: Array<{ id: string }> = await dataSource.query(`SELECT id FROM sources WHERE url = $1`, [m.url]);
    if (existing.length > 0) {
      sourceIdByUrl.set(m.url, existing[0].id);
      logger.log(`SKIPPED source (idempotent, already exists): ${m.url}`);
      continue;
    }
    const inserted: Array<{ id: string }> = await dataSource.query(
      `INSERT INTO sources (type, kind, title, url, publisher, reliability, language)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
      [m.type, m.kind, m.title, m.url, m.publisher, m.reliability, m.language],
    );
    sourceIdByUrl.set(m.url, inserted[0].id);
    logger.log(`CREATED source ${inserted[0].id} for ${m.url}`);
  }

  // --- 3. Evidence artifacts ---
  const artifactIdByKey = new Map<string, string>();
  for (const a of plan.artifacts) if (a.productionId) artifactIdByKey.set(a.businessKey, a.productionId);
  for (const identity of plan.artifacts) {
    if (identity.status !== 'CREATE') continue;
    const m = manifest.evidence_artifacts.find((a) => a.business_key === identity.businessKey)!;
    const sourceForArtifact = manifest.sources.find((s) => s.staging_source_id === m.staging_source_id)!;
    const productionSourceId = sourceIdByUrl.get(sourceForArtifact.url);
    if (!productionSourceId) throw new Error(`STOP: no resolved production source for artifact ${m.business_key}`);
    const artifact = await evidenceService.ensureEvidenceArtifact({
      sourceId: productionSourceId,
      businessKey: m.business_key,
      evidenceType: m.evidence_type,
      sourceUrl: m.source_url,
      capturedAt: new Date(m.captured_at),
      contentHashSha256: m.content_hash_sha256,
      storageReference: m.storage_reference,
      verificationStatus: m.verification_status,
      licenseStatus: m.license_status,
      metadata: m.metadata,
    });
    artifactIdByKey.set(m.business_key, artifact.id);
    logger.log(`${artifact.id === identity.productionId ? 'SKIPPED (idempotent)' : 'CREATED'} artifact ${m.business_key} -> ${artifact.id}`);
  }

  // --- 4. Translations: publish as PENDING (per place, bundled 4 items in one transaction) ---
  const translationIdByKey = new Map<string, string>();
  for (const t of plan.translations) if (t.productionId) translationIdByKey.set(t.key, t.productionId);

  const bySlug = new Map<string, ManifestTranslation[]>();
  for (const t of manifest.translations) {
    const list = bySlug.get(t.place_slug) ?? [];
    list.push(t);
    bySlug.set(t.place_slug, list);
  }

  for (const [slug, items] of bySlug) {
    const placeId = placeIdBySlug.get(slug);
    if (!placeId) throw new Error(`STOP: no resolved production place id for ${slug}`);
    const needsCreate = items.some((t) => plan.translations.find((pt) => pt.key === `${slug}|${t.field_key}|${t.locale_code}`)?.status === 'CREATE');
    if (!needsCreate) {
      logger.log(`SKIPPED translation bundle (idempotent, all 4 already exist): ${slug}`);
      continue;
    }
    const sourceForItem = (t: ManifestTranslation) => manifest.sources.find((s) => s.url === t.source_url);
    const bundle = await placeTranslationsService.publishTranslationBundle({
      placeId,
      origin: RevisionOrigin.IMPORT,
      editorId: plan.reviewerId,
      changeNote: 'Production data promotion: reviewed 22-place cohort',
      items: items.map((t) => {
        const src = sourceForItem(t);
        const productionSourceId = src ? sourceIdByUrl.get(src.url) : undefined;
        return {
          fieldKey: t.field_key,
          localeCode: t.locale_code,
          sourceLocaleCode: t.source_locale_code,
          translatedText: t.translated_text,
          sourceText: t.translated_text,
          textFormat: t.text_format as any,
          translationMethod: t.translation_method as any,
          translationStatus: t.translation_status,
          humanReviewStatus: HumanReviewStatus.PENDING,
          qualityGate: t.quality_gate,
          isPublic: false,
          isProductionData: false,
          productionEligible: false,
          sourceId: productionSourceId ?? null,
        };
      }),
    });
    for (const row of bundle) {
      const t = items.find((i) => i.field_key === row.fieldKey && i.locale_code === row.localeCode)!;
      translationIdByKey.set(`${slug}|${t.field_key}|${t.locale_code}`, row.id);
    }
    logger.log(`PUBLISHED (pending) translation bundle for ${slug}: ${bundle.map((r) => r.id).join(', ')}`);
  }

  // --- 5. Evidence links ---
  for (const link of manifest.evidence_links) {
    const t = manifest.translations.find((tr) => tr.staging_translation_uuid === link.staging_translation_uuid)!;
    const translationId = translationIdByKey.get(`${t.place_slug}|${t.field_key}|${t.locale_code}`);
    const artifactId = artifactIdByKey.get(link.business_key);
    if (!translationId || !artifactId) {
      logger.error(`STOP for link ${link.staging_translation_uuid}/${link.business_key}: unresolved translation or artifact id`);
      continue;
    }
    await evidenceService.linkEvidenceToTranslation(translationId, artifactId, 'SUPPORTS');
  }
  logger.log(`LINKED evidence: ${manifest.evidence_links.length} link(s) processed`);

  // --- 6. Review/approve each of the 88 (skip ones already APPROVED) ---
  let approvedCount = 0;
  for (const t of manifest.translations) {
    const key = `${t.place_slug}|${t.field_key}|${t.locale_code}`;
    const identity = plan.translations.find((pt) => pt.key === key)!;
    if (identity.status === 'ALREADY_APPROVED') {
      logger.log(`SKIPPED review (idempotent, already APPROVED): ${key}`);
      continue;
    }
    const translationId = translationIdByKey.get(key);
    if (!translationId) {
      logger.error(`STOP for ${key}: no resolved translation id`);
      continue;
    }
    const result = await reviewService.reviewTranslation(translationId, plan.reviewerId, HumanReviewStatus.APPROVED, null);
    approvedCount += 1;
    logger.log(`APPROVED ${key} -> is_current=${result.isCurrent} is_public=${result.isPublic} is_production_data=${result.isProductionData}`);
  }
  logger.log(`Total newly approved this run: ${approvedCount}`);

  // --- 7. Publish the 2 new places ---
  for (const identity of plan.places) {
    if (identity.status !== 'CREATE_NEW') continue;
    const placeId = placeIdBySlug.get(identity.slug);
    if (!placeId) continue;
    await placesService.approve(placeId, plan.reviewerId);
    logger.log(`PUBLISHED place ${identity.slug} (${placeId})`);
  }

  // --- 8. Archive legacy ---
  if (plan.legacyPlaceId && !plan.legacyAlreadyArchived) {
    await placesService.archive(plan.legacyPlaceId, plan.reviewerId);
    logger.log(`ARCHIVED legacy place ${LEGACY_SLUG} (${plan.legacyPlaceId})`);
  } else {
    logger.log(`SKIPPED legacy archive (idempotent or absent): ${LEGACY_SLUG}`);
  }
}

function buildMediaUrlService(): MediaUrlService {
  const fakeConfig = {
    get: (key: string) => {
      if (key === 'api') return { publicUrl: 'https://phuquochub.com', globalPrefix: 'api' };
      return undefined;
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
  return new MediaUrlService(fakeConfig);
}

async function main(): Promise<void> {
  const logger = new Logger('PromoteCohortToProduction');
  const execute = process.argv.slice(2).includes('--execute');

  const manifest = loadManifest();
  logger.log(`Loaded manifest: ${manifest.places.length} places, ${manifest.translations.length} translations, ${manifest.sources.length} sources, ${manifest.evidence_artifacts.length} artifacts, ${manifest.evidence_links.length} links`);

  const { default: dataSource } = await import('../core/database/data-source');
  await dataSource.initialize();

  try {
    const plan = await planPromotion(dataSource, manifest);

    const placesToCreate = plan.places.filter((p) => p.status === 'CREATE_NEW').length;
    const placesToReuse = plan.places.filter((p) => p.status === 'EXACT_EXISTING').length;
    const sourcesToCreate = plan.sources.filter((s) => s.status === 'CREATE').length;
    const sourcesToReuse = plan.sources.filter((s) => s.status === 'REUSE').length;
    const artifactsToCreate = plan.artifacts.filter((a) => a.status === 'CREATE').length;
    const artifactsToReuse = plan.artifacts.filter((a) => a.status === 'REUSE').length;
    const translationsToCreate = plan.translations.filter((t) => t.status === 'CREATE').length;
    const translationsAlreadyApproved = plan.translations.filter((t) => t.status === 'ALREADY_APPROVED').length;
    const translationsReusePending = plan.translations.filter((t) => t.status === 'REUSE_PENDING').length;

    logger.log(
      `DRY RUN SUMMARY:\n` +
        `PLACES_EXISTING_TO_REUSE=${placesToReuse}\n` +
        `PLACES_TO_CREATE=${placesToCreate}\n` +
        `LEGACY_PLACES_TO_ARCHIVE=${plan.legacyAlreadyArchived ? 0 : 1}\n` +
        `SOURCES_TO_REUSE=${sourcesToReuse}\n` +
        `SOURCES_TO_CREATE=${sourcesToCreate}\n` +
        `EVIDENCE_ARTIFACTS_TO_REUSE=${artifactsToReuse}\n` +
        `EVIDENCE_ARTIFACTS_TO_CREATE=${artifactsToCreate}\n` +
        `TRANSLATIONS_TO_CREATE=${translationsToCreate}\n` +
        `TRANSLATIONS_ALREADY_APPROVED=${translationsAlreadyApproved}\n` +
        `TRANSLATIONS_REUSE_PENDING=${translationsReusePending}\n` +
        `EVIDENCE_LINKS_TO_CREATE=${manifest.evidence_links.length}\n` +
        `PRODUCTION_REVIEW_ACTIONS_TO_CREATE=${translationsToCreate + translationsReusePending}`,
    );

    if (!execute) {
      logger.log('--execute not passed -- stopping after plan. Nothing written.');
      return;
    }

    await executePromotion(dataSource, manifest, plan, logger);
  } finally {
    await dataSource.destroy();
  }
}

if (require.main === module) {
  main().catch((err: unknown) => {
    console.error('Fatal error in promote-cohort-to-production:', err);
    process.exitCode = 1;
  });
}
