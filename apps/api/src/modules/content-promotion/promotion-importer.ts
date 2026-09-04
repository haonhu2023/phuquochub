import { createHash, randomUUID } from 'crypto';
import { resolveProductionIdentity } from './identity-resolver';
import { HUMAN_REVIEW_STATUS } from './content-promotion.types';
import type {
  ManualIdentityMapping,
  PromotionEntryResult,
  PromotionManifest,
  PromotionRunSummary,
  ProductionPlaceCandidate,
} from './content-promotion.types';

export interface PromotionDbPort {
  query<T = unknown>(sql: string, params?: unknown[]): Promise<T[]>;
}

export interface PromotionOptions {
  /** Dry-run unless explicitly true — same convention as every governed script in this repo. */
  apply?: boolean;
  /** Staging-identity guard for the TARGET (production) database — checked before any write,
   * exactly like evidence-manifest-importer.ts's requiredDatabaseName. */
  requiredTargetDatabaseName?: string;
  manualMappings?: readonly ManualIdentityMapping[];
}

async function fetchProductionCandidates(db: PromotionDbPort): Promise<ProductionPlaceCandidate[]> {
  const places = await db.query<{ id: string; slug: string; name: string; lat: number | null; lng: number | null }>(
    `SELECT id, slug, name, ST_Y(location::geometry) AS lat, ST_X(location::geometry) AS lng FROM places`,
  );
  // place_external_identifiers may not exist yet on a target that hasn't run PR #8's migration —
  // probe once, gracefully degrade to empty external identifiers rather than failing the whole run.
  let externalByPlace = new Map<string, Record<string, string>>();
  try {
    const rows = await db.query<{ place_id: string; provider: string; external_id: string }>(
      `SELECT place_id, provider, external_id FROM place_external_identifiers`,
    );
    externalByPlace = new Map();
    for (const r of rows) {
      const existing = externalByPlace.get(r.place_id) ?? {};
      existing[r.provider] = r.external_id;
      externalByPlace.set(r.place_id, existing);
    }
  } catch {
    // table doesn't exist on this target yet — external-identifier matching simply yields no
    // candidates via that method, falling through to unique-slug matching.
  }

  return places.map((p) => ({
    id: p.id,
    slug: p.slug,
    name: p.name,
    location: p.lat != null && p.lng != null ? { lat: p.lat, lng: p.lng } : null,
    external_identifiers: externalByPlace.get(p.id) ?? {},
  }));
}

/**
 * The one entry point: manifest → per-entry identity resolution → eligibility re-check →
 * insert-or-update-or-noop in the TARGET database. Dry-run by default. Every write re-validates
 * human_review_status === APPROVED from the manifest itself (defense in depth beyond the
 * exporter's own filtering — a hand-edited or stale manifest must never be trusted blindly).
 *
 * ORDER MATTERS on the insert-or-update path: the existing current row is marked not-current
 * BEFORE the new row is inserted — uq_place_trans_current is a plain, non-deferrable unique index
 * (place_id, field_key, locale_code) WHERE is_current, the exact lesson from this session's
 * insert-before-supersede bug in PlaceTranslationsService. Getting this backwards here would
 * reproduce that bug against production.
 */
export async function runContentPromotion(
  manifest: PromotionManifest,
  db: PromotionDbPort,
  options: PromotionOptions = {},
): Promise<PromotionRunSummary> {
  if (options.requiredTargetDatabaseName) {
    const rows = await db.query<{ current_database: string }>('SELECT current_database()');
    const actual = rows[0]?.current_database;
    if (actual !== options.requiredTargetDatabaseName) {
      return emptySummary(true, `DATABASE_IDENTITY_MISMATCH — current_database()="${actual}", expected "${options.requiredTargetDatabaseName}"`);
    }
  }

  const candidates = await fetchProductionCandidates(db);
  const apply = options.apply === true;
  const results: PromotionEntryResult[] = [];
  const summary = emptySummary(false);

  for (const entry of manifest.entries) {
    summary.matched += 1;

    // Defense in depth: re-validate the manifest's own claim, never trust it blindly.
    if (entry.human_review_status !== HUMAN_REVIEW_STATUS.APPROVED) {
      results.push(blocked(entry, 'BLOCKED_IDENTITY', null, null, `manifest entry claims human_review_status="${entry.human_review_status}" — only APPROVED may be promoted; refusing`));
      summary.errors += 1;
      continue;
    }

    const identity = resolveProductionIdentity(
      { staging_place_id: entry.staging_place_id, slug: entry.slug, external_identifiers: {} },
      candidates,
      options.manualMappings ?? [],
    );

    if (identity.status === 'CONFLICT') {
      results.push(blocked(entry, 'BLOCKED_CONFLICT', null, null, identity.reason));
      summary.conflicts += 1;
      continue;
    }
    if (identity.status === 'AMBIGUOUS' || identity.status === 'NO_MATCH' || !identity.production_place_id) {
      results.push(blocked(entry, 'BLOCKED_IDENTITY', null, null, identity.reason));
      summary.blocked_identity += 1;
      continue;
    }

    summary.ready += 1;
    const productionPlaceId = identity.production_place_id;

    const [existing] = await db.query<{ id: string; translated_text: string }>(
      `SELECT id, translated_text FROM place_translations
       WHERE place_id = $1 AND field_key = $2 AND locale_code = $3 AND is_current = true`,
      [productionPlaceId, entry.field_key, entry.locale_code],
    );

    if (existing) {
      const existingHash = createHash('sha256').update(existing.translated_text, 'utf8').digest('hex');
      if (existingHash === entry.content_hash_sha256) {
        results.push({
          translation_id: entry.translation_id, slug: entry.slug, field_key: entry.field_key, locale_code: entry.locale_code,
          status: 'UNCHANGED', production_place_id: productionPlaceId, production_translation_id: existing.id,
          detail: 'content_hash matches — no-op',
        });
        summary.unchanged += 1;
        continue;
      }
      if (!apply) {
        results.push({
          translation_id: entry.translation_id, slug: entry.slug, field_key: entry.field_key, locale_code: entry.locale_code,
          status: 'WOULD_UPDATE', production_place_id: productionPlaceId, production_translation_id: existing.id,
          detail: 'content differs from current production row',
        });
        summary.would_update += 1;
        continue;
      }
      await applyPromotion(db, entry, productionPlaceId, existing.id);
      results.push({
        translation_id: entry.translation_id, slug: entry.slug, field_key: entry.field_key, locale_code: entry.locale_code,
        status: 'UPDATED', production_place_id: productionPlaceId, production_translation_id: null,
        detail: 'superseded prior production row with promoted content',
      });
      summary.would_update += 1;
      continue;
    }

    if (!apply) {
      results.push({
        translation_id: entry.translation_id, slug: entry.slug, field_key: entry.field_key, locale_code: entry.locale_code,
        status: 'WOULD_INSERT', production_place_id: productionPlaceId, production_translation_id: null,
        detail: 'no current production row for this (place, field, locale) yet',
      });
      summary.would_insert += 1;
      continue;
    }
    await applyPromotion(db, entry, productionPlaceId, null);
    results.push({
      translation_id: entry.translation_id, slug: entry.slug, field_key: entry.field_key, locale_code: entry.locale_code,
      status: 'INSERTED', production_place_id: productionPlaceId, production_translation_id: null,
      detail: 'first promoted translation for this (place, field, locale)',
    });
    summary.would_insert += 1;
  }

  summary.results = results;
  return summary;
}

async function applyPromotion(
  db: PromotionDbPort,
  entry: PromotionManifest['entries'][number],
  productionPlaceId: string,
  existingCurrentId: string | null,
): Promise<void> {
  // ORDER MATTERS — see this function's caller doc comment.
  if (existingCurrentId) {
    await db.query(`UPDATE place_translations SET is_current = false WHERE id = $1`, [existingCurrentId]);
  }
  // Generated here (not gen_random_uuid() inside SQL) so the SAME id is used as both the new
  // place_translations row's id and the wiki_revisions row's entity_id — same pattern as every
  // other governed insert script in this repo (e.g. correct-hon-thom-short-description.ts).
  const newTranslationId = randomUUID();
  const [{ id: newRevisionId }] = await db.query<{ id: string }>(
    `INSERT INTO wiki_revisions
       (id, entity_type, entity_id, revision_number, parent_revision_id, snapshot, origin, change_note, editor_id, status)
     SELECT
       gen_random_uuid(), 'place_translation', $1,
       COALESCE((SELECT MAX(revision_number) FROM wiki_revisions WHERE entity_type = 'place_translation' AND entity_id = $1), 0) + 1,
       NULL, $2::jsonb, 'import', $3, NULL, 'approved'
     RETURNING id`,
    [
      newTranslationId,
      JSON.stringify({
        promoted_from: {
          environment: 'staging',
          translation_id: entry.translation_id,
          revision_id: entry.revision_id,
          reviewed_by: entry.reviewed_by,
          reviewed_at: entry.reviewed_at,
        },
      }),
      `Content promotion (${new Date().toISOString()}) — staging translation ${entry.translation_id}, revision ${entry.revision_id}`,
    ],
  );
  await db.query(
    `INSERT INTO place_translations
       (id, place_id, field_key, locale_code, source_locale_code, translated_text, text_format, source_text_hash,
        translation_method, translation_status, human_review_status, quality_gate, revision_id,
        is_current, is_public, is_production_data, production_eligible, source_id)
     VALUES ($1, $2, $3, $4, $5, $6, 'plain_text', $7,
             $8, 'PROMOTED', 'APPROVED', 'PASS', $9,
             true, true, true, true, NULL)`,
    [
      newTranslationId, productionPlaceId, entry.field_key, entry.locale_code, entry.source_locale_code, entry.translated_text,
      createHash('sha256').update(entry.translated_text, 'utf8').digest('hex'),
      entry.translation_method, newRevisionId,
    ],
  );
}

function blocked(
  entry: PromotionManifest['entries'][number],
  status: 'BLOCKED_IDENTITY' | 'BLOCKED_CONFLICT',
  productionPlaceId: string | null,
  productionTranslationId: string | null,
  detail: string,
): PromotionEntryResult {
  return { translation_id: entry.translation_id, slug: entry.slug, field_key: entry.field_key, locale_code: entry.locale_code, status, production_place_id: productionPlaceId, production_translation_id: productionTranslationId, detail };
}

function emptySummary(aborted: boolean, abortReason?: string): PromotionRunSummary {
  return {
    aborted, abort_reason: abortReason,
    matched: 0, ready: 0, blocked_pending: 0, blocked_review: 0, blocked_identity: 0, conflicts: 0,
    would_insert: 0, would_update: 0, unchanged: 0, errors: 0, results: [],
  };
}
