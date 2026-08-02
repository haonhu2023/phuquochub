import { UnprocessableEntityException } from '@nestjs/common';
import { assertValidReviewTransition } from './review-moderation.transition';
import { ReviewStatus } from '../reviews/review.enums';

describe('assertValidReviewTransition', () => {
  it.each([
    ['hide', ReviewStatus.PUBLISHED, undefined, ReviewStatus.HIDDEN],
    ['restore', ReviewStatus.HIDDEN, undefined, ReviewStatus.PUBLISHED],
    ['restore', ReviewStatus.HIDDEN, ReviewStatus.PUBLISHED, ReviewStatus.PUBLISHED],
    ['approve', ReviewStatus.PENDING, undefined, ReviewStatus.PUBLISHED],
  ] as const)('%s từ %s (target=%s) -> trả về %s (hợp lệ)', (action, from, target, expected) => {
    expect(assertValidReviewTransition(from, action, target)).toBe(expected);
  });

  // Toàn bộ 9 tổ hợp (3 status x 3 action) trừ 3 tổ hợp hợp lệ ở trên.
  it.each([
    ['hide', ReviewStatus.HIDDEN],
    ['hide', ReviewStatus.PENDING],
    ['restore', ReviewStatus.PUBLISHED],
    ['restore', ReviewStatus.PENDING],
    ['approve', ReviewStatus.PUBLISHED],
    ['approve', ReviewStatus.HIDDEN],
  ] as const)('%s từ %s -> KHÔNG hợp lệ, ném UnprocessableEntityException', (action, from) => {
    expect(() => assertValidReviewTransition(from, action)).toThrow(UnprocessableEntityException);
  });

  it('restore kèm target_status khác published -> 422, KHÔNG âm thầm bỏ qua (mâu thuẫn O1)', () => {
    expect(() =>
      assertValidReviewTransition(ReviewStatus.HIDDEN, 'restore', ReviewStatus.PENDING),
    ).toThrow(UnprocessableEntityException);
    try {
      assertValidReviewTransition(ReviewStatus.HIDDEN, 'restore', ReviewStatus.PENDING);
      fail('phải ném lỗi');
    } catch (err) {
      expect((err as Error).message).toContain('target_status');
    }
  });

  it('thông báo lỗi nêu rõ trạng thái hiện tại', () => {
    try {
      assertValidReviewTransition(ReviewStatus.PENDING, 'hide');
      fail('phải ném lỗi');
    } catch (err) {
      expect((err as Error).message).toContain('đang chờ duyệt');
    }
  });
});
