import { HUMAN_REVIEW_STATUS } from './content-promotion.types';

export type EligibilityStatus = 'READY' | 'BLOCKED_PENDING' | 'BLOCKED_REVIEW' | 'BLOCKED_NOT_ELIGIBLE';

export interface EligibilityInput {
  human_review_status: string;
  is_public: boolean;
  is_production_data: boolean;
  production_eligible: boolean;
  is_current: boolean;
}

export interface EligibilityResult {
  status: EligibilityStatus;
  reason: string;
}

/**
 * The ONLY gate a translation must pass to be exportable for promotion. Pure — no DB, no I/O.
 * Deliberately conservative: every one of the four governance flags must independently agree, not
 * just human_review_status alone, since those flags are what TranslationReviewService.
 * reviewTranslation() actually flips together on a real APPROVED decision (place-translations.
 * service.ts / translation-review.service.ts) — a row that is APPROVED but somehow not yet
 * is_public (a state that should never occur under normal operation) is treated as not-yet-ready
 * rather than promoted anyway.
 */
export function evaluatePromotionEligibility(input: EligibilityInput): EligibilityResult {
  if (!input.is_current) {
    return { status: 'BLOCKED_NOT_ELIGIBLE', reason: 'not the current row for this (place, field, locale)' };
  }
  if (input.human_review_status === HUMAN_REVIEW_STATUS.PENDING) {
    return { status: 'BLOCKED_PENDING', reason: 'awaiting first human review' };
  }
  if (
    input.human_review_status === HUMAN_REVIEW_STATUS.REJECTED ||
    input.human_review_status === HUMAN_REVIEW_STATUS.NEEDS_CHANGES
  ) {
    return { status: 'BLOCKED_REVIEW', reason: `human_review_status="${input.human_review_status}" — reviewed but not approved` };
  }
  if (input.human_review_status !== HUMAN_REVIEW_STATUS.APPROVED) {
    return { status: 'BLOCKED_REVIEW', reason: `unrecognized human_review_status="${input.human_review_status}" — treated as not approved` };
  }
  if (!input.is_public || !input.is_production_data || !input.production_eligible) {
    return {
      status: 'BLOCKED_NOT_ELIGIBLE',
      reason: `human_review_status=APPROVED but is_public=${input.is_public} is_production_data=${input.is_production_data} production_eligible=${input.production_eligible} — all three must be true`,
    };
  }
  return { status: 'READY', reason: 'APPROVED and all publication flags true' };
}
