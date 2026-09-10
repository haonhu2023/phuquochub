import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { EvidenceArtifactsRepository } from './repositories/evidence-artifacts.repository';
import { PlaceFieldEvidenceLinksRepository } from './repositories/place-field-evidence-links.repository';
import { EvidenceReviewsRepository } from './repositories/evidence-reviews.repository';
import { EvidenceArtifact } from './entities/evidence-artifact.entity';
import { PlaceTranslationEvidenceLink } from './entities/place-translation-evidence-link.entity';
import { PlaceFieldEvidenceLink } from './entities/place-field-evidence-link.entity';
import { EvidenceReview, EvidenceReviewDecision } from './entities/evidence-review.entity';
import { PlacesRepository, PlaceDetailRow } from '../places/repositories/places.repository';
import { SourcesRepository } from '../sources/repositories/sources.repository';
import { computeFieldValueHash } from './field-value-hash';
import { GATE_PASSING_VERIFICATION_STATUSES } from './evidence-trust';
import { Clock } from '../../common/clock';
import { isUniqueViolation } from '../../common/db/unique-violation';
import {
  evaluateOpeningHoursOfficialStableV1,
  type PolicyEvaluationResult,
  type ScheduleStability,
} from './policy/opening-hours-official-stable-v1.policy';

// Maps a field_name accepted by PlaceFieldEvidenceLink to how its CURRENT value is actually read.
// Deliberately explicit and small, not a closed enum on the column itself (field_name stays
// free-form VARCHAR, same ADR-020 reasoning as before) — but computing a "current value hash"
// requires knowing where that value lives, so a field with no resolver here cannot be given a
// current-value binding. Extend this map, not the schema, when a new field
// (phone/website/address/price/operating status) needs current-value evidence.
const PLACE_FIELD_VALUE_READERS: Record<string, (place: PlaceDetailRow) => unknown> = {
  opening_hours: (place) => place.opening_hours,
  short_description: (place) => place.short_description,
};

export interface EnsureEvidenceArtifactInput {
  sourceId: string;
  businessKey: string;
  evidenceType: string;
  sourceUrl: string;
  capturedAt: Date;
  contentHashSha256: string;
  storageReference?: string | null;
  verificationStatus: string;
  licenseStatus?: string | null;
  metadata?: Record<string, unknown> | null;
}

// GATE_PASSING_VERIFICATION_STATUSES now lives in ./evidence-trust.ts (re-exported here for
// existing importers of this module) — moved out so PlacesRepository.rightNow() can use the same
// gate without creating a circular import (this file already imports PlacesRepository).
export { GATE_PASSING_VERIFICATION_STATUSES };

const SHA256_HEX = /^[0-9a-f]{64}$/;

export interface ReviewEvidenceArtifactInput {
  evidenceArtifactId: string;
  decision: EvidenceReviewDecision;
  reviewerName: string;
  reviewedAt: Date;
  /** Digest of the approval receipt itself — the idempotency/conflict key alongside evidenceArtifactId. */
  approvalArtifactSha256: string;
  claimType: string;
  scheduleStability: ScheduleStability;
  /** The evidence content hash this specific approval receipt attests it reviewed. */
  evidenceContentSha256: string;
  reviewNote?: string | null;
  /** Optional — if supplied, binds evidence_artifacts.verifiedBy when this review results in VERIFIED. */
  reviewerUserId?: string | null;
}

export interface ReviewEvidenceArtifactResult {
  review: EvidenceReview;
  evaluation: PolicyEvaluationResult;
  /** True iff evidence_artifacts.verificationStatus is VERIFIED as a result of (or already because of) this exact review. */
  evidenceVerified: boolean;
  /** True when this call was a no-op replay of an already-recorded review (same evidence + same receipt digest + same payload). */
  idempotentReplay: boolean;
}

function sameReviewPayload(existing: EvidenceReview, input: ReviewEvidenceArtifactInput, claimType: string, reviewerName: string): boolean {
  return (
    existing.decision === input.decision &&
    existing.reviewerName === reviewerName &&
    existing.reviewedAt.getTime() === input.reviewedAt.getTime() &&
    existing.claimType === claimType &&
    existing.evidenceContentSha256 === input.evidenceContentSha256 &&
    (existing.reviewNote ?? null) === (input.reviewNote ?? null)
  );
}

@Injectable()
export class EvidenceService {
  constructor(
    private readonly repo: EvidenceArtifactsRepository,
    private readonly fieldLinksRepo: PlaceFieldEvidenceLinksRepository,
    private readonly reviewsRepo: EvidenceReviewsRepository,
    private readonly placesRepo: PlacesRepository,
    private readonly sourcesRepo: SourcesRepository,
    private readonly clock: Clock,
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  // Idempotent theo business_key (workbook evidence_id). KHÔNG BAO GIỜ nâng verificationStatus của
  // một hàng đã tồn tại lên cao hơn — nếu hàng đã có, trả về nguyên trạng, không ghi đè. Import lại
  // đúng workbook business_key hai lần là no-op, không tạo bản ghi thứ hai.
  async ensureEvidenceArtifact(input: EnsureEvidenceArtifactInput): Promise<EvidenceArtifact> {
    const existing = await this.repo.findByBusinessKey(input.businessKey);
    if (existing) return existing;

    const row = this.repo.create({
      sourceId: input.sourceId,
      businessKey: input.businessKey,
      evidenceType: input.evidenceType,
      sourceUrl: input.sourceUrl,
      capturedAt: input.capturedAt,
      contentHashSha256: input.contentHashSha256,
      storageReference: input.storageReference ?? null,
      verificationStatus: input.verificationStatus,
      licenseStatus: input.licenseStatus ?? null,
      verifiedBy: null,
      verifiedAt: null,
      metadata: input.metadata ?? null,
    });
    return this.repo.save(row);
  }

  // Idempotent theo UNIQUE(translation_id, evidence_id) ở migration — gọi lại với cùng cặp là no-op.
  async linkEvidenceToTranslation(
    translationId: string,
    evidenceId: string,
    relationshipType = 'SUPPORTS',
  ): Promise<PlaceTranslationEvidenceLink> {
    const existing = await this.repo.findLink(translationId, evidenceId);
    if (existing) return existing;
    const row = this.repo.createLink({ translationId, evidenceId, relationshipType });
    return this.repo.saveLink(row);
  }

  // Cổng gate cho một translation: PASS chỉ khi CÓ ít nhất một evidence link VÀ MỌI evidence liên
  // kết đều ở trạng thái "đã xác minh thật" (xem GATE_PASSING_VERIFICATION_STATUSES). Không có
  // link nào → BLOCKED (thiếu evidence). Có link nhưng còn NEEDS_REVIEW → HOLD, không phải PASS —
  // đây chính là quy tắc "NEEDS_REVIEW evidence → translation/release giữ HOLD" mà task yêu cầu.
  async evaluateTranslationEvidenceGate(translationId: string): Promise<{
    status: 'PASS' | 'HOLD' | 'BLOCKED';
    linkedEvidenceCount: number;
    needsReviewCount: number;
  }> {
    const links = await this.repo.listLinksByTranslation(translationId);
    if (links.length === 0) {
      return { status: 'BLOCKED', linkedEvidenceCount: 0, needsReviewCount: 0 };
    }

    let needsReviewCount = 0;
    for (const link of links) {
      const evidence = await this.repo.findById(link.evidenceId);
      if (!evidence || !GATE_PASSING_VERIFICATION_STATUSES.has(evidence.verificationStatus)) {
        needsReviewCount += 1;
      }
    }

    return {
      status: needsReviewCount === 0 ? 'PASS' : 'HOLD',
      linkedEvidenceCount: links.length,
      needsReviewCount,
    };
  }

  // Place-field evidence V0 — links an EXISTING evidence_artifact to a named scalar field on a
  // place, pinned to the field's value AT LINK TIME via fieldValueHash (see field-value-hash.ts —
  // same sha256(canonicalJson(value)) idiom as place_translations.source_text_hash). A row alone
  // never means "supports the current value" — only listCurrentEvidenceForPlaceField's comparison
  // against the LIVE value does. Deliberately does NOT touch places.verification_status/verified_at
  // — see PLACES-026 trust-model note: linking evidence to one field must never read as "the whole
  // place is now trusted."
  //
  // Existence checks happen HERE, explicitly, before the insert — same pattern as
  // SourcesService.attachAttribution's `await this.getSource(...)` (clearer error than relying on
  // the FK violation alone, even though the FK is still the real backstop). Reuses
  // getCardByIdIncludingInactive for BOTH the existence check and the current value read — one
  // query, not two — since we need the row's actual field value regardless.
  async linkEvidenceToPlaceField(placeId: string, fieldName: string, evidenceArtifactId: string): Promise<PlaceFieldEvidenceLink> {
    const trimmedField = fieldName?.trim();
    if (!trimmedField) {
      throw new Error('fieldName must not be blank');
    }

    const readCurrentValue = PLACE_FIELD_VALUE_READERS[trimmedField];
    if (!readCurrentValue) {
      throw new BadRequestException(`fieldName "${trimmedField}" has no current-value reader registered`);
    }

    const place = await this.placesRepo.getCardByIdIncludingInactive(placeId);
    if (!place) {
      throw new NotFoundException(`Place ${placeId} not found`);
    }

    const evidence = await this.repo.findById(evidenceArtifactId);
    if (!evidence) {
      throw new NotFoundException(`Evidence artifact ${evidenceArtifactId} not found`);
    }

    const fieldValueHash = computeFieldValueHash(readCurrentValue(place));

    const existing = await this.fieldLinksRepo.findLink(placeId, trimmedField, evidenceArtifactId, fieldValueHash);
    if (existing) return existing;

    const row = this.fieldLinksRepo.create({ placeId, fieldName: trimmedField, evidenceArtifactId, fieldValueHash });
    return this.fieldLinksRepo.save(row);
  }

  // Read-only lookup, scoped to exactly one (place, field) pair — ALL history, every
  // field_value_hash. A different field on the same place, or the same field on a different place,
  // must never leak into the result (verified by
  // PlaceFieldEvidenceLinksRepository.listByPlaceAndField's WHERE clause + the covering index). Not
  // proof of current-value support — a link here may back a since-superseded value. Use
  // listCurrentEvidenceForPlaceField for a current-value claim.
  listEvidenceForPlaceField(placeId: string, fieldName: string): Promise<PlaceFieldEvidenceLink[]> {
    return this.fieldLinksRepo.listByPlaceAndField(placeId, fieldName);
  }

  // THE current-value query: computes the field's LIVE value hash and returns only links pinned to
  // that exact hash. A link created against a value the field no longer holds (T1: value A linked;
  // T2: value changes to B) is real, retained history that simply will not appear here once the
  // value has moved on — it is never counted as support for the new value. If the place cannot be
  // found, there is no "current value" to compare against, so the honest answer is an empty result,
  // not an error (mirrors listEvidenceForPlaceField's read-only leniency).
  async listCurrentEvidenceForPlaceField(placeId: string, fieldName: string): Promise<PlaceFieldEvidenceLink[]> {
    const readCurrentValue = PLACE_FIELD_VALUE_READERS[fieldName];
    if (!readCurrentValue) {
      throw new BadRequestException(`fieldName "${fieldName}" has no current-value reader registered`);
    }

    const place = await this.placesRepo.getCardByIdIncludingInactive(placeId);
    if (!place) return [];

    const currentHash = computeFieldValueHash(readCurrentValue(place));
    return this.fieldLinksRepo.listCurrentByPlaceAndField(placeId, fieldName, currentHash);
  }

  // Opening-Hours Evidence Governance v1 — THE (only) write path that may move
  // evidence_artifacts.verificationStatus to a real, human-reviewed VERIFIED. Deliberately NOT named
  // `markVerified(id)`: every call runs the full OPENING_HOURS_OFFICIAL_STABLE_V1 policy evaluator
  // and records an append-only evidence_reviews row REGARDLESS of the outcome — there is no raw
  // bypass. A NEEDS_CHANGES/REJECT decision, or an APPROVE that the evaluator still finds
  // ineligible (hash mismatch, stale capture, non-first-party source, temporary schedule, already
  // expired), is audited exactly the same as an eligible APPROVE — it simply never flips the
  // evidence row to VERIFIED.
  //
  // One transaction (dataSource.transaction, same convention as VerificationsService): read
  // evidence + source fresh, run the evaluator, INSERT the review row, and — only when APPROVE +
  // eligible — UPDATE the SAME evidence_artifacts row's verifiedAt/verifiedBy/
  // verificationExpiresAt/approvalArtifactSha256/freshnessPolicyKey/freshnessPolicyVersion, all
  // inside the one transaction (task requirement: audit row and denormalized current-state must
  // commit together or not at all). Never touches contentHashSha256/capturedAt (the evidence's own
  // immutable facts), never touches places.verificationStatus (this is evidence governance, not a
  // field-value edit — no wiki revision is created here, matching linkEvidenceToPlaceField's same
  // "linking/reviewing evidence is not editing the place" boundary).
  //
  // Idempotent by (evidenceArtifactId, approvalArtifactSha256): replaying the exact same submission
  // (same decision/reviewer/reviewedAt/claimType/evidenceContentSha256/note) is a true no-op — it
  // returns the already-recorded row without a second INSERT or a second evidence UPDATE. The SAME
  // digest reused with a DIFFERENT payload is a real conflict (409), never a silent overwrite — a
  // digest is supposed to uniquely identify one receipt, so a mismatch signals either a caller bug
  // or a tampering attempt, not "just apply the new values."
  async reviewEvidenceArtifact(input: ReviewEvidenceArtifactInput): Promise<ReviewEvidenceArtifactResult> {
    const reviewerName = input.reviewerName?.trim();
    if (!reviewerName) {
      throw new BadRequestException('reviewerName must not be blank');
    }
    const claimType = input.claimType?.trim();
    if (!claimType) {
      throw new BadRequestException('claimType must not be blank');
    }
    if (!SHA256_HEX.test(input.approvalArtifactSha256)) {
      throw new BadRequestException('approvalArtifactSha256 must be 64 lowercase hex characters');
    }
    if (!SHA256_HEX.test(input.evidenceContentSha256)) {
      throw new BadRequestException('evidenceContentSha256 must be 64 lowercase hex characters');
    }

    return this.dataSource.transaction<ReviewEvidenceArtifactResult>(async (manager) => {
      const evidence = await this.repo.findById(input.evidenceArtifactId, manager);
      if (!evidence) {
        throw new NotFoundException(`Evidence artifact ${input.evidenceArtifactId} not found`);
      }

      const existing = await this.reviewsRepo.findByEvidenceAndReceipt(input.evidenceArtifactId, input.approvalArtifactSha256, manager);
      if (existing) {
        if (!sameReviewPayload(existing, input, claimType, reviewerName)) {
          throw new ConflictException(
            `Approval receipt ${input.approvalArtifactSha256} was already recorded for evidence artifact ` +
              `${input.evidenceArtifactId} with a different decision/reviewer/claim/evidence hash. A digest ` +
              `must uniquely identify one approval payload — resolve the mismatch, do not resubmit.`,
          );
        }
        // True replay — same evidence, same receipt digest, same payload: return the already-recorded
        // outcome. Re-evaluating (informational only) is safe and side-effect-free; no second write.
        const source = await this.sourcesRepo.findById(evidence.sourceId, manager);
        const evaluation = evaluateOpeningHoursOfficialStableV1({
          claimType,
          sourceType: source?.type ?? '',
          scheduleStability: input.scheduleStability,
          capturedAt: evidence.capturedAt,
          reviewedAt: existing.reviewedAt,
          now: this.clock.now(),
          currentEvidenceContentHash: evidence.contentHashSha256,
          approvalBoundEvidenceHash: existing.evidenceContentSha256,
          decision: existing.decision,
        });
        return {
          review: existing,
          evaluation,
          evidenceVerified: evidence.verificationStatus === 'VERIFIED' && evidence.approvalArtifactSha256 === existing.approvalArtifactSha256,
          idempotentReplay: true,
        };
      }

      const source = await this.sourcesRepo.findById(evidence.sourceId, manager);
      const evaluation = evaluateOpeningHoursOfficialStableV1({
        claimType,
        sourceType: source?.type ?? '',
        scheduleStability: input.scheduleStability,
        capturedAt: evidence.capturedAt,
        reviewedAt: input.reviewedAt,
        now: this.clock.now(),
        currentEvidenceContentHash: evidence.contentHashSha256,
        approvalBoundEvidenceHash: input.evidenceContentSha256,
        decision: input.decision,
      });

      const willVerify = input.decision === 'APPROVE' && evaluation.eligible;

      let review: EvidenceReview;
      try {
        review = await this.reviewsRepo.save(
          this.reviewsRepo.create({
            evidenceArtifactId: evidence.id,
            decision: input.decision,
            reviewerName,
            reviewedAt: input.reviewedAt,
            approvalArtifactSha256: input.approvalArtifactSha256,
            claimType,
            policyKey: evaluation.policyKey,
            policyVersion: evaluation.policyVersion,
            evidenceContentSha256: input.evidenceContentSha256,
            verificationExpiresAt: willVerify ? evaluation.verificationExpiresAt : null,
            reviewNote: input.reviewNote ?? null,
          }),
          manager,
        );
      } catch (err) {
        if (isUniqueViolation(err, 'uq_evidence_review_receipt')) {
          // Lost a race against a concurrent identical submission — same handling as a pre-read hit.
          throw new ConflictException(
            `Approval receipt ${input.approvalArtifactSha256} for evidence artifact ${input.evidenceArtifactId} ` +
              `was just recorded by a concurrent request — read back and retry.`,
          );
        }
        throw err;
      }

      if (willVerify) {
        evidence.verificationStatus = 'VERIFIED';
        evidence.verifiedAt = input.reviewedAt;
        evidence.verifiedBy = input.reviewerUserId ?? null;
        evidence.verificationExpiresAt = evaluation.verificationExpiresAt;
        evidence.approvalArtifactSha256 = input.approvalArtifactSha256;
        evidence.freshnessPolicyKey = evaluation.policyKey;
        evidence.freshnessPolicyVersion = evaluation.policyVersion;
        await this.repo.save(evidence, manager);
      }

      return { review, evaluation, evidenceVerified: willVerify, idempotentReplay: false };
    });
  }
}
