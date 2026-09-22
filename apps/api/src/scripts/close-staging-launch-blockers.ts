import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { Place } from '../modules/places/entities/place.entity';
import { PlacesRepository } from '../modules/places/repositories/places.repository';
import { PlacesService } from '../modules/places/places.service';
import { CacheInvalidationService } from '../core/cache-invalidation/cache-invalidation.service';
import { MediaUrlService } from '../core/media-url/media-url.service';
import { AuditService } from '../core/audit/audit.service';
import { AuditRepository } from '../core/audit/audit.repository';
import { PlaceStatus } from '../modules/places/place.enums';
import { QueryableDataSource } from './create-current-night-markets';

// STAGING LAUNCH BLOCKER CLOSURE -- 2026-09-06.
//
// Publishes vui-fest-bazaar and grand-world-night-market (both fully translation-approved but
// still place-level draft/pending -- the P0 found in the prior technical-readiness audit) and
// excludes the legacy cho-dem-phu-quoc from public reads/sitemap WITHOUT deleting its row, using
// the project's REAL governed place-lifecycle service (PlacesService.approve()/.archive()) --
// never raw UPDATE places SET status=... The service methods themselves don't re-check permission
// (that's enforced by the controller's @RequirePermissions guard, which this script bypasses), so
// the actor's Place.Approve/Place.Archive grant is independently verified in the PLAN phase before
// EXECUTE ever calls them, same discipline as TranslationReviewService's actor check elsewhere in
// this project.
//
// archive() sets BOTH status='archived' AND deleted_at=now() (confirmed by reading
// PlacesRepository.archive()) -- this is the project's one existing non-public lifecycle state
// beyond draft/pending, already used elsewhere, not invented here. deleted_at is a soft-delete
// FLAG (excluded from public/list queries), not physical deletion -- the row, its translations,
// evidence links and history remain fully intact and queryable.
//
// Usage:
//   npx ts-node src/scripts/close-staging-launch-blockers.ts                 (plan / validate only)
//   npx ts-node src/scripts/close-staging-launch-blockers.ts -- --execute    (plan, then execute)

const ACTOR_ID = 'ff84ee07-a7c1-4d2a-bf98-7ea8a37d4770'; // verified: active, non-service-account, holds Place.Approve + Place.Archive

const PUBLISH_SLUGS = ['vui-fest-bazaar', 'grand-world-night-market'];
const UNPUBLISH_SLUG = 'cho-dem-phu-quoc';

export interface PlaceRowValidation {
  slug: string;
  id: string | null;
  currentStatus: string | null;
  valid: boolean;
  reason?: string;
}

export interface ClosurePlan {
  actorId: string;
  actorPermissionsVerified: string[];
  publishTargets: PlaceRowValidation[];
  unpublishTarget: PlaceRowValidation;
}

// ================================================================
// PLAN -- read-only. Only SELECTs. No DB writes.
// ================================================================
export async function planClosure(dataSource: QueryableDataSource): Promise<ClosurePlan> {
  const permRows: Array<{ code: string }> = await dataSource.query(
    `SELECT DISTINCT p.code
     FROM user_roles ur JOIN roles r ON r.id = ur.role_id
     JOIN role_permissions rp ON rp.role_id = r.id JOIN permissions p ON p.id = rp.permission_id
     JOIN users u ON u.id = ur.user_id
     WHERE ur.user_id = $1 AND ur.revoked_at IS NULL AND u.is_active = true AND u.is_service_account = false
       AND p.code IN ('Place.Approve', 'Place.Archive')`,
    [ACTOR_ID],
  );
  const actorPermissionsVerified = permRows.map((r) => r.code);
  if (!actorPermissionsVerified.includes('Place.Approve') || !actorPermissionsVerified.includes('Place.Archive')) {
    throw new Error(
      `Actor ${ACTOR_ID} does not hold both Place.Approve and Place.Archive (found: ${JSON.stringify(actorPermissionsVerified)}) -- refusing to substitute another actor.`,
    );
  }

  const placeRows: Array<{ id: string; slug: string; status: string }> = await dataSource.query(
    `SELECT id, slug, status FROM places WHERE slug = ANY($1::varchar[]) AND deleted_at IS NULL`,
    [[...PUBLISH_SLUGS, UNPUBLISH_SLUG]],
  );
  const bySlug = new Map(placeRows.map((r) => [r.slug, r]));

  const publishTargets: PlaceRowValidation[] = [];
  for (const slug of PUBLISH_SLUGS) {
    const row = bySlug.get(slug);
    if (!row) {
      publishTargets.push({ slug, id: null, currentStatus: null, valid: false, reason: 'place not found' });
      continue;
    }
    const translationRows: Array<{
      id: string;
      field_key: string;
      locale_code: string;
      human_review_status: string;
      is_public: boolean;
      is_production_data: boolean;
      link_count: string;
    }> = await dataSource.query(
      `SELECT pt.id, pt.field_key, pt.locale_code, pt.human_review_status, pt.is_public, pt.is_production_data,
              (SELECT count(*) FROM place_translation_evidence_links l WHERE l.translation_id = pt.id) AS link_count
       FROM place_translations pt WHERE pt.place_id = $1 AND pt.is_current = true`,
      [row.id],
    );
    let reason: string | undefined;
    if (translationRows.length !== 4) reason = `expected 4 current translations, found ${translationRows.length}`;
    else if (translationRows.some((t) => t.human_review_status !== 'APPROVED')) reason = 'not all current translations are APPROVED';
    else if (translationRows.some((t) => !t.is_public)) reason = 'not all current translations are is_public';
    else if (translationRows.some((t) => !t.is_production_data)) reason = 'not all current translations are is_production_data';
    else if (translationRows.some((t) => Number(t.link_count) < 1)) reason = 'at least one current translation has no evidence link';

    publishTargets.push({
      slug,
      id: row.id,
      currentStatus: row.status,
      valid: !reason,
      reason,
    });
  }

  const legacyRow = bySlug.get(UNPUBLISH_SLUG);
  const unpublishTarget: PlaceRowValidation = legacyRow
    ? { slug: UNPUBLISH_SLUG, id: legacyRow.id, currentStatus: legacyRow.status, valid: true }
    : { slug: UNPUBLISH_SLUG, id: null, currentStatus: null, valid: false, reason: 'place not found' };

  return { actorId: ACTOR_ID, actorPermissionsVerified, publishTargets, unpublishTarget };
}

// ================================================================
// EXECUTE -- only when --execute is passed. Governed service calls only.
// ================================================================
export async function executeClosure(dataSource: import('typeorm').DataSource, plan: ClosurePlan, logger: Logger): Promise<void> {
  const placesRepo = new PlacesRepository(dataSource.getRepository(Place), buildMediaUrlService());
  const auditRepo = new AuditRepository(dataSource as any);
  const audit = new AuditService(auditRepo);
  // Only archive()/approve() are ever called on this instance -- every other dependency is
  // genuinely unused by those two methods (confirmed by reading places.service.ts), so passing
  // null here is safe and never dereferenced; it is NOT safe to call any other method on this
  // instance.
  const placesService = new PlacesService(
    placesRepo,
    null as any,
    null as any,
    null as any,
    null as any,
    null as any,
    audit,
    null as any,
    null as any,
    null as any,
    null as any,
    null as any,
    null as any,
    null as any,
    // approve() (used below) calls `void this.cacheInvalidation.invalidatePlace(...)` after a
    // successful write — cannot be null like the other unused deps above. A real
    // CacheInvalidationService reads WEB_INTERNAL_URL/REVALIDATE_INTERNAL_SECRET from ConfigService
    // (not available in this standalone script context) and no-ops safely when unconfigured, so
    // constructing one with an empty config is the correct stand-in rather than a bespoke stub.
    new CacheInvalidationService({
      get: () => ({ webInternalUrl: null, sharedSecret: null }),
    } as unknown as import('@nestjs/config').ConfigService),
  );

  for (const target of plan.publishTargets) {
    if (!target.valid || !target.id) {
      logger.error(`SKIPPED publish (failed validation): ${target.slug} -- ${target.reason}`);
      continue;
    }
    await placesService.approve(target.id, plan.actorId);
    logger.log(`PUBLISHED ${target.slug} (${target.id}) via PlacesService.approve()`);
  }

  if (!plan.unpublishTarget.valid || !plan.unpublishTarget.id) {
    logger.error(`SKIPPED unpublish: ${plan.unpublishTarget.slug} -- ${plan.unpublishTarget.reason}`);
  } else {
    await placesService.archive(plan.unpublishTarget.id, plan.actorId);
    logger.log(`ARCHIVED (unpublished, row preserved) ${plan.unpublishTarget.slug} (${plan.unpublishTarget.id}) via PlacesService.archive()`);
  }
}

function buildMediaUrlService(): MediaUrlService {
  const fakeConfig = {
    get: (key: string) => {
      if (key === 'api') return { publicUrl: 'http://127.0.0.1:14000', globalPrefix: 'api' };
      return undefined;
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
  return new MediaUrlService(fakeConfig);
}

async function main(): Promise<void> {
  const logger = new Logger('CloseStagingLaunchBlockers');
  const execute = process.argv.slice(2).includes('--execute');

  const { default: dataSource } = await import('../core/database/data-source');
  await dataSource.initialize();

  try {
    const plan = await planClosure(dataSource);
    logger.log(`Actor permissions verified: ${JSON.stringify(plan.actorPermissionsVerified)}`);
    logger.log(`Publish targets: ${JSON.stringify(plan.publishTargets, null, 2)}`);
    logger.log(`Unpublish target: ${JSON.stringify(plan.unpublishTarget, null, 2)}`);

    const invalidPublish = plan.publishTargets.filter((t) => !t.valid);
    if (invalidPublish.length > 0) {
      logger.error(`INVALID publish targets found: ${JSON.stringify(invalidPublish)}`);
    }

    if (!execute) {
      logger.log('--execute not passed -- stopping after plan. Nothing written.');
      return;
    }

    await executeClosure(dataSource, plan, logger);
  } finally {
    await dataSource.destroy();
  }
}

if (require.main === module) {
  main().catch((err: unknown) => {
    console.error('Fatal error in close-staging-launch-blockers:', err);
    process.exitCode = 1;
  });
}
