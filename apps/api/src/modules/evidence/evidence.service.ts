import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
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
import { evaluateOpeningHoursFieldBoundV2, type FieldBoundPolicyEvaluationResult } from './policy/opening-hours-field-bound-v2.policy';

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
  /** Digest of the approval receipt itself — the idempotency/conflict key alongside evidenceArtifactId. */
  approvalArtifactSha256: string;
  claimType: string;
  scheduleStability: ScheduleStability;
  /** The evidence content hash this specific approval receipt attests it reviewed. */
  evidenceContentSha256: string;
  reviewNote?: string | null;
  /** Optional — if supplied, binds evidence_artifacts.verifiedBy when this review results in VERIFIED. */
  reviewerUserId?: string | null;
  /**
   * Evidence Field-Binding V2 — supply ALL THREE (or none) to bind this review to an exact
   * (evidenceArtifactId, placeId, fieldName, fieldValueHash) tuple, the ADR-022 follow-up policy.
   * Omitting all three preserves V1 semantics exactly (an unbound, content-only review). Supplying
   * only some of the three is rejected outright — see the all-three-or-none check below.
   * `fieldValueHash` is the CALLER's asserted hash; the service independently recomputes the
   * place's CURRENT field value hash and only trusts that recomputed value for eligibility — a
   * mismatch fails the review (FIELD_VALUE_HASH_MISMATCH), same posture as evidenceContentSha256.
   */
  placeId?: string;
  fieldName?: string;
  fieldValueHash?: string;
}

export interface ReviewEvidenceArtifactResult {
  review: EvidenceReview;
  evaluation: PolicyEvaluationResult | FieldBoundPolicyEvaluationResult;
  /** True iff evidence_artifacts.verificationStatus is VERIFIED as a result of (or already because of) this exact review. */
  evidenceVerified: boolean;
  /** True when this call was a no-op replay of an already-recorded review (same evidence + same receipt digest + same payload). */
  idempotentReplay: boolean;
}

// Carries a unique-violation's raw driver error out of a `dataSource.transaction()` callback
// unchanged. A unique violation inside a Postgres transaction aborts the WHOLE transaction — any
// further statement on that same connection/manager fails with "current transaction is aborted"
// until rollback — so recovery must happen AFTER `dataSource.transaction()` has itself rolled back,
// via a fresh, non-transactional read, never by continuing to use the manager the callback received.
class EvidenceReviewRaceLost extends Error {
  constructor(readonly dbError: unknown) {
    super('evidence review insert lost a unique-constraint race');
  }
}

// reviewedAt is deliberately EXCLUDED from payload identity — it is server time-stamped at call time
// (see reviewEvidenceArtifact below), not caller input, so a true replay of the same submission will
// always carry a DIFFERENT reviewedAt than the original (the clock has moved on). What must match for
// a call to count as "the same submission" is everything the caller actually asserts.
function sameReviewPayload(existing: EvidenceReview, input: ReviewEvidenceArtifactInput, claimType: string, reviewerName: string): boolean {
  return (
    existing.decision === input.decision &&
    existing.reviewerName === reviewerName &&
    existing.claimType === claimType &&
    existing.evidenceContentSha256 === input.evidenceContentSha256 &&
    (existing.reviewNote ?? null) === (input.reviewNote ?? null) &&
    // Evidence Field-Binding V2 replay identity: the SAME receipt digest replayed with an IDENTICAL
    // full binding is the same submission (a true no-op replay); the same digest with a place/field/
    // fieldValueHash that differs from what was originally recorded is a real conflict — a receipt
    // digest is supposed to uniquely identify one (evidence, place, field, value) approval, so a
    // mismatch here is either a caller bug or a tampering attempt, never "apply the new binding".
    (existing.placeId ?? null) === (input.placeId ?? null) &&
    (existing.fieldName ?? null) === (input.fieldName ?? null) &&
    (existing.fieldValueHash ?? null) === (input.fieldValueHash ?? null)
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

    // Evidence Field-Binding V2 link-write guard (opening_hours only — see ADR-022 "Known
    // limitation") — a NEW operational link may only be created when a qualifying field-bound
    // review ALREADY exists for this EXACT tuple (evidenceArtifactId, placeId, "opening_hours",
    // fieldValueHash): latest review for the tuple is APPROVE and still unexpired. Without this,
    // an already-VERIFIED artifact (reviewed for a different place/value entirely) could be
    // re-linked here and immediately clear the read gate with zero human review of THIS binding.
    // short_description is intentionally unaffected — this policy version governs opening_hours
    // only (see evaluateOpeningHoursFieldBoundV2's own FIELD_NAME_UNSUPPORTED rule).
    if (trimmedField === 'opening_hours') {
      const latestReview = await this.reviewsRepo.findLatestForTuple(evidenceArtifactId, placeId, trimmedField, fieldValueHash);
      const qualifies =
        latestReview?.decision === 'APPROVE' &&
        latestReview.verificationExpiresAt !== null &&
        latestReview.verificationExpiresAt.getTime() > this.clock.now().getTime();
      if (!qualifies) {
        throw new ConflictException(
          `No qualifying Evidence Field-Binding V2 review exists for evidence artifact ${evidenceArtifactId} bound ` +
            `to place ${placeId}, field "opening_hours", current value hash ${fieldValueHash}. Submit a field-bound, ` +
            `eligible APPROVE via EvidenceService.reviewEvidenceArtifact for this exact tuple before linking.`,
        );
      }
    }

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
  // (same decision/reviewer/claimType/evidenceContentSha256/note) is a true no-op — it returns the
  // already-recorded row without a second INSERT or a second evidence UPDATE. The SAME digest reused
  // with a DIFFERENT payload is a real conflict (409), never a silent overwrite — a digest is
  // supposed to uniquely identify one receipt, so a mismatch signals either a caller bug or a
  // tampering attempt, not "just apply the new values."
  //
  // `reviewedAt` is ALWAYS server time (this.clock.now(), captured once per call) — deliberately
  // NOT accepted as caller input. A capture-age gate that trusted a client-supplied "when I reviewed
  // this" timestamp could be defeated by backdating it close to captured_at, making a review that is
  // actually happening long after capture appear to fall inside the 168-hour window. The evaluator's
  // `now` (the expiry check) already used the injected clock; this closes the same gap for the
  // capture-age check.
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

    // Evidence Field-Binding V2 — all-three-or-none, checked before opening a transaction (same
    // posture as every other input-shape validation above). Supplying only some of the three is
    // rejected outright: a partial binding could never be persisted anyway (DB CHECK constraint),
    // but failing fast here gives a caller a clear reason instead of a raw constraint-violation error.
    const bindingFieldsGiven = [input.placeId, input.fieldName, input.fieldValueHash].filter((v) => v != null);
    if (bindingFieldsGiven.length > 0 && bindingFieldsGiven.length < 3) {
      throw new BadRequestException(
        'placeId, fieldName and fieldValueHash must be supplied all together (Evidence Field-Binding V2) or all omitted (unbound V1 review)',
      );
    }
    const isFieldBound = bindingFieldsGiven.length === 3;
    if (isFieldBound) {
      if (!input.fieldName!.trim()) {
        throw new BadRequestException('fieldName must not be blank');
      }
      if (!SHA256_HEX.test(input.fieldValueHash!)) {
        throw new BadRequestException('fieldValueHash must be 64 lowercase hex characters');
      }
    }

    const reviewedAt = this.clock.now();

    // Resolves the evaluator for one evidence/source/binding combination — shared by the replay path
    // (uses the ORIGINALLY recorded decision/reviewedAt/binding off `existing`) and the fresh-review
    // path (uses this call's own input) below, so the V1-vs-V2 branch is written exactly once.
    const resolveEvaluation = async (params: {
      evidence: EvidenceArtifact;
      decision: EvidenceReviewDecision;
      reviewedAtForEvaluation: Date;
      approvalBoundEvidenceHash: string;
      binding: { placeId: string; fieldName: string; approvalBoundFieldValueHash: string } | null;
      manager?: EntityManager;
    }): Promise<{ evaluation: PolicyEvaluationResult | FieldBoundPolicyEvaluationResult }> => {
      const source = await this.sourcesRepo.findById(params.evidence.sourceId, params.manager);
      const baseInput = {
        claimType,
        sourceType: source?.type ?? '',
        scheduleStability: input.scheduleStability,
        capturedAt: params.evidence.capturedAt,
        reviewedAt: params.reviewedAtForEvaluation,
        now: this.clock.now(),
        currentEvidenceContentHash: params.evidence.contentHashSha256,
        approvalBoundEvidenceHash: params.approvalBoundEvidenceHash,
        decision: params.decision,
      };
      if (!params.binding) {
        return { evaluation: evaluateOpeningHoursOfficialStableV1(baseInput) };
      }

      // The service independently resolves the place's CURRENT field value and computes its own
      // hash — `approvalBoundFieldValueHash` (the caller's/receipt's assertion) is only ever
      // COMPARED against this for ELIGIBILITY, never trusted alone and never persisted in its place.
      // A missing place or an unregistered field reader resolves to a hash that can never
      // legitimately match any receipt, so the binding fails closed (FIELD_VALUE_HASH_MISMATCH)
      // rather than silently skipping the field-bound gate.
      const place = await this.placesRepo.getCardByIdIncludingInactive(params.binding.placeId);
      const reader = PLACE_FIELD_VALUE_READERS[params.binding.fieldName];
      const currentFieldValueHash = place && reader ? computeFieldValueHash(reader(place)) : '';
      const evaluation = evaluateOpeningHoursFieldBoundV2({
        ...baseInput,
        fieldName: params.binding.fieldName,
        approvalBoundFieldValueHash: params.binding.approvalBoundFieldValueHash,
        currentFieldValueHash,
      });
      return { evaluation };
    };

    const buildReplayResult = async (evidence: EvidenceArtifact, existing: EvidenceReview): Promise<ReviewEvidenceArtifactResult> => {
      // Re-evaluating is informational only (no write) — uses the ORIGINALLY recorded reviewedAt
      // and binding, not this call's, so a replay's age/binding calculation never drifts from what
      // was actually decided. Reads outside any transaction (manager omitted) — always safe: this
      // evidence/source/place state is only ever read here, never written, and the review row is by
      // definition already committed.
      const { evaluation } = await resolveEvaluation({
        evidence,
        decision: existing.decision,
        reviewedAtForEvaluation: existing.reviewedAt,
        approvalBoundEvidenceHash: existing.evidenceContentSha256,
        binding:
          existing.placeId && existing.fieldName && existing.fieldValueHash
            ? { placeId: existing.placeId, fieldName: existing.fieldName, approvalBoundFieldValueHash: existing.fieldValueHash }
            : null,
      });
      return {
        review: existing,
        evaluation,
        evidenceVerified: evidence.verificationStatus === 'VERIFIED' && evidence.approvalArtifactSha256 === existing.approvalArtifactSha256,
        idempotentReplay: true,
      };
    };

    try {
      return await this.dataSource.transaction<ReviewEvidenceArtifactResult>(async (manager) => {
        const evidence = await this.repo.findById(input.evidenceArtifactId, manager);
        if (!evidence) {
          throw new NotFoundException(`Evidence artifact ${input.evidenceArtifactId} not found`);
        }

        const existing = await this.reviewsRepo.findByEvidenceAndReceipt(input.evidenceArtifactId, input.approvalArtifactSha256, manager);
        if (existing) {
          if (!sameReviewPayload(existing, input, claimType, reviewerName)) {
            // A legacy V1 (unbound) row sitting at this exact digest is the most likely real-world
            // case of this branch, not a random collision: someone reusing an OLD V1 approval
            // receipt's digest while trying to submit a NEW V2-bound review for the same evidence.
            // UNIQUE(evidence_artifact_id, approval_artifact_sha256) means that can never become a
            // second row — this always surfaces as a conflict, never a silent no-op or a false
            // "verified" success, and the V1 row itself is never touched (the throw happens before
            // any write). The fix on the caller's side is to mint a NEW approval_artifact_sha256 for
            // the new (place, field, value)-bound submission — a digest identifies ONE approval
            // payload, and V1-content-only vs V2-field-bound are different payloads by definition.
            const wasUnboundNowBound = existing.placeId === null && input.placeId != null;
            throw new ConflictException(
              `Approval receipt ${input.approvalArtifactSha256} was already recorded for evidence artifact ` +
                `${input.evidenceArtifactId} with a different decision/reviewer/claim/evidence hash or a different ` +
                `place/field/value binding. A digest must uniquely identify one approval payload — resolve the ` +
                `mismatch, do not resubmit.` +
                (wasUnboundNowBound
                  ? ` The existing row is an unbound legacy (V1) review; reusing its receipt digest to submit a ` +
                    `NEW field-bound (V2) review is not supported — mint a new approval_artifact_sha256 for the ` +
                    `V2-bound approval (V2_APPROVAL_RECEIPT_REQUIRED).`
                  : ''),
            );
          }
          return buildReplayResult(evidence, existing);
        }

        const { evaluation } = await resolveEvaluation({
          evidence,
          decision: input.decision,
          reviewedAtForEvaluation: reviewedAt,
          approvalBoundEvidenceHash: input.evidenceContentSha256,
          binding: isFieldBound
            ? { placeId: input.placeId!, fieldName: input.fieldName!.trim(), approvalBoundFieldValueHash: input.fieldValueHash! }
            : null,
          manager,
        });

        const willVerify = input.decision === 'APPROVE' && evaluation.eligible;

        let review: EvidenceReview;
        try {
          review = await this.reviewsRepo.save(
            this.reviewsRepo.create({
              evidenceArtifactId: evidence.id,
              decision: input.decision,
              reviewerName,
              reviewedAt,
              approvalArtifactSha256: input.approvalArtifactSha256,
              claimType,
              policyKey: evaluation.policyKey,
              policyVersion: evaluation.policyVersion,
              evidenceContentSha256: input.evidenceContentSha256,
              verificationExpiresAt: willVerify ? evaluation.verificationExpiresAt : null,
              reviewNote: input.reviewNote ?? null,
              // Persists what the RECEIPT ITSELF ASSERTS (input.fieldValueHash), never the
              // server-resolved current hash — the review row is an immutable record of what was
              // actually attested to, not a snapshot of evaluation state. When eligible, these are
              // the SAME value by construction (eligibility literally requires
              // approvalBoundFieldValueHash === currentFieldValueHash — see
              // evaluateOpeningHoursFieldBoundV2's FIELD_VALUE_HASH_MISMATCH rule), so the gate/
              // link-write-guard matching against a place_field_evidence_links row's own current-hash
              // is unaffected for any review that could ever pass. When INELIGIBLE (a genuine
              // mismatch), persisting the caller's own value here — rather than substituting in the
              // current DB hash — is what keeps replay identity correct: a true retry of the exact
              // same (mismatched) submission must still compare equal to itself on a second call
              // (idempotent no-op), which silently swapping in a different, evaluation-time-only
              // value would break. format-validated (SHA256_HEX) before the transaction opened, so
              // this is always a well-formed hash whenever isFieldBound is true.
              placeId: isFieldBound ? input.placeId! : null,
              fieldName: isFieldBound ? input.fieldName!.trim() : null,
              fieldValueHash: isFieldBound ? input.fieldValueHash! : null,
            }),
            manager,
          );
        } catch (err) {
          if (isUniqueViolation(err, 'uq_evidence_review_receipt')) {
            throw new EvidenceReviewRaceLost(err);
          }
          throw err;
        }

        if (willVerify) {
          evidence.verificationStatus = 'VERIFIED';
          evidence.verifiedAt = reviewedAt;
          evidence.verifiedBy = input.reviewerUserId ?? null;
          evidence.verificationExpiresAt = evaluation.verificationExpiresAt;
          evidence.approvalArtifactSha256 = input.approvalArtifactSha256;
          evidence.freshnessPolicyKey = evaluation.policyKey;
          evidence.freshnessPolicyVersion = evaluation.policyVersion;
          await this.repo.save(evidence, manager);
        }

        return { review, evaluation, evidenceVerified: willVerify, idempotentReplay: false };
      });
    } catch (err) {
      if (!(err instanceof EvidenceReviewRaceLost)) {
        throw err;
      }
      // The transaction above has already been rolled back by TypeORM (the callback threw) — this
      // read is deliberately NOT transactional, and deliberately a SEPARATE read of `evidence` too
      // (the one captured inside the rolled-back transaction must not be reused: any assignment made
      // to it before the throw was rolled back along with everything else).
      const evidence = await this.repo.findById(input.evidenceArtifactId);
      const winner = await this.reviewsRepo.findByEvidenceAndReceipt(input.evidenceArtifactId, input.approvalArtifactSha256);
      if (evidence && winner && sameReviewPayload(winner, input, claimType, reviewerName)) {
        return buildReplayResult(evidence, winner);
      }
      throw new ConflictException(
        `Approval receipt ${input.approvalArtifactSha256} for evidence artifact ${input.evidenceArtifactId} ` +
          `was just recorded by a concurrent request with a different payload — read back and retry.`,
      );
    }
  }
}
