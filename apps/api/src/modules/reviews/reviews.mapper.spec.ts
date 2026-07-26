import { toReview } from './reviews.mapper';
import { ReviewStatus } from './review.enums';
import { ReviewRow } from './repositories/reviews.repository';

describe('toReview', () => {
  it('ánh xạ row DB sang response contract (snake_case, không lộ place_id)', () => {
    const row: ReviewRow = {
      id: 'r1',
      rating: 4,
      content: 'Tốt',
      status: ReviewStatus.PUBLISHED,
      created_at: new Date('2026-07-26T00:00:00Z'),
      user_id: 'u1',
      author_name: 'Nhu',
      author_avatar_url: null,
    };

    expect(toReview(row)).toEqual({
      id: 'r1',
      user_id: 'u1',
      author_name: 'Nhu',
      author_avatar_url: null,
      rating: 4,
      content: 'Tốt',
      status: ReviewStatus.PUBLISHED,
      created_at: row.created_at,
    });
  });
});
