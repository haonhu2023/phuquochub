// Generic, schema-driven evidence manifest contract (evidence-manifest-tooling, 2026-09-04).
// Reference implementation for candidate → source record → claim mapping → checksum →
// evidence_artifacts/place_translation_evidence_links, proven against the Batch 2 cohort and
// designed to be reused unchanged for every future cohort. Deliberately place-agnostic: nothing
// in this file may name a specific place, source, or business key — see evidence-manifest-validator's
// STRUCTURAL guardrail forbidding manifests from claiming a verified status.

export interface EvidenceManifestSourceInput {
  /** Dedup key passed to sources.external_ref (SourcesRepository.findByTypeAndExternalRef). */
  external_ref: string;
  /** Must be a apps/api SourceType enum value. */
  type: string;
  /** Must be a apps/api SourceKind enum value. */
  kind: string;
  url: string;
  title?: string | null;
  publisher?: string | null;
  /** ISO 639-1, e.g. "vi" | "en". */
  language?: string | null;
  retrieved_at?: string | null;
  /** Overrides SOURCE_TYPE_DEFAULT_RELIABILITY[type] when set. */
  reliability?: number | null;
}

export type EvidenceManifestClaimSupport =
  | 'verified_live'
  | 'secondary_confirmed'
  | 'missing'
  | 'not_applicable';

export interface EvidenceManifestClaim {
  field: string;
  value: string | null;
  support: EvidenceManifestClaimSupport;
  note?: string;
}

export interface EvidenceManifestLink {
  field_key: string;
  locale_code: string;
  relationship_type?: string;
}

export interface EvidenceManifestEvidenceInput {
  /** Globally unique across evidence_artifacts.business_key (varchar 150). */
  business_key: string;
  evidence_type: string;
  captured_at: string;
  /** sha256 hex (64 chars). Omit to have the importer compute it from `claims`. */
  content_hash_sha256?: string;
  /**
   * Vocabulary is open (matches evidence_artifacts.verification_status), but the importer NEVER
   * trusts this field for anything above NEEDS_REVIEW — see runEvidenceManifestImport. A real
   * human review is the only path to VERIFIED/BUSINESS_VERIFIED_AND_REVIEWED.
   */
  verification_status: string;
  license_status?: string | null;
  metadata?: Record<string, unknown> | null;
}

export interface EvidenceManifestEntry {
  place_slug: string;
  source: EvidenceManifestSourceInput;
  evidence: EvidenceManifestEvidenceInput;
  claims?: EvidenceManifestClaim[];
  links: EvidenceManifestLink[];
}

export interface EvidenceManifest {
  manifest_version: '1.0';
  generated_by: string;
  generated_at: string;
  entries: EvidenceManifestEntry[];
}
