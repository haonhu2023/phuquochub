import { createHash } from 'crypto';
import { SourceKind, SourceType } from '../../sources/sources.enums';
import type { EvidenceManifest, EvidenceManifestClaim, EvidenceManifestEntry } from './evidence-manifest.types';

// GATE_PASSING_VERIFICATION_STATUSES mirrors EvidenceService's own gate set exactly (kept in sync
// deliberately, not imported, because this file must stay importable without NestJS DI — see
// module header comment in evidence-manifest.types.ts). A manifest — automated by definition — may
// never claim either of these; only a real human review (EvidenceService.verifyAttribution-style
// flow, not built yet) may.
const GATE_PASSING_VERIFICATION_STATUSES = new Set(['VERIFIED', 'BUSINESS_VERIFIED_AND_REVIEWED']);
const VALID_SOURCE_TYPES = new Set<string>(Object.values(SourceType));
const VALID_SOURCE_KINDS = new Set<string>(Object.values(SourceKind));
const URL_RE = /^https?:\/\/.+/i;
const SHA256_RE = /^[0-9a-f]{64}$/i;
const SUPPORTED_MANIFEST_VERSION = '1.0';

export type ManifestIssueSeverity = 'error' | 'warning';

export interface ManifestIssue {
  entry_index: number;
  place_slug: string | null;
  code: string;
  severity: ManifestIssueSeverity;
  message: string;
}

export interface StaticValidationResult {
  /** true iff there are zero `error`-severity issues (warnings never block). */
  valid: boolean;
  issues: ManifestIssue[];
  businessKeyDuplicates: string[];
}

/** Deterministic checksum fallback when a manifest entry omits content_hash_sha256. */
export function computeClaimsHash(claims: EvidenceManifestClaim[]): string {
  const canonical = JSON.stringify(
    [...claims].sort((a, b) => a.field.localeCompare(b.field)).map((c) => [c.field, c.value, c.support]),
  );
  return createHash('sha256').update(canonical, 'utf8').digest('hex');
}

/**
 * Pure, DB-free structural validation — no network, no filesystem, no DB. Two manifests with
 * identical content always produce byte-identical output (determinism, required by Phase 9/49).
 */
export function validateManifestStatic(manifest: EvidenceManifest): StaticValidationResult {
  const issues: ManifestIssue[] = [];
  const seenBusinessKeys = new Map<string, number>();
  const duplicates = new Set<string>();

  const push = (
    entryIndex: number,
    placeSlug: string | null,
    code: string,
    severity: ManifestIssueSeverity,
    message: string,
  ) => issues.push({ entry_index: entryIndex, place_slug: placeSlug, code, severity, message });

  if (manifest.manifest_version !== SUPPORTED_MANIFEST_VERSION) {
    push(-1, null, 'UNSUPPORTED_MANIFEST_VERSION', 'error', `manifest_version "${manifest.manifest_version}" is not supported (expected "${SUPPORTED_MANIFEST_VERSION}")`);
  }
  if (!Array.isArray(manifest.entries) || manifest.entries.length === 0) {
    push(-1, null, 'EMPTY_MANIFEST', 'error', 'manifest.entries must be a non-empty array');
    return { valid: false, issues, businessKeyDuplicates: [] };
  }

  manifest.entries.forEach((entry: EvidenceManifestEntry, i: number) => {
    const slug = entry.place_slug ?? null;

    if (!entry.place_slug || typeof entry.place_slug !== 'string') {
      push(i, slug, 'MISSING_PLACE_SLUG', 'error', 'place_slug is required');
    }

    if (!entry.source) {
      push(i, slug, 'MISSING_SOURCE', 'error', 'source is required');
    } else {
      if (!URL_RE.test(entry.source.url ?? '')) {
        push(i, slug, 'INVALID_SOURCE_URL', 'error', `source.url "${entry.source.url}" is not http(s)`);
      }
      if (!entry.source.external_ref) {
        push(i, slug, 'MISSING_EXTERNAL_REF', 'error', 'source.external_ref is required for dedup (SourcesRepository.findByTypeAndExternalRef)');
      }
      if (!VALID_SOURCE_TYPES.has(entry.source.type)) {
        push(i, slug, 'INVALID_SOURCE_TYPE', 'error', `source.type "${entry.source.type}" is not a known SourceType`);
      }
      if (!VALID_SOURCE_KINDS.has(entry.source.kind)) {
        push(i, slug, 'INVALID_SOURCE_KIND', 'error', `source.kind "${entry.source.kind}" is not a known SourceKind`);
      }
      if (entry.source.retrieved_at && Number.isNaN(Date.parse(entry.source.retrieved_at))) {
        push(i, slug, 'INVALID_RETRIEVED_AT', 'error', `source.retrieved_at "${entry.source.retrieved_at}" is not a valid date`);
      }
      if (entry.source.reliability != null && (entry.source.reliability < 0 || entry.source.reliability > 100)) {
        push(i, slug, 'INVALID_RELIABILITY', 'error', `source.reliability ${entry.source.reliability} must be within [0, 100]`);
      }
    }

    if (!entry.evidence) {
      push(i, slug, 'MISSING_EVIDENCE', 'error', 'evidence is required');
    } else {
      if (!entry.evidence.business_key) {
        push(i, slug, 'MISSING_BUSINESS_KEY', 'error', 'evidence.business_key is required');
      } else {
        if (entry.evidence.business_key.length > 150) {
          push(i, slug, 'BUSINESS_KEY_TOO_LONG', 'error', `evidence.business_key exceeds 150 chars`);
        }
        if (seenBusinessKeys.has(entry.evidence.business_key)) {
          duplicates.add(entry.evidence.business_key);
          push(i, slug, 'DUPLICATE_BUSINESS_KEY', 'error', `business_key "${entry.evidence.business_key}" also used at entry ${seenBusinessKeys.get(entry.evidence.business_key)}`);
        } else {
          seenBusinessKeys.set(entry.evidence.business_key, i);
        }
      }
      if (!entry.evidence.evidence_type) {
        push(i, slug, 'MISSING_EVIDENCE_TYPE', 'error', 'evidence.evidence_type is required');
      }
      if (!entry.evidence.captured_at || Number.isNaN(Date.parse(entry.evidence.captured_at))) {
        push(i, slug, 'INVALID_CAPTURED_AT', 'error', `evidence.captured_at "${entry.evidence.captured_at}" is not a valid date`);
      }
      if (entry.evidence.content_hash_sha256 && !SHA256_RE.test(entry.evidence.content_hash_sha256)) {
        push(i, slug, 'INVALID_CHECKSUM', 'error', 'evidence.content_hash_sha256 must be 64 lowercase hex chars');
      }
      // THE guardrail (see file header): an automated manifest asserting an already-verified
      // status would be exactly the fabricated-approval defect this whole workstream exists to
      // close, one layer down the stack. Reject it structurally rather than trusting the caller.
      if (GATE_PASSING_VERIFICATION_STATUSES.has(entry.evidence.verification_status)) {
        push(
          i,
          slug,
          'UNAUTHORIZED_VERIFICATION_STATUS',
          'error',
          `evidence.verification_status "${entry.evidence.verification_status}" may only be set by a real human review — manifests must declare NEEDS_REVIEW (or another non-gate-passing value); the importer forces NEEDS_REVIEW regardless of this field`,
        );
      }
    }

    if (!entry.links || entry.links.length === 0) {
      push(i, slug, 'NO_LINKS', 'warning', 'entry has no translation links — an evidence artifact will still be created, but unlinked to any translation');
    } else {
      entry.links.forEach((link, li) => {
        if (!link.field_key) push(i, slug, 'MISSING_LINK_FIELD_KEY', 'error', `links[${li}].field_key is required`);
        if (!link.locale_code) push(i, slug, 'MISSING_LINK_LOCALE_CODE', 'error', `links[${li}].locale_code is required`);
      });
    }
  });

  const hasFatal = issues.some((i) => i.severity === 'error');
  return { valid: !hasFatal, issues, businessKeyDuplicates: [...duplicates] };
}
