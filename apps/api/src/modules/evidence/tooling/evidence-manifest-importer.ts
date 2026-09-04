import { SOURCE_TYPE_DEFAULT_RELIABILITY, SourceType } from '../../sources/sources.enums';
import type { EvidenceManifest, EvidenceManifestEntry } from './evidence-manifest.types';
import { computeClaimsHash, validateManifestStatic, type ManifestIssue } from './evidence-manifest-validator';

/**
 * Minimal port over a query executor — deliberately NOT `EntityManager`/`DataSource` so this file
 * has zero NestJS/TypeORM runtime dependency and can be driven by a bare `dataSource.query`, a
 * disposable-DB pool, or a hand-rolled fake in tests (same "port" pattern already used for review-
 * queue-cursor.ts's DB-shape simulator).
 */
export interface EvidenceManifestDbPort {
  query<T = unknown>(sql: string, params?: unknown[]): Promise<T[]>;
}

export interface EvidenceSourcePort {
  findByTypeAndExternalRef(type: string, externalRef: string): Promise<{ id: string } | null>;
  createSource(input: {
    type: string;
    kind: string;
    title: string | null;
    url: string;
    externalRef: string;
    publisher: string | null;
    reliability: number;
    language: string | null;
    retrievedAt: Date | null;
  }): Promise<{ id: string }>;
}

export interface EvidenceArtifactPort {
  ensureEvidenceArtifact(input: {
    sourceId: string;
    businessKey: string;
    evidenceType: string;
    sourceUrl: string;
    capturedAt: Date;
    contentHashSha256: string;
    verificationStatus: string;
    licenseStatus?: string | null;
    metadata?: Record<string, unknown> | null;
  }): Promise<{ id: string; businessKey: string }>;
  linkEvidenceToTranslation(
    translationId: string,
    evidenceId: string,
    relationshipType?: string,
  ): Promise<unknown>;
}

export interface EvidenceManifestImportPorts {
  db: EvidenceManifestDbPort;
  sources: EvidenceSourcePort;
  artifacts: EvidenceArtifactPort;
}

export interface EvidenceManifestImportOptions {
  /** Dry-run unless explicitly true — same convention as every governed script in this repo. */
  execute?: boolean;
  /**
   * Staging-identity guard (Phase 9 requirement): when set, aborts BEFORE any write if
   * `SELECT current_database()` doesn't match. Checked even in dry-run so the guard itself is
   * exercised identically in both modes.
   */
  requiredDatabaseName?: string;
}

export type EvidenceManifestEntryStatus =
  | 'WOULD_IMPORT'
  | 'IMPORTED'
  | 'ALREADY_EXISTS'
  | 'SKIPPED_ERROR';

export interface EvidenceManifestEntryResult {
  place_slug: string | null;
  status: EvidenceManifestEntryStatus;
  evidence_id?: string;
  links_created: number;
  links_skipped_missing_target: number;
  issues: ManifestIssue[];
}

export interface EvidenceManifestImportResult {
  aborted: boolean;
  abortReason?: string;
  staticValidation: ReturnType<typeof validateManifestStatic>;
  results: EvidenceManifestEntryResult[];
}

interface ResolvedTarget {
  field_key: string;
  locale_code: string;
  relationship_type: string;
  translationId: string | null;
}

async function resolvePlaceId(db: EvidenceManifestDbPort, slug: string): Promise<string | null> {
  const rows = await db.query<{ id: string }>('SELECT id FROM places WHERE slug = $1', [slug]);
  return rows[0]?.id ?? null;
}

async function resolveTranslationTargets(
  db: EvidenceManifestDbPort,
  placeId: string,
  entry: EvidenceManifestEntry,
): Promise<{ targets: ResolvedTarget[]; issues: ManifestIssue[] }> {
  const targets: ResolvedTarget[] = [];
  const issues: ManifestIssue[] = [];
  for (const link of entry.links ?? []) {
    const rows = await db.query<{ id: string }>(
      `SELECT id FROM place_translations WHERE place_id = $1 AND field_key = $2 AND locale_code = $3 AND is_current = true`,
      [placeId, link.field_key, link.locale_code],
    );
    const translationId = rows[0]?.id ?? null;
    if (!translationId) {
      issues.push({
        entry_index: -1,
        place_slug: entry.place_slug,
        code: 'TRANSLATION_TARGET_NOT_FOUND',
        severity: 'warning',
        message: `no current translation for field_key="${link.field_key}" locale_code="${link.locale_code}" — evidence will still be created, just left unlinked for this field`,
      });
    }
    targets.push({
      field_key: link.field_key,
      locale_code: link.locale_code,
      relationship_type: link.relationship_type ?? 'SUPPORTS',
      translationId,
    });
  }
  return { targets, issues };
}

/**
 * The one entry point: candidate → source record → claim mapping → checksum → evidence_artifacts
 * → translation link. Dry-run by default (Phase 9); every write goes through the SAME EvidenceService
 * idempotency the real API uses (ports.artifacts is expected to be backed by the real
 * EvidenceService, never reimplemented here) — so re-running a manifest is always safe.
 */
export async function runEvidenceManifestImport(
  manifest: EvidenceManifest,
  ports: EvidenceManifestImportPorts,
  options: EvidenceManifestImportOptions = {},
): Promise<EvidenceManifestImportResult> {
  const staticValidation = validateManifestStatic(manifest);
  if (!staticValidation.valid) {
    return { aborted: true, abortReason: 'STATIC_VALIDATION_FAILED', staticValidation, results: [] };
  }

  if (options.requiredDatabaseName) {
    const rows = await ports.db.query<{ current_database: string }>('SELECT current_database()');
    const actual = rows[0]?.current_database;
    if (actual !== options.requiredDatabaseName) {
      return {
        aborted: true,
        abortReason: `DATABASE_IDENTITY_MISMATCH — current_database()="${actual}", expected "${options.requiredDatabaseName}"`,
        staticValidation,
        results: [],
      };
    }
  }

  const execute = options.execute === true;
  const results: EvidenceManifestEntryResult[] = [];

  for (const entry of manifest.entries) {
    const placeId = await resolvePlaceId(ports.db, entry.place_slug);
    if (!placeId) {
      results.push({
        place_slug: entry.place_slug,
        status: 'SKIPPED_ERROR',
        links_created: 0,
        links_skipped_missing_target: 0,
        issues: [
          {
            entry_index: -1,
            place_slug: entry.place_slug,
            code: 'PLACE_NOT_FOUND',
            severity: 'error',
            message: `no place with slug "${entry.place_slug}"`,
          },
        ],
      });
      continue;
    }

    const { targets, issues: targetIssues } = await resolveTranslationTargets(ports.db, placeId, entry);
    const linkableCount = targets.filter((t) => t.translationId).length;
    const missingCount = targets.length - linkableCount;

    if (!execute) {
      results.push({
        place_slug: entry.place_slug,
        status: 'WOULD_IMPORT',
        links_created: linkableCount,
        links_skipped_missing_target: missingCount,
        issues: targetIssues,
      });
      continue;
    }

    let source = await ports.sources.findByTypeAndExternalRef(entry.source.type, entry.source.external_ref);
    if (!source) {
      source = await ports.sources.createSource({
        type: entry.source.type,
        kind: entry.source.kind,
        title: entry.source.title ?? null,
        url: entry.source.url,
        externalRef: entry.source.external_ref,
        publisher: entry.source.publisher ?? null,
        reliability: entry.source.reliability ?? SOURCE_TYPE_DEFAULT_RELIABILITY[entry.source.type as SourceType] ?? 40,
        language: entry.source.language ?? null,
        retrievedAt: entry.source.retrieved_at ? new Date(entry.source.retrieved_at) : null,
      });
    }

    const contentHash = entry.evidence.content_hash_sha256 ?? computeClaimsHash(entry.claims ?? []);

    const artifact = await ports.artifacts.ensureEvidenceArtifact({
      sourceId: source.id,
      businessKey: entry.evidence.business_key,
      evidenceType: entry.evidence.evidence_type,
      sourceUrl: entry.source.url,
      capturedAt: new Date(entry.evidence.captured_at),
      contentHashSha256: contentHash,
      // FORCED regardless of entry.evidence.verification_status — defense in depth alongside the
      // static-validation guardrail above; this line is the one that actually reaches the DB.
      verificationStatus: 'NEEDS_REVIEW',
      licenseStatus: entry.evidence.license_status ?? null,
      metadata: { ...(entry.evidence.metadata ?? {}), claims: entry.claims ?? [] },
    });

    let linksCreated = 0;
    for (const target of targets) {
      if (!target.translationId) continue;
      await ports.artifacts.linkEvidenceToTranslation(target.translationId, artifact.id, target.relationship_type);
      linksCreated += 1;
    }

    results.push({
      place_slug: entry.place_slug,
      status: 'IMPORTED',
      evidence_id: artifact.id,
      links_created: linksCreated,
      links_skipped_missing_target: missingCount,
      issues: targetIssues,
    });
  }

  return { aborted: false, staticValidation, results };
}
