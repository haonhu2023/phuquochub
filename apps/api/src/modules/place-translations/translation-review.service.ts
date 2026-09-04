import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { PlaceTranslationsRepository, ReviewQueueFilter, ReviewQueueRow } from './repositories/place-translations.repository';
import { PlaceTranslation } from './entities/place-translation.entity';
import { RevisionsService } from '../revisions/revisions.service';
import { RevisionOrigin, RevisionStatus } from '../revisions/revision.enums';
import { UsersRepository } from '../users/repositories/users.repository';
import { AuthorizationService } from '../authz/authorization.service';
import { HumanReviewStatus, TranslationApprovalStatus } from '../multilingual-import/multilingual-import.enums';
import { decodeReviewQueueCursor, encodeReviewQueueCursor, InvalidReviewQueueCursorError } from './review-queue-cursor';

// The controller-facing filter shape: `cursor` here is the OPAQUE wire string (or absent for page
// 1); this service decodes it before handing a real (created_at, id) pair to the repository.
export type ListReviewQueueParams = Omit<ReviewQueueFilter, 'cursor'> & { cursor?: string };

export interface ReviewQueuePageResult {
  rows: ReviewQueueRow[];
  // Pass back verbatim as `?cursor=` to fetch the next page; null means this was the last page.
  nextCursor: string | null;
}

export const PLACE_TRANSLATION_REVIEW_PERMISSION = 'PlaceTranslation.Review.Any';

// UX-facing cap (Phase 6): chosen so `decision` (max label length 13, "NEEDS_CHANGES") + actorId
// (uuid, 36 chars) + fixed prefix text + " — " + notes always fits inside wiki_revisions
// .change_note's real varchar(300) limit with margin to spare — the previous governance script hit
// that exact 300-char DB error by not budgeting for it. The service still defensively .slice(0,300)
// as a backstop, but with this cap it should never actually need to truncate.
export const REVIEW_NOTES_MAX_LENGTH = 200;

// Prior human_review_status values a translation may be reviewed FROM. APPROVED/REJECTED are
// deliberately excluded — once decided, that exact row is not re-reviewable through this method (a
// second decision on an already-decided row is exactly the "stale tab" scenario Phase 5 requires be
// rejected, not silently overwritten). NEEDS_CHANGES is reviewable again: a reviewer may reconsider
// the same text without requiring a content edit first.
const REVIEWABLE_PRIOR_STATUSES: readonly string[] = [HumanReviewStatus.PENDING, HumanReviewStatus.NEEDS_CHANGES];

export type TranslationReviewDecision =
  | HumanReviewStatus.APPROVED
  | HumanReviewStatus.REJECTED
  | HumanReviewStatus.NEEDS_CHANGES;

interface ReviewOutcome {
  revisionStatus: RevisionStatus;
  humanReviewStatus: HumanReviewStatus;
  translationStatus: TranslationApprovalStatus;
  isPublic: boolean;
  isProductionData: boolean;
  productionEligible: boolean;
}

function deriveReviewOutcome(decision: TranslationReviewDecision): ReviewOutcome {
  switch (decision) {
    case HumanReviewStatus.APPROVED:
      return {
        revisionStatus: RevisionStatus.APPROVED,
        humanReviewStatus: HumanReviewStatus.APPROVED,
        translationStatus: TranslationApprovalStatus.APPROVED,
        isPublic: true,
        isProductionData: true,
        productionEligible: true,
      };
    case HumanReviewStatus.REJECTED:
      return {
        revisionStatus: RevisionStatus.REJECTED,
        humanReviewStatus: HumanReviewStatus.REJECTED,
        translationStatus: TranslationApprovalStatus.REJECTED,
        isPublic: false,
        isProductionData: false,
        productionEligible: false,
      };
    case HumanReviewStatus.NEEDS_CHANGES:
      return {
        revisionStatus: RevisionStatus.NEEDS_CHANGES,
        humanReviewStatus: HumanReviewStatus.NEEDS_CHANGES,
        translationStatus: TranslationApprovalStatus.NEEDS_CHANGES,
        isPublic: false,
        isProductionData: false,
        productionEligible: false,
      };
  }
}

// THE single trusted write path for place_translations' human-review governance columns
// (human_review_status/translation_status/is_public/is_production_data/production_eligible).
// Built 2026-09-04 to close a fabricated-approval defect: an earlier one-off script had hardcoded
// these fields to APPROVED/true directly, with no real reviewer, decision, or timestamp behind it.
//
// CRITICAL HUMAN-REVIEW RULE (owner directive, unchanged since this workstream started): an
// approval must have a REAL review actor + decision + timestamp + target content version + audit
// trail. It must NEVER be inferred from a system/import actor, a CLI run, a migration, a seed
// file, a boolean flag, or the absence of rejection. This service is the enforcement point:
//   1. actorId must resolve to a real, active, non-service-account user (checked below) who holds
//      PLACE_TRANSLATION_REVIEW_PERMISSION via the existing RBAC PDP (AuthorizationService) — never
//      inferred from an email pattern.
//   2. The exact content version under review is `translation.revisionId` — the wiki_revisions row
//      that captured the CONTENT snapshot this decision applies to (captured in the review
//      revision's own snapshot as `reviewedContentRevisionId`, so an auditor can always prove which
//      exact text was reviewed, even after a later edit supersedes this row).
//   3. The decision is recorded as a NEW, separate wiki_revisions row for the SAME entityId
//      (the translation's own id) — reusing the existing append-only, auto-numbering
//      infrastructure (RevisionsRepository.record()) rather than a new table. This row is the one
//      wiki_revisions row in the whole system where reviewedBy/reviewedAt are ever populated.
//   4. Only after that audit row commits does this service write the derived governance flags onto
//      place_translations — via PlaceTranslationsRepository.updateReviewState(), a method no other
//      caller uses.
// Content-edit invalidation needs no extra code here: PlaceTranslationsService.publishOneTranslation
// always inserts a brand-new row (forced back to PENDING) for any content change, so an edited
// translation is never reachable through this service's `translation.isCurrent` check below without
// first losing whatever approval it had — see that file's own comment.
@Injectable()
export class TranslationReviewService {
  constructor(
    private readonly translationsRepo: PlaceTranslationsRepository,
    private readonly revisionsService: RevisionsService,
    private readonly usersRepo: UsersRepository,
    private readonly authz: AuthorizationService,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  async listReviewQueue(params: ListReviewQueueParams): Promise<ReviewQueuePageResult> {
    let cursor: ReviewQueueFilter['cursor'];
    if (params.cursor) {
      try {
        cursor = decodeReviewQueueCursor(params.cursor);
      } catch (err) {
        if (err instanceof InvalidReviewQueueCursorError) {
          throw new BadRequestException(`listReviewQueue: ${err.message}`);
        }
        throw err;
      }
    }

    const { rows, hasMore } = await this.translationsRepo.listReviewQueue({ ...params, cursor });
    const last = rows[rows.length - 1];
    return { rows, nextCursor: hasMore && last ? encodeReviewQueueCursor(last) : null };
  }

  async reviewTranslation(
    translationId: string,
    actorId: string,
    decision: TranslationReviewDecision,
    notes: string | null,
  ): Promise<PlaceTranslation> {
    // Actor validation happens BEFORE opening a transaction — a rejected actor should never even
    // start a write attempt. All three checks are named invariants this workstream must prove:
    // SYSTEM_ACTOR_CAN_APPROVE=NO, and (equally) an inactive or unauthorized user cannot approve.
    const actor = await this.usersRepo.findById(actorId);
    if (!actor) {
      throw new ForbiddenException('reviewTranslation: reviewing actor does not exist');
    }
    if (!actor.isActive) {
      throw new ForbiddenException('reviewTranslation: reviewing actor is not active');
    }
    if (actor.isServiceAccount) {
      // Closes the exact defect this workstream started from: local-staging-import-actor and any
      // future service/import principal can never be treated as a human reviewer.
      throw new ForbiddenException('reviewTranslation: a service account cannot record a human review decision');
    }
    const allowed = await this.authz.can(actorId, PLACE_TRANSLATION_REVIEW_PERMISSION);
    if (!allowed) {
      throw new ForbiddenException(`reviewTranslation: actor lacks ${PLACE_TRANSLATION_REVIEW_PERMISSION}`);
    }

    // Notes policy (Phase 6): APPROVE may stand on its own; REJECTED/NEEDS_CHANGES must explain
    // what's wrong or what to fix — an empty rejection is not actionable for whoever drafted the
    // content. Enforced here (not only in the DTO) since it is a decision-dependent, cross-field
    // rule, and this service is the one place that must never be bypassed.
    const trimmedNotes = notes?.trim() || null;
    if (decision !== HumanReviewStatus.APPROVED && !trimmedNotes) {
      throw new BadRequestException(`reviewTranslation: notes are required for a ${decision} decision`);
    }
    if (trimmedNotes && trimmedNotes.length > REVIEW_NOTES_MAX_LENGTH) {
      throw new BadRequestException(`reviewTranslation: notes must be ${REVIEW_NOTES_MAX_LENGTH} characters or fewer`);
    }

    const outcome = deriveReviewOutcome(decision);
    const reviewedAt = new Date();

    return this.dataSource.transaction(async (manager) => {
      const translation = await this.translationsRepo.findById(translationId, manager);
      if (!translation) {
        throw new NotFoundException(`reviewTranslation: translation ${translationId} not found`);
      }
      // CONCURRENCY / STALE-CONTENT PROTECTION (Phase 4/5): both checks below are pre-flight reads —
      // the actual guarantee is the conditional UPDATE in updateReviewState() further down, which
      // re-checks the same conditions atomically at write time. These reads exist to fail fast with
      // a clear message in the common (non-racing) case before doing any writes.
      if (!translation.isCurrent) {
        throw new ConflictException(
          `reviewTranslation: translation ${translationId} was superseded by a newer edit since you loaded it — refresh the queue and review the current version instead`,
        );
      }
      if (!REVIEWABLE_PRIOR_STATUSES.includes(translation.humanReviewStatus)) {
        throw new ConflictException(
          `reviewTranslation: translation ${translationId} was already reviewed (human_review_status=${translation.humanReviewStatus}) — refresh the queue`,
        );
      }

      const changeNoteBase = `Human review decision: ${decision} by ${actorId}`;
      const changeNote = trimmedNotes ? `${changeNoteBase} — ${trimmedNotes}` : changeNoteBase;

      await this.revisionsService.recordPlaceTranslationRevision(
        {
          entityId: translation.id,
          snapshot: {
            translationId: translation.id,
            placeId: translation.placeId,
            fieldKey: translation.fieldKey,
            localeCode: translation.localeCode,
            decision,
            notes: trimmedNotes,
            // The exact content version this decision applies to — see class doc point 2.
            reviewedContentRevisionId: translation.revisionId,
          },
          origin: RevisionOrigin.MODERATOR_EDIT,
          editorId: null, // no content edit occurred — this revision is a review decision, not a write
          changeNote: changeNote.slice(0, 300),
          status: outcome.revisionStatus,
          reviewedBy: actorId,
          reviewedAt,
        },
        manager,
      );

      // Atomic optimistic-concurrency gate — see updateReviewState()'s own comment. If this returns
      // false, someone else's review (or a content edit) committed between our read above and here;
      // the whole transaction (including the revision insert just above) rolls back on the throw.
      const applied = await this.translationsRepo.updateReviewState(
        translation.id,
        translation.humanReviewStatus,
        {
          humanReviewStatus: outcome.humanReviewStatus,
          translationStatus: outcome.translationStatus,
          isPublic: outcome.isPublic,
          isProductionData: outcome.isProductionData,
          productionEligible: outcome.productionEligible,
        },
        manager,
      );
      if (!applied) {
        throw new ConflictException(
          `reviewTranslation: translation ${translationId} was reviewed or edited by someone else at the same moment — refresh the queue`,
        );
      }

      return {
        ...translation,
        humanReviewStatus: outcome.humanReviewStatus,
        translationStatus: outcome.translationStatus,
        isPublic: outcome.isPublic,
        isProductionData: outcome.isProductionData,
        productionEligible: outcome.productionEligible,
      };
    });
  }
}
