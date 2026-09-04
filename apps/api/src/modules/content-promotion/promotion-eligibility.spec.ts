import { evaluatePromotionEligibility, type EligibilityInput } from './promotion-eligibility';

function approved(overrides: Partial<EligibilityInput> = {}): EligibilityInput {
  return { human_review_status: 'APPROVED', is_public: true, is_production_data: true, production_eligible: true, is_current: true, ...overrides };
}

describe('evaluatePromotionEligibility', () => {
  it('APPROVED + all flags true -> READY', () => {
    expect(evaluatePromotionEligibility(approved()).status).toBe('READY');
  });

  it('PENDING -> BLOCKED_PENDING', () => {
    expect(evaluatePromotionEligibility(approved({ human_review_status: 'PENDING', is_public: false, is_production_data: false, production_eligible: false })).status).toBe('BLOCKED_PENDING');
  });

  it('NEEDS_CHANGES -> BLOCKED_REVIEW', () => {
    expect(evaluatePromotionEligibility(approved({ human_review_status: 'NEEDS_CHANGES', is_public: false, is_production_data: false, production_eligible: false })).status).toBe('BLOCKED_REVIEW');
  });

  it('REJECTED -> BLOCKED_REVIEW', () => {
    expect(evaluatePromotionEligibility(approved({ human_review_status: 'REJECTED', is_public: false, is_production_data: false, production_eligible: false })).status).toBe('BLOCKED_REVIEW');
  });

  it('an unrecognized status is treated as not approved, never as a silent pass-through', () => {
    expect(evaluatePromotionEligibility(approved({ human_review_status: 'SOMETHING_NEW' })).status).toBe('BLOCKED_REVIEW');
  });

  it('APPROVED but is_public=false -> BLOCKED_NOT_ELIGIBLE (governance flags disagree)', () => {
    expect(evaluatePromotionEligibility(approved({ is_public: false })).status).toBe('BLOCKED_NOT_ELIGIBLE');
  });

  it('APPROVED but is_production_data=false -> BLOCKED_NOT_ELIGIBLE', () => {
    expect(evaluatePromotionEligibility(approved({ is_production_data: false })).status).toBe('BLOCKED_NOT_ELIGIBLE');
  });

  it('APPROVED but production_eligible=false -> BLOCKED_NOT_ELIGIBLE', () => {
    expect(evaluatePromotionEligibility(approved({ production_eligible: false })).status).toBe('BLOCKED_NOT_ELIGIBLE');
  });

  it('not the current row -> BLOCKED_NOT_ELIGIBLE regardless of other flags', () => {
    expect(evaluatePromotionEligibility(approved({ is_current: false })).status).toBe('BLOCKED_NOT_ELIGIBLE');
  });
});
