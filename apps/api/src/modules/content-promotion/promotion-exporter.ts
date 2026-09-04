import { createHash } from 'crypto';
import { evaluatePromotionEligibility } from './promotion-eligibility';
import type { PromotionManifest, PromotionManifestEntry } from './content-promotion.types';

export interface ExportDbPort {
  query<T = unknown>(sql: string, params?: unknown[]): Promise<T[]>;
}

interface CurrentTranslationRow {
  id: string;
  place_id: string;
  slug: string;
  field_key: string;
  locale_code: string;
  source_locale_code: string;
  translated_text: string;
  translation_method: string;
  human_review_status: string;
  is_public: boolean;
  is_production_data: boolean;
  production_eligible: boolean;
  revision_id: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  source_id: string | null;
}

export interface ExportFilter {
  placeSlug?: string;
}

export interface ExportSummary {
  scanned: number;
  ready: number;
  blocked_pending: number;
  blocked_review: number;
  blocked_not_eligible: number;
}

/**
 * Read-only. Scans staging's CURRENT translations, keeps only the ones that pass
 * evaluatePromotionEligibility() (READY), and shapes them into a PromotionManifest. Evidence
 * linkage is best-effort and optional — `getEvidenceBusinessKeys` is undefined on any environment
 * that doesn't have PR #8's evidence_artifacts/place_translation_evidence_links tables yet; when
 * omitted, every entry simply carries an empty evidence_business_keys array rather than failing.
 */
export async function exportPromotionManifest(
  db: ExportDbPort,
  sourceEnvironment: string,
  filter: ExportFilter = {},
  getEvidenceBusinessKeys?: (translationId: string) => Promise<string[]>,
): Promise<{ manifest: PromotionManifest; summary: ExportSummary }> {
  const conditions = ['pt.is_current = true'];
  const params: unknown[] = [];
  if (filter.placeSlug) {
    params.push(filter.placeSlug);
    conditions.push(`p.slug = $${params.length}`);
  }

  const rows = await db.query<CurrentTranslationRow>(
    `SELECT
       pt.id, pt.place_id, p.slug, pt.field_key, pt.locale_code, pt.source_locale_code,
       pt.translated_text, pt.translation_method, pt.human_review_status,
       pt.is_public, pt.is_production_data, pt.production_eligible,
       pt.revision_id, wr.reviewed_by, wr.reviewed_at, pt.source_id
     FROM place_translations pt
     JOIN places p ON p.id = pt.place_id
     LEFT JOIN wiki_revisions wr ON wr.id = pt.revision_id
     WHERE ${conditions.join(' AND ')}
     ORDER BY p.slug, pt.field_key, pt.locale_code`,
    params,
  );

  const summary: ExportSummary = { scanned: rows.length, ready: 0, blocked_pending: 0, blocked_review: 0, blocked_not_eligible: 0 };
  const entries: PromotionManifestEntry[] = [];

  for (const row of rows) {
    const eligibility = evaluatePromotionEligibility({
      human_review_status: row.human_review_status,
      is_public: row.is_public,
      is_production_data: row.is_production_data,
      production_eligible: row.production_eligible,
      is_current: true,
    });
    if (eligibility.status === 'BLOCKED_PENDING') summary.blocked_pending += 1;
    else if (eligibility.status === 'BLOCKED_REVIEW') summary.blocked_review += 1;
    else if (eligibility.status === 'BLOCKED_NOT_ELIGIBLE') summary.blocked_not_eligible += 1;
    if (eligibility.status !== 'READY') continue;

    summary.ready += 1;
    const evidenceBusinessKeys = getEvidenceBusinessKeys ? await getEvidenceBusinessKeys(row.id) : [];
    entries.push({
      translation_id: row.id,
      staging_place_id: row.place_id,
      slug: row.slug,
      field_key: row.field_key,
      locale_code: row.locale_code,
      source_locale_code: row.source_locale_code,
      translated_text: row.translated_text,
      translation_method: row.translation_method,
      human_review_status: row.human_review_status,
      revision_id: row.revision_id,
      reviewed_by: row.reviewed_by,
      reviewed_at: row.reviewed_at,
      content_hash_sha256: createHash('sha256').update(row.translated_text, 'utf8').digest('hex'),
      source_id: row.source_id,
      evidence_business_keys: evidenceBusinessKeys,
    });
  }

  return {
    manifest: { schema_version: '1.0', source_environment: sourceEnvironment, generated_at: new Date().toISOString(), entries },
    summary,
  };
}
