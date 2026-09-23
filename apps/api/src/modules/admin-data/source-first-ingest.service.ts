import { ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { PlacesService } from '../places/places.service';
import { PlacesRepository } from '../places/repositories/places.repository';
import { CategoriesRepository } from '../categories/repositories/categories.repository';
import { ContactsService } from '../contacts/contacts.service';
import { SourcesRepository } from '../sources/repositories/sources.repository';
import { SourceAttributionsRepository } from '../sources/repositories/source-attributions.repository';
import { OwnerDecisionQueueService } from '../owner-decision-queue/owner-decision-queue.service';
import { PlaceExternalIdentifiersService } from '../place-external-identifiers/place-external-identifiers.service';
import { AuthorizationService } from '../authz/authorization.service';
import {
  SourceFirstPublishEvaluator,
  CandidateInput,
  CandidateSourceObservation,
  HoldReason,
  DEFAULT_RECHECK_DAYS,
  PUBLISH_AUTHORITATIVE_TYPES,
} from './source-first-publish-evaluator.service';
import { SourceKind, SourceType, SOURCE_TYPE_DEFAULT_RELIABILITY } from '../sources/sources.enums';
import { RevisionsService } from '../revisions/revisions.service';
import { RevisionOrigin, RevisionStatus } from '../revisions/revision.enums';
import { PlaceExternalIdentifierProvider } from '../place-external-identifiers/place-external-identifiers.enums';
import { createHash } from 'crypto';

// ── Types ──────────────────────────────────────────────────────────────────────────────────────

export type CandidateOutcome =
  | 'dry_run_would_publish'
  | 'dry_run_would_hold'
  | 'dry_run_would_enrich_existing'
  | 'published'
  | 'held_pending_decision'
  | 'enriched_existing'
  | 'skipped_duplicate'
  | 'error';

// ── Enrich-existing types ─────────────────────────────────────────────────────────────────────

export interface EnrichFieldDiff {
  field: string;
  before: unknown;
  after: unknown;
  evidence: {
    sourceUrl: string;
    sourceType: string;
    retrievedAt: string;
    contentHashSha256?: string;
    publisher?: string;
  };
  // Existing DB source evidence (if any) for freshness comparison.
  existingEvidenceUrl?: string;
  existingRetrievedAt?: string;
  action: 'fill_null' | 'upgrade_source' | 'skip_no_change' | 'skip_lower_quality';
}

export interface EnrichResult {
  existingPlaceId: string;
  existingSlug: string;
  identityMethod: 'slug_and_domain' | 'external_id';
  // ISO string of place.updated_at at diff-time — used for optimistic CAS in execute mode.
  casToken: string;
  fieldsToWrite: EnrichFieldDiff[];
  fieldsSkipped: EnrichFieldDiff[];
  // Snapshot of all current field values for the fields that would be written.
  rollback: Record<string, unknown>;
  auditNotes: Array<{ field: string; summary: string }>;
}

// Internal: existing place data fetched for the enrich path.
interface ExistingPlaceRecord {
  id: string;
  name: string;
  slug: string;
  address: string | null;
  short_description: string | null;
  lat: number | null;
  lng: number | null;
  status: string;
  updated_at: Date;
  identityMethod: 'slug_and_domain' | 'external_id';
}

export type DedupMatchType = 'external_id' | 'proximity_50m';

export interface DedupMatch {
  type: DedupMatchType;
  existingPlaceId: string;
  existingSlug?: string;
  distanceMeters?: number;
}

export interface CandidateResult {
  candidateKey: string;
  name: string;
  categorySlug: string;
  outcome: CandidateOutcome;
  placeId?: string;
  slug?: string;
  verdict?: 'PUBLISH' | 'HOLD';
  holdReasons?: Array<{ type: string; field: string; summary: string; recommendation: string }>;
  // Informational items from always-hold fields and non-blocking evaluator notes.
  auditNotes?: Array<{ type: string; field: string; summary: string; recommendation: string }>;
  // Safe fields that WILL be written on auto-publish (when verdict = PUBLISH).
  autoPublishFields?: string[];
  // Fields present in candidate but NOT written automatically.
  heldFields?: string[];
  enrichResult?: EnrichResult;
  decisionQueueIds?: string[];
  dedupMatch?: DedupMatch;
  sourcesCreated?: number;
  sourcesReused?: number;
  attributionsCreated?: number;
  contactsCreated?: number;
  externalIdsRegistered?: number;
  error?: string;
}

export interface IngestOptions {
  dryRun: boolean;
  actorId: string;
  // Override recheck days per field (merge với DEFAULT_RECHECK_DAYS)
  recheckDaysOverride?: Record<string, number>;
}

export interface IngestSummary {
  total: number;
  dryRun: boolean;
  published: number;
  held: number;
  enrichedExisting: number;
  skippedDuplicate: number;
  errors: number;
  results: CandidateResult[];
}

// ── Service ────────────────────────────────────────────────────────────────────────────────────

// Source-First Ingest Pipeline (2026-09-18). Triết lý:
//   1. Thu thập từ nguồn ưu tiên (official_website ≥ government ≥ openstreetmap ≥ google_maps)
//   2. Evaluate xung đột và coverage → PUBLISH hoặc HOLD
//   3. Auto-publish khi identity + category + location + ≥1 authoritative source khớp
//   4. HOLD + enqueue chỉ khi xung đột thực sự hoặc thiếu nguồn đáng tin
//   5. Photo/logo/review/price KHÔNG auto-publish — luồng riêng có quyền rõ ràng
//   6. Business claim là xác nhận bổ sung, không phải điều kiện để listing
//   7. Dry-run: toàn bộ logic chạy nhưng KHÔNG ghi DB — trả về audit plan đầy đủ
//
// Dedup: (a) external ID exact match → hard skip; (b) proximity ≤ 50m → HOLD/NEEDS_REVIEW (not skip);
// slug collision handled transparently by PlacesService.uniqueSlug() — not a dedup blocker.
// Security: actor must hold Place.Create + Place.Approve before any writes begin.
@Injectable()
export class SourceFirstIngestService {
  private readonly logger = new Logger(SourceFirstIngestService.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly placesService: PlacesService,
    private readonly placesRepo: PlacesRepository,
    private readonly categoriesRepo: CategoriesRepository,
    private readonly contactsService: ContactsService,
    private readonly sourcesRepo: SourcesRepository,
    private readonly attributionsRepo: SourceAttributionsRepository,
    private readonly odqService: OwnerDecisionQueueService,
    private readonly extIdsService: PlaceExternalIdentifiersService,
    private readonly evaluator: SourceFirstPublishEvaluator,
    private readonly authzService: AuthorizationService,
    private readonly revisionsService: RevisionsService,
  ) {}

  async ingestCandidates(candidates: CandidateInput[], options: IngestOptions): Promise<IngestSummary> {
    // Preflight: verify actor has required permissions before any write begins.
    // Skipped in dry-run (no writes occur), but actor string is still validated non-empty.
    if (!options.dryRun) {
      if (!options.actorId) {
        throw new ForbiddenException('actorId is required for execute mode.');
      }
      const [canCreate, canApprove] = await Promise.all([
        this.authzService.can(options.actorId, 'Place.Create'),
        this.authzService.can(options.actorId, 'Place.Approve'),
      ]);
      if (!canCreate || !canApprove) {
        throw new ForbiddenException(
          `Actor ${options.actorId} lacks permissions for source-first ingest. ` +
            `Requires Place.Create (${canCreate ? '✓' : '✗'}) + Place.Approve (${canApprove ? '✓' : '✗'}).`,
        );
      }
    }

    const results: CandidateResult[] = [];
    const recheckDays = { ...DEFAULT_RECHECK_DAYS, ...(options.recheckDaysOverride ?? {}) };

    for (const candidate of candidates) {
      try {
        const result = await this.processOne(candidate, options, recheckDays);
        results.push(result);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.error(`Error processing candidate "${candidate.candidateKey}": ${msg}`);
        results.push({
          candidateKey: candidate.candidateKey,
          name: candidate.name,
          categorySlug: candidate.categorySlug,
          outcome: 'error',
          error: msg,
        });
      }
    }

    const published = results.filter((r) => r.outcome === 'published' || r.outcome === 'dry_run_would_publish').length;
    const held = results.filter((r) => r.outcome === 'held_pending_decision' || r.outcome === 'dry_run_would_hold').length;
    const enrichedExisting = results.filter((r) => r.outcome === 'enriched_existing' || r.outcome === 'dry_run_would_enrich_existing').length;
    const skipped = results.filter((r) => r.outcome === 'skipped_duplicate').length;
    const errors = results.filter((r) => r.outcome === 'error').length;

    return {
      total: candidates.length,
      dryRun: options.dryRun,
      published,
      held,
      enrichedExisting,
      skippedDuplicate: skipped,
      errors,
      results,
    };
  }

  // ── Xử lý từng candidate ──────────────────────────────────────────────────────────────────

  // Advisory lock per candidateKey: prevents two concurrent ingests creating the same place.
  // Class=1 is the ingest pipeline namespace. hashtext() returns int4 — fits pg_advisory_lock(int4,int4).
  private async withCandidateLock<T>(candidateKey: string, fn: () => Promise<T>): Promise<T> {
    await this.dataSource.query(`SELECT pg_advisory_lock(1, hashtext($1))`, [candidateKey]);
    try {
      return await fn();
    } finally {
      await this.dataSource.query(`SELECT pg_advisory_unlock(1, hashtext($1))`, [candidateKey]);
    }
  }

  private async processOne(
    candidate: CandidateInput,
    options: IngestOptions,
    recheckDays: Record<string, number>,
  ): Promise<CandidateResult> {
    return this.withCandidateLock(candidate.candidateKey, () =>
      this.processOneLocked(candidate, options, recheckDays),
    );
  }

  private async processOneLocked(
    candidate: CandidateInput,
    options: IngestOptions,
    recheckDays: Record<string, number>,
  ): Promise<CandidateResult> {
    const { dryRun, actorId } = options;
    const base: Pick<CandidateResult, 'candidateKey' | 'name' | 'categorySlug'> = {
      candidateKey: candidate.candidateKey,
      name: candidate.name,
      categorySlug: candidate.categorySlug,
    };

    // 0. Enrich path: resolve existing target BEFORE any dedup checks.
    // A candidate with targetSlug or a google_places externalId that matches an existing
    // place bypasses proximity dedup and goes through field-level enrichment instead.
    // Proximity alone never triggers an update — only explicit slug/externalId + domain.
    const enrichTarget = await this.resolveEnrichTarget(candidate);
    if (enrichTarget) {
      return this.processEnrich(candidate, enrichTarget, options);
    }

    // 1a. Hard dedup — external ID exact match only → skip immediately
    const hardMatch = await this.checkHardDuplicate(candidate);
    if (hardMatch) {
      this.logger.log(`SKIP dedup [${candidate.candidateKey}] → external_id match: ${hardMatch.existingPlaceId}`);
      return { ...base, outcome: 'skipped_duplicate', dedupMatch: hardMatch };
    }

    // 1b. Soft dedup — proximity ≤ 50m → HOLD/NEEDS_REVIEW, not skip.
    // Slug collisions are handled transparently by PlacesService.uniqueSlug(); no action needed here.
    const proximityMatch = await this.checkProximity(candidate);
    if (proximityMatch) {
      this.logger.warn(
        `PROXIMITY [${candidate.candidateKey}] → ${proximityMatch.distanceMeters}m from ${proximityMatch.existingPlaceId} — will HOLD`,
      );
    }

    // 2. Category lookup
    const category = await this.categoriesRepo.findBySlug(candidate.categorySlug);
    if (!category) {
      return {
        ...base,
        outcome: 'error',
        error: `Category slug "${candidate.categorySlug}" not found in DB`,
      };
    }

    // 3. Evaluate
    const readiness = this.evaluator.evaluate(candidate);

    // Proximity match forces HOLD regardless of evaluator verdict.
    const proximityHoldReasons = proximityMatch
      ? [
          {
            type: 'identity_conflict' as const,
            field: 'coordinates',
            summary: `Existing place found ${proximityMatch.distanceMeters}m away (id: ${proximityMatch.existingPlaceId}). Possible duplicate.`,
            recommendation: 'Verify this is a distinct place from the nearby existing entry before publishing.',
            failSafe: 'hold_publish' as const,
          },
        ]
      : [];
    const allHoldReasons = [...proximityHoldReasons, ...readiness.holdReasons];
    const effectiveVerdict = proximityMatch ? 'HOLD' : readiness.verdict;

    if (dryRun) {
      return {
        ...base,
        outcome: effectiveVerdict === 'PUBLISH' ? 'dry_run_would_publish' : 'dry_run_would_hold',
        verdict: effectiveVerdict,
        holdReasons: allHoldReasons.map((r) => ({
          type: r.type,
          field: r.field,
          summary: r.summary,
          recommendation: r.recommendation,
        })),
        auditNotes: readiness.auditNotes.map((n: HoldReason) => ({
          type: n.type,
          field: n.field,
          summary: n.summary,
          recommendation: n.recommendation,
        })),
        autoPublishFields: readiness.autoPublishFields,
        heldFields: readiness.heldFields,
        dedupMatch: proximityMatch ?? undefined,
      };
    }

    // 4. Create place (status=pending) — safe fields only (AUTO_PUBLISH_SAFE_FIELDS policy).
    // opening_hours and price_range are ALWAYS_HOLD_FIELDS: never written on auto-publish.
    const placeDto = {
      name: candidate.name,
      category_id: category.id,
      location: this.resolveLocation(candidate),
      address: candidate.address,
      ward: candidate.ward,
      province: candidate.province,
      admin_area: candidate.adminArea,
      short_description: candidate.shortDescription,
      // opening_hours intentionally omitted — always-hold field; requires human review.
      // price_range intentionally omitted — always-hold field; requires human review.
    } as Parameters<typeof this.placesService.create>[0];

    const created = await this.placesService.create(placeDto, actorId);
    const placeId = (created as unknown as { id: string }).id;
    const slug = (created as unknown as { slug: string }).slug;

    this.logger.log(`CREATED place ${slug} (${placeId})`);

    // 5. Record provenance (sources + attributions)
    const { sourcesCreated, sourcesReused, attributionsCreated } = await this.recordProvenance(
      candidate,
      placeId,
      actorId,
      recheckDays,
    );

    // 6. Create contacts
    const contactsCreated = await this.createContacts(candidate, placeId);

    // 7. Register external IDs
    const externalIdsRegistered = await this.registerExternalIds(candidate, placeId);

    // 8. Publish or hold based on effective verdict (proximity match always forces HOLD)
    if (effectiveVerdict === 'PUBLISH') {
      await this.placesService.approve(placeId, actorId);
      // Gate 3: record an APPROVED revision with IMPORT origin so the wiki_revision
      // table reflects the completed publish workflow (append-only, never UPDATE).
      await this.revisionsService.recordPlaceRevision({
        placeId,
        snapshot: { ...(created as object), status: 'published' },
        diff: null,
        origin: RevisionOrigin.IMPORT,
        changeNote: `Auto-published via source-first ingest (${readiness.primarySourceType ?? 'unknown'})`,
        editorId: actorId,
        status: RevisionStatus.APPROVED,
      });
      this.logger.log(`PUBLISHED place ${slug}`);
      return {
        ...base,
        outcome: 'published',
        placeId,
        slug,
        verdict: 'PUBLISH',
        autoPublishFields: readiness.autoPublishFields,
        heldFields: readiness.heldFields,
        auditNotes: readiness.auditNotes.map((n: HoldReason) => ({
          type: n.type,
          field: n.field,
          summary: n.summary,
          recommendation: n.recommendation,
        })),
        sourcesCreated,
        sourcesReused,
        attributionsCreated,
        contactsCreated,
        externalIdsRegistered,
      };
    }

    // HOLD — enqueue decision items (evaluator reasons + proximity conflict if any)
    const decisionQueueIds = await this.enqueueDecisions(candidate, placeId, allHoldReasons);
    this.logger.log(`HELD place ${slug} — ${allHoldReasons.length} question(s) queued`);

    return {
      ...base,
      outcome: 'held_pending_decision',
      placeId,
      slug,
      verdict: 'HOLD',
      holdReasons: allHoldReasons.map((r) => ({
        type: r.type,
        field: r.field,
        summary: r.summary,
        recommendation: r.recommendation,
      })),
      auditNotes: readiness.auditNotes.map((n: HoldReason) => ({
        type: n.type,
        field: n.field,
        summary: n.summary,
        recommendation: n.recommendation,
      })),
      autoPublishFields: readiness.autoPublishFields,
      heldFields: readiness.heldFields,
      decisionQueueIds,
      dedupMatch: proximityMatch ?? undefined,
      sourcesCreated,
      sourcesReused,
      attributionsCreated,
      contactsCreated,
      externalIdsRegistered,
    };
  }

  // ── Dedup ──────────────────────────────────────────────────────────────────────────────────

  // Hard dedup: external ID exact match → skip entirely (idempotency guarantee).
  // Checks all known providers, not just google_places.
  private async checkHardDuplicate(candidate: CandidateInput): Promise<DedupMatch | null> {
    if (!candidate.externalIds?.length) return null;
    for (const eid of candidate.externalIds) {
      const provider = this.resolveProvider(eid.provider);
      if (!provider) continue;
      const rows = await this.dataSource.query<Array<{ place_id: string }>>(
        `SELECT place_id FROM place_external_identifiers
         WHERE provider = $1 AND external_id = $2
         LIMIT 1`,
        [provider, eid.externalId],
      );
      if (rows.length > 0) {
        return { type: 'external_id', existingPlaceId: rows[0].place_id };
      }
    }
    return null;
  }

  // Soft dedup: proximity ≤ 50m → HOLD/NEEDS_REVIEW (not skip).
  // Slug collisions are handled by PlacesService.uniqueSlug(); no block here.
  private async checkProximity(candidate: CandidateInput): Promise<DedupMatch | null> {
    if (candidate.lat == null || candidate.lng == null) return null;
    const rows = await this.dataSource.query<Array<{ id: string; dist: number }>>(
      `SELECT id, ST_Distance(location::geography, ST_SetSRID(ST_MakePoint($1,$2),4326)::geography) AS dist
       FROM places
       WHERE deleted_at IS NULL
         AND ST_DWithin(location::geography, ST_SetSRID(ST_MakePoint($1,$2),4326)::geography, 50)
       ORDER BY dist ASC
       LIMIT 1`,
      [candidate.lng, candidate.lat],
    );
    if (rows.length > 0) {
      return {
        type: 'proximity_50m',
        existingPlaceId: rows[0].id,
        distanceMeters: Math.round(rows[0].dist),
      };
    }
    return null;
  }

  // ── Sources + Attributions ─────────────────────────────────────────────────────────────────

  private async recordProvenance(
    candidate: CandidateInput,
    placeId: string,
    actorId: string,
    recheckDays: Record<string, number>,
  ): Promise<{ sourcesCreated: number; sourcesReused: number; attributionsCreated: number }> {
    // Group observations by sourceUrl → create/find-or-create one Source per URL
    const urlToSourceId = new Map<string, string>();
    const uniqueUrls = [...new Set(candidate.observations.map((o) => o.sourceUrl))];
    let sourcesCreated = 0;
    let sourcesReused = 0;

    for (const url of uniqueUrls) {
      const obs = candidate.observations.find((o) => o.sourceUrl === url)!;
      // externalRef = URL nếu ≤ 150 chars, ngược lại hash SHA256 (64 chars, fit trong length(150))
      const externalRef = url.length <= 150 ? url : createHash('sha256').update(url).digest('hex');

      let source = await this.sourcesRepo.findByTypeAndExternalRef(obs.sourceType, externalRef);
      if (!source) {
        source = this.sourcesRepo.create({
          type: obs.sourceType,
          kind: this.kindForType(obs.sourceType),
          title: obs.publisher ?? null,
          url,
          externalRef,
          publisher: obs.publisher ?? null,
          reliability: SOURCE_TYPE_DEFAULT_RELIABILITY[obs.sourceType],
          retrievedAt: obs.retrievedAt,
        });
        source = await this.sourcesRepo.save(source);
        sourcesCreated++;
      } else {
        sourcesReused++;
      }
      urlToSourceId.set(url, source.id);
    }

    // Create attributions per observation (entity_type=place_field, field=obs.field)
    let attributionsCreated = 0;
    const now = new Date();

    for (const obs of candidate.observations) {
      const sourceId = urlToSourceId.get(obs.sourceUrl);
      if (!sourceId) continue;

      // Check idempotency: (entity_type, entity_id, field, source_id) must be unique
      const existing = await this.attributionsRepo.listByEntity('place_field', placeId, obs.field);
      const alreadyLinked = existing.some((a) => a.sourceId === sourceId);
      if (alreadyLinked) continue;

      const recheckDate = recheckDays[obs.field]
        ? new Date(now.getTime() + recheckDays[obs.field] * 24 * 60 * 60 * 1000)
        : null;

      const attribution = this.attributionsRepo.create({
        sourceId,
        entityType: 'place_field',
        entityId: placeId,
        field: obs.field,
        confidence: obs.confidence ?? SOURCE_TYPE_DEFAULT_RELIABILITY[obs.sourceType],
        isPrimary: obs.isPrimary ?? false,
        createdBy: actorId,
        recheckDate,
        stalenessState: 'fresh',
        conflictState: 'clean',
      });
      await this.attributionsRepo.save(attribution);
      attributionsCreated++;
    }

    // Attribution at place level (entity_type=place) for the primary source
    const primaryObs = candidate.observations
      .filter((o) => o.isPrimary || o.field === 'name')
      .sort(
        (a, b) =>
          SOURCE_TYPE_DEFAULT_RELIABILITY[b.sourceType] - SOURCE_TYPE_DEFAULT_RELIABILITY[a.sourceType],
      )[0];

    if (primaryObs) {
      const primarySourceId = urlToSourceId.get(primaryObs.sourceUrl);
      if (primarySourceId) {
        const existingPlace = await this.attributionsRepo.listByEntity('place', placeId);
        const alreadyLinked = existingPlace.some((a) => a.sourceId === primarySourceId);
        if (!alreadyLinked) {
          const placeAttr = this.attributionsRepo.create({
            sourceId: primarySourceId,
            entityType: 'place',
            entityId: placeId,
            field: null,
            confidence: SOURCE_TYPE_DEFAULT_RELIABILITY[primaryObs.sourceType],
            isPrimary: true,
            createdBy: actorId,
            recheckDate: null,
            stalenessState: 'fresh',
            conflictState: 'clean',
          });
          await this.attributionsRepo.save(placeAttr);
          attributionsCreated++;
        }
      }
    }

    return { sourcesCreated, sourcesReused, attributionsCreated };
  }

  // ── Contacts ──────────────────────────────────────────────────────────────────────────────

  private async createContacts(candidate: CandidateInput, placeId: string): Promise<number> {
    let count = 0;

    for (const phone of candidate.phones ?? []) {
      await this.contactsService.createForPlace(placeId, {
        contact_type: 'phone',
        value: phone.value,
        label: phone.label ?? null,
        is_primary: count === 0, // first phone is primary
        display_order: count,
      } as Parameters<typeof this.contactsService.createForPlace>[1]);
      count++;
    }

    if (candidate.website) {
      await this.contactsService.createForPlace(placeId, {
        contact_type: 'website',
        value: candidate.website,
        is_primary: true,
        display_order: 0,
      } as Parameters<typeof this.contactsService.createForPlace>[1]);
      count++;
    }

    return count;
  }

  // ── External IDs ──────────────────────────────────────────────────────────────────────────

  private async registerExternalIds(candidate: CandidateInput, placeId: string): Promise<number> {
    let count = 0;
    for (const eid of candidate.externalIds ?? []) {
      const provider = this.resolveProvider(eid.provider);
      if (!provider) continue;
      await this.extIdsService.ensureIdentifier({
        placeId,
        provider,
        externalId: eid.externalId,
        isPrimary: eid.isPrimary ?? true,
      });
      count++;
    }
    return count;
  }

  // ── Owner Decision Queue ──────────────────────────────────────────────────────────────────

  private async enqueueDecisions(
    candidate: CandidateInput,
    placeId: string,
    holdReasons: Array<{
      type: string;
      field: string;
      sourceAUrl?: string;
      sourceAType?: string;
      sourceBUrl?: string;
      sourceBType?: string;
      summary: string;
      recommendation: string;
      failSafe: string;
    }>,
  ): Promise<string[]> {
    const ids: string[] = [];
    for (const reason of holdReasons) {
      const item = await this.odqService.enqueue({
        placeId,
        candidateKey: candidate.candidateKey,
        field: reason.field,
        questionType: reason.type as import('../owner-decision-queue/entities/owner-decision-queue.entity').OdqQuestionType,
        sourceAUrl: reason.sourceAUrl,
        sourceAType: reason.sourceAType,
        sourceBUrl: reason.sourceBUrl,
        sourceBType: reason.sourceBType,
        conflictSummary: reason.summary,
        recommendation: reason.recommendation,
        failSafe: (reason.failSafe as import('../owner-decision-queue/entities/owner-decision-queue.entity').OdqFailSafe) ?? 'hold_publish',
        actorScope: `place:${placeId}:field:${reason.field}`,
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
      });
      ids.push(item.id);
    }
    return ids;
  }

  // ── Helpers ───────────────────────────────────────────────────────────────────────────────

  private resolveLocation(candidate: CandidateInput): { lng: number; lat: number } {
    if (candidate.lat != null && candidate.lng != null) {
      return { lat: candidate.lat, lng: candidate.lng };
    }
    // Fallback: Phu Quoc center — tốt hơn là block toàn bộ khi thiếu coords nhưng có address
    return { lat: 10.2899, lng: 103.9840 };
  }

  private kindForType(type: SourceType): SourceKind {
    if (type === SourceType.COMMUNITY || type === SourceType.BUSINESS_OWNER || type === SourceType.MODERATOR) {
      return SourceKind.PLATFORM_USER;
    }
    if (type === SourceType.AI) return SourceKind.AI_MODEL;
    if (type === SourceType.FIELD_SURVEY) return SourceKind.OFFLINE;
    return SourceKind.URL;
  }

  private resolveProvider(provider: string): PlaceExternalIdentifierProvider | null {
    const normalized = provider.toLowerCase().replace(/_/g, '');
    if (normalized === 'googleplaces' || normalized === 'google') {
      return PlaceExternalIdentifierProvider.GOOGLE_PLACES;
    }
    return null;
  }

  // ── Enrich-Existing Path ──────────────────────────────────────────────────────────────────

  // Resolves an existing place via (1) targetSlug + official-domain confirmation, or
  // (2) google_places externalId JOIN (auto-confirmed by Google Place ID uniqueness).
  // Proximity alone never triggers this path.
  private async resolveEnrichTarget(candidate: CandidateInput): Promise<ExistingPlaceRecord | null> {
    // Method 1: explicit targetSlug → slug lookup + official domain confirmation
    if (candidate.targetSlug) {
      const rows = await this.dataSource.query<Array<{
        id: string; name: string; slug: string; address: string | null;
        short_description: string | null; lng: string | null; lat: string | null;
        status: string; updated_at: string;
      }>>(
        `SELECT id, name, slug, address, short_description,
                ST_X(location::geometry)::text AS lng, ST_Y(location::geometry)::text AS lat,
                status, updated_at
         FROM places WHERE slug = $1 AND deleted_at IS NULL LIMIT 1`,
        [candidate.targetSlug],
      );
      if (rows.length === 0) return null; // place doesn't exist yet → create path

      const row = rows[0];
      const confirmed = await this.confirmByOfficialDomain(row.id, candidate);
      if (!confirmed) {
        this.logger.warn(
          `ENRICH target "${candidate.targetSlug}" found but official-domain confirmation FAILED ` +
            `for candidate "${candidate.candidateKey}" — falling back to create path.`,
        );
        return null;
      }
      return {
        id: row.id, name: row.name, slug: row.slug,
        address: row.address, short_description: row.short_description,
        lat: row.lat != null ? Number(row.lat) : null,
        lng: row.lng != null ? Number(row.lng) : null,
        status: row.status,
        updated_at: new Date(row.updated_at),
        identityMethod: 'slug_and_domain',
      };
    }

    // Method 2: google_places externalId JOIN — Google Place ID is globally unique;
    // the join to places confirms the place exists and is not deleted.
    for (const eid of candidate.externalIds ?? []) {
      if (eid.provider === 'google_places' || eid.provider === 'google') {
        const rows = await this.dataSource.query<Array<{
          id: string; name: string; slug: string; address: string | null;
          short_description: string | null; lng: string | null; lat: string | null;
          status: string; updated_at: string;
        }>>(
          `SELECT p.id, p.name, p.slug, p.address, p.short_description,
                  ST_X(p.location::geometry)::text AS lng, ST_Y(p.location::geometry)::text AS lat,
                  p.status, p.updated_at
           FROM places p
           JOIN place_external_identifiers pei ON pei.place_id = p.id
           WHERE pei.provider = 'google_places' AND pei.external_id = $1
             AND p.deleted_at IS NULL LIMIT 1`,
          [eid.externalId],
        );
        if (rows.length > 0) {
          const row = rows[0];
          return {
            id: row.id, name: row.name, slug: row.slug,
            address: row.address, short_description: row.short_description,
            lat: row.lat != null ? Number(row.lat) : null,
            lng: row.lng != null ? Number(row.lng) : null,
            status: row.status,
            updated_at: new Date(row.updated_at),
            identityMethod: 'external_id',
          };
        }
      }
    }

    return null;
  }

  // Confirms the candidate's official source domain matches the existing place's website.
  // Required for targetSlug identity: prevents a wrong-slug or cross-brand match.
  private async confirmByOfficialDomain(placeId: string, candidate: CandidateInput): Promise<boolean> {
    const officialObs = candidate.observations.find(
      (o) => o.sourceType === SourceType.OFFICIAL_WEBSITE || o.sourceType === SourceType.GOVERNMENT,
    );
    if (!officialObs) return false;

    const sourceDomain = this.extractDomain(officialObs.sourceUrl);
    if (!sourceDomain) return false;

    // Self-consistency check: candidate.website domain must match the official source domain.
    const websiteDomain = candidate.website ? this.extractDomain(candidate.website) : null;
    if (!websiteDomain || websiteDomain !== sourceDomain) {
      // candidate.website doesn't match the official source domain → not self-consistent
      return false;
    }

    // Cross-check against existing place's website contact (if any).
    const rows = await this.dataSource.query<Array<{ value: string }>>(
      `SELECT value FROM place_contacts
       WHERE place_id = $1 AND contact_type = 'website' AND deleted_at IS NULL LIMIT 1`,
      [placeId],
    );
    if (rows.length === 0) {
      // No existing website contact → accept (targetSlug + official source are sufficient).
      return true;
    }
    const existingDomain = this.extractDomain(rows[0].value);
    return existingDomain === sourceDomain;
  }

  private extractDomain(url: string): string | null {
    try {
      return new URL(url).hostname.replace(/^www\./, '').toLowerCase();
    } catch {
      return null;
    }
  }

  // Computes field-by-field before→after diffs for safe fields.
  // - fill_null: existing value is null; new official source has a value.
  // - upgrade_source: existing value differs; new official source is fresher.
  // - skip_no_change: values match.
  // - skip_lower_quality: existing value differs but new source is not clearly better.
  // Never includes opening_hours, price_range, or media — those go to auditNotes.
  private async buildEnrichDiffs(
    existing: ExistingPlaceRecord,
    candidate: CandidateInput,
  ): Promise<{ diffs: EnrichFieldDiff[]; auditNotes: Array<{ field: string; summary: string }> }> {
    const diffs: EnrichFieldDiff[] = [];
    const auditNotes: Array<{ field: string; summary: string }> = [];

    // Fetch existing contacts
    const contactRows = await this.dataSource.query<Array<{ contact_type: string; value: string }>>(
      `SELECT contact_type, value FROM place_contacts WHERE place_id = $1 AND deleted_at IS NULL`,
      [existing.id],
    );
    const existingWebsite = contactRows.find((r) => r.contact_type === 'website')?.value ?? null;
    const existingPhone = contactRows.find((r) => r.contact_type === 'phone')?.value ?? null;

    // Fetch existing source evidence per field (most recent official/government attribution)
    const evidenceRows = await this.dataSource.query<Array<{
      field: string; url: string; retrieved_at: string;
    }>>(
      `SELECT sa.field, s.url, s.retrieved_at::text AS retrieved_at
       FROM source_attributions sa
       JOIN sources s ON s.id = sa.source_id
       WHERE sa.entity_type = 'place_field' AND sa.entity_id = $1
         AND sa.field IN ('name','address','short_description','coordinates','website','phone')
         AND s.type IN ('official_website','government')
       ORDER BY s.retrieved_at DESC NULLS LAST`,
      [existing.id],
    );
    const existingEvidence = new Map<string, { url: string; retrieved_at: string }>();
    for (const row of evidenceRows) {
      if (!existingEvidence.has(row.field)) existingEvidence.set(row.field, row);
    }

    // Group candidate observations by field
    const obsByField = new Map<string, CandidateSourceObservation[]>();
    for (const obs of candidate.observations) {
      const list = obsByField.get(obs.field) ?? [];
      list.push(obs);
      obsByField.set(obs.field, list);
    }

    const getBestOfficialObs = (field: string): CandidateSourceObservation | null =>
      (obsByField.get(field) ?? [])
        .filter((o) => PUBLISH_AUTHORITATIVE_TYPES.has(o.sourceType))
        .sort((a, b) => b.retrievedAt.getTime() - a.retrievedAt.getTime())[0] ?? null;

    // Scalar fields mapped to their current DB values and candidate values
    const scalarFields = [
      { field: 'name',              currentValue: existing.name,             candidateValue: candidate.name ?? null },
      { field: 'address',           currentValue: existing.address,          candidateValue: candidate.address ?? null },
      { field: 'short_description', currentValue: existing.short_description, candidateValue: candidate.shortDescription ?? null },
      { field: 'website',           currentValue: existingWebsite,           candidateValue: candidate.website ?? null },
      { field: 'phone',             currentValue: existingPhone,             candidateValue: candidate.phones?.[0]?.value ?? null },
    ];

    for (const { field, currentValue, candidateValue } of scalarFields) {
      if (candidateValue == null) continue;

      const bestObs = getBestOfficialObs(field)
        ?? (field === 'name' && candidate.observations.find((o) => o.isPrimary) ? candidate.observations.find((o) => o.isPrimary)! : null);
      if (!bestObs || !PUBLISH_AUTHORITATIVE_TYPES.has(bestObs.sourceType)) continue;

      const evidence = {
        sourceUrl: bestObs.sourceUrl,
        sourceType: bestObs.sourceType,
        retrievedAt: bestObs.retrievedAt.toISOString(),
        contentHashSha256: bestObs.contentHashSha256,
        publisher: bestObs.publisher,
      };
      const existingEv = existingEvidence.get(field);

      let action: EnrichFieldDiff['action'];
      if (currentValue == null || currentValue === '') {
        action = 'fill_null';
      } else if (this.normalizeForCompare(currentValue) === this.normalizeForCompare(candidateValue)) {
        action = 'skip_no_change';
      } else if (existingEv && bestObs.retrievedAt > new Date(existingEv.retrieved_at)) {
        action = 'upgrade_source';
      } else {
        action = 'skip_lower_quality';
      }

      diffs.push({
        field, before: currentValue, after: candidateValue, evidence,
        existingEvidenceUrl: existingEv?.url,
        existingRetrievedAt: existingEv?.retrieved_at,
        action,
      });
    }

    // Coordinates: always informational (coordinates have special PostGIS update handling;
    // coordinate changes require human review beyond a trivial < 5m delta).
    if (candidate.lat != null && candidate.lng != null) {
      const candidateCoords = { lat: candidate.lat, lng: candidate.lng };
      const existingCoords = existing.lat != null && existing.lng != null
        ? { lat: existing.lat, lng: existing.lng } : null;
      const coordsObs = (obsByField.get('coordinates') ?? [])[0] ?? null;
      if (coordsObs && existingCoords != null) {
        const distM = this.haversineMeters(
          existingCoords.lat, existingCoords.lng, candidateCoords.lat, candidateCoords.lng,
        );
        diffs.push({
          field: 'coordinates', before: existingCoords, after: candidateCoords,
          evidence: {
            sourceUrl: coordsObs.sourceUrl, sourceType: coordsObs.sourceType,
            retrievedAt: coordsObs.retrievedAt.toISOString(),
            contentHashSha256: coordsObs.contentHashSha256, publisher: coordsObs.publisher,
          },
          existingEvidenceUrl: existingEvidence.get('coordinates')?.url,
          existingRetrievedAt: existingEvidence.get('coordinates')?.retrieved_at,
          action: distM < 5 ? 'skip_no_change' : 'skip_lower_quality',
        });
      }
    }

    // Always-hold fields → audit notes only, never written
    if (candidate.openingHours && Object.keys(candidate.openingHours).length > 0) {
      auditNotes.push({
        field: 'opening_hours',
        summary: 'Has opening_hours data — not written (always-hold field). Requires human review.',
      });
    }

    return { diffs, auditNotes };
  }

  private normalizeForCompare(v: unknown): string {
    if (typeof v === 'string') return v.toLowerCase().trim().replace(/\s+/g, ' ');
    return JSON.stringify(v) ?? '';
  }

  private haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const R = 6371000;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLng = ((lng2 - lng1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  private async processEnrich(
    candidate: CandidateInput,
    target: ExistingPlaceRecord,
    options: IngestOptions,
  ): Promise<CandidateResult> {
    const { dryRun, actorId } = options;
    const base = {
      candidateKey: candidate.candidateKey,
      name: candidate.name,
      categorySlug: candidate.categorySlug,
    };

    const { diffs, auditNotes } = await this.buildEnrichDiffs(target, candidate);
    // Coordinates are always skip_* so they land in fieldsSkipped, not fieldsToWrite.
    const fieldsToWrite = diffs.filter((d) => d.action === 'fill_null' || d.action === 'upgrade_source');
    const fieldsSkipped = diffs.filter((d) => d.action !== 'fill_null' && d.action !== 'upgrade_source');

    const rollback: Record<string, unknown> = {};
    for (const d of fieldsToWrite) rollback[d.field] = d.before;

    const enrichResult: EnrichResult = {
      existingPlaceId: target.id,
      existingSlug: target.slug,
      identityMethod: target.identityMethod,
      casToken: target.updated_at.toISOString(),
      fieldsToWrite,
      fieldsSkipped,
      rollback,
      auditNotes,
    };

    if (dryRun) {
      this.logger.log(
        `ENRICH DRY-RUN [${candidate.candidateKey}] → existing ${target.slug} (${target.id}), ` +
          `${fieldsToWrite.length} field(s) would write, ${fieldsSkipped.length} skipped`,
      );
      return { ...base, outcome: 'dry_run_would_enrich_existing', placeId: target.id, slug: target.slug, enrichResult };
    }

    // Execute: RBAC was already checked in ingestCandidates before processOne is called.
    if (!actorId) throw new ForbiddenException('actorId required for enrich execute mode.');
    await this.applyEnrichUpdates(candidate, target, fieldsToWrite, actorId);

    this.logger.log(
      `ENRICHED place ${target.slug} (${target.id}) — wrote: [${fieldsToWrite.map((d) => d.field).join(', ')}]`,
    );
    return { ...base, outcome: 'enriched_existing', placeId: target.id, slug: target.slug, enrichResult };
  }

  private async applyEnrichUpdates(
    candidate: CandidateInput,
    target: ExistingPlaceRecord,
    fieldsToWrite: EnrichFieldDiff[],
    actorId: string,
  ): Promise<void> {
    if (fieldsToWrite.length === 0) return;

    // 1. Record revision snapshot FIRST (CAS pattern from TranslationReviewService):
    //    insert revision row, then conditional UPDATE; if UPDATE affects 0 rows (stale casToken)
    //    the whole transaction rolls back including this revision insert.
    await this.revisionsService.recordPlaceRevision({
      placeId: target.id,
      snapshot: {
        id: target.id, slug: target.slug, name: target.name,
        address: target.address, short_description: target.short_description,
        coordinates: target.lat != null ? { lat: target.lat, lng: target.lng } : null,
        candidateKey: candidate.candidateKey,
        enrichedFields: fieldsToWrite.map((d) => d.field),
        rollback: Object.fromEntries(fieldsToWrite.map((d) => [d.field, d.before])),
      },
      diff: Object.fromEntries(
        fieldsToWrite.map((d) => [d.field, { before: d.before, after: d.after }]),
      ),
      origin: RevisionOrigin.IMPORT,
      changeNote: `Source-first enrich: [${fieldsToWrite.map((d) => d.field).join(', ')}] from ${candidate.observations.find((o) => o.isPrimary)?.sourceUrl ?? 'unknown source'}`,
      editorId: actorId,
      status: RevisionStatus.APPROVED,
    });

    // 2. CAS update for place-row columns (name, address, short_description).
    //    Uses RETURNING id so we can detect CAS failure (0 rows returned = concurrent write).
    const placeRowFields = fieldsToWrite.filter((d) =>
      ['name', 'address', 'short_description'].includes(d.field),
    );
    if (placeRowFields.length > 0) {
      const setClauses: string[] = [];
      const params: unknown[] = [];
      let idx = 1;
      for (const d of placeRowFields) {
        setClauses.push(`${d.field} = $${idx}`);
        params.push(d.after);
        idx++;
      }
      setClauses.push(`updated_at = NOW()`);
      params.push(target.id, target.updated_at);

      const returned = await this.dataSource.query<Array<{ id: string }>>(
        `UPDATE places SET ${setClauses.join(', ')}
         WHERE id = $${idx} AND updated_at = $${idx + 1} AND deleted_at IS NULL
         RETURNING id`,
        params,
      );
      if (returned.length === 0) {
        throw new Error(
          `CAS conflict: place ${target.id} was modified concurrently (casToken=${target.updated_at.toISOString()}). ` +
            `Re-run dry-run to get a fresh diff before executing again.`,
        );
      }
    }

    // 3. Contacts (website, phone): additive only — only creates if not already present.
    const contactFields = fieldsToWrite.filter((d) => ['website', 'phone'].includes(d.field));
    for (const cf of contactFields) {
      await this.contactsService.createForPlace(target.id, {
        contact_type: cf.field,
        value: cf.after as string,
        is_primary: true,
        display_order: 0,
      } as Parameters<typeof this.contactsService.createForPlace>[1]);
    }

    // 4. Record source attributions for all observations (idempotent via existing dedup check).
    await this.recordProvenance(candidate, target.id, actorId, DEFAULT_RECHECK_DAYS);
  }

}
