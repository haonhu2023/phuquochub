import { formatReviewDate, ratingStars } from './format';

describe('ratingStars', () => {
  it.each([
    [0, [false, false, false, false, false]],
    [3, [true, true, true, false, false]],
    [5, [true, true, true, true, true]],
  ])('rating %p → %p', (rating, expected) => {
    expect(ratingStars(rating)).toEqual(expected);
  });
});

describe('formatReviewDate', () => {
  it('định dạng ISO string theo vi-VN (ngày tháng năm)', () => {
    expect(formatReviewDate('2026-07-26T00:00:00Z')).toContain('2026');
  });
});
