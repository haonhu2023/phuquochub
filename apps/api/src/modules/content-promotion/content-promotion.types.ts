// Staging → production content promotion contract (content-promotion-pipeline, 2026-09-04).
// Deliberately separate from code deployment: this pipeline moves REVIEWED CONTENT between two
// already-running, already-migrated databases. It never builds an image, never runs a migration,
// never touches application code paths. See docs/runbooks/content-promotion.md for the full
// pipeline (export → validate → identity-resolve → dry-run → apply → verify → idempotency-check).

/** The only human_review_status values place_translations actually uses (varchar, not a DB enum —
 * see PlaceTranslation entity's own comment on why). Promotion eligibility keys off these exact
 * strings; nothing in this module invents a new vocabulary. */
export const HUMAN_REVIEW_STATUS = {
  APPROVED: 'APPROVED',
  PENDING: 'PENDING',
  REJECTED: 'REJECTED',
  NEEDS_CHANGES: 'NEEDS_CHANGES',
} as const;

export interface PromotionManifestEntry {
  /** Staging's place_translations.id — the immutable row a human actually approved. Never mutated
   * in place (publishTranslation always inserts a new row on content change), so this id alone is
   * a durable pointer to exactly what was reviewed. */
  translation_id: string;
  /** Staging's place_translations.place_id. Used only to resolve identity — never written to
   * production directly (production has its own, independently-assigned place id). */
  staging_place_id: string;
  slug: string;
  field_key: string;
  locale_code: string;
  source_locale_code: string;
  translated_text: string;
  translation_method: string;
  /** Carried for audit only — promotion re-validates this is APPROVED at export time; a manifest
   * entry with anything else must never have been generated in the first place. */
  human_review_status: string;
  /** wiki_revisions.id — the audit trail row behind this exact translation_id. */
  revision_id: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  /** sha256 of translated_text — change detection without relying on timestamps (Phase 13). */
  content_hash_sha256: string;
  source_id: string | null;
  /** business_keys of any linked evidence_artifacts rows, carried for traceability only — this
   * pipeline does not promote evidence rows itself (see module README / runbook, deliberately
   * out of scope for this increment). */
  evidence_business_keys: string[];
}

export interface PromotionManifest {
  schema_version: '1.0';
  source_environment: string;
  generated_at: string;
  entries: PromotionManifestEntry[];
}

/** Never ACCEPT on anything but EXACT_MATCH — fuzzy signals (coordinates+name) may only ever
 * produce AMBIGUOUS, which blocks, per this pipeline's one non-negotiable safety rule. */
export type IdentityResolutionStatus = 'EXACT_MATCH' | 'MANUAL_MAPPING' | 'AMBIGUOUS' | 'NO_MATCH' | 'CONFLICT';

export type IdentityResolutionMethod =
  | 'EXTERNAL_IDENTIFIER'
  | 'UNIQUE_SLUG'
  | 'MANUAL_MAPPING_TABLE'
  | 'COORDINATE_AND_NAME'
  | 'NONE';

export interface ProductionPlaceCandidate {
  id: string;
  slug: string;
  name: string;
  location: { lat: number; lng: number } | null;
  /** provider -> external_id, e.g. { GOOGLE_PLACES: 'ChIJ...' }. Empty until PR #8's
   * place_external_identifiers table exists in production and is populated there too. */
  external_identifiers: Record<string, string>;
}

export interface IdentityResolutionResult {
  staging_place_id: string;
  slug: string;
  status: IdentityResolutionStatus;
  method: IdentityResolutionMethod;
  production_place_id: string | null;
  candidates: string[]; // production place ids considered, for AMBIGUOUS/CONFLICT audit
  reason: string;
}

/** An explicit, human-curated override — the ONE case where a non-exact mapping may still be
 * ACCEPTed. Never inferred automatically. */
export interface ManualIdentityMapping {
  staging_place_id: string;
  production_place_id: string;
  mapped_by: string;
  mapped_at: string;
  reason: string;
}

export type PromotionEntryStatus =
  | 'WOULD_INSERT'
  | 'WOULD_UPDATE'
  | 'UNCHANGED'
  | 'INSERTED'
  | 'UPDATED'
  | 'BLOCKED_IDENTITY'
  | 'BLOCKED_CONFLICT'
  | 'SKIPPED_ERROR';

export interface PromotionEntryResult {
  translation_id: string;
  slug: string;
  field_key: string;
  locale_code: string;
  status: PromotionEntryStatus;
  production_place_id: string | null;
  production_translation_id: string | null;
  detail: string;
}

export interface PromotionRunSummary {
  aborted: boolean;
  abort_reason?: string;
  matched: number;
  ready: number;
  blocked_pending: number;
  blocked_review: number;
  blocked_identity: number;
  conflicts: number;
  would_insert: number;
  would_update: number;
  unchanged: number;
  errors: number;
  results: PromotionEntryResult[];
}
