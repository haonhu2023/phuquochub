import { toReview } from './reviews.mapper';
import { ReviewStatus } from './review.enums';
import { ReviewRow } from './repositories/reviews.repository';
import { Media } from '../media/entities/media.entity';
import { MediaStatus, MediaType, MediaProvider } from '../media/media.enums';

const noResolve = (): string => {
  throw new Error('resolvePublicUrl không được gọi trong test này');
};

function baseRow(overrides: Partial<ReviewRow> = {}): ReviewRow {
  return {
    id: 'r1',
    rating: 4,
    content: 'Tốt',
    status: ReviewStatus.PUBLISHED,
    created_at: new Date('2026-07-26T00:00:00Z'),
    user_id: 'u1',
    author_name: 'Nhu',
    author_avatar_url: null,
    media: [],
    ...overrides,
  };
}

describe('toReview', () => {
  it('ánh xạ row DB sang response contract (snake_case, không lộ place_id), review không có media → media: []', () => {
    const row = baseRow();

    expect(toReview(row, noResolve)).toEqual({
      id: 'r1',
      user_id: 'u1',
      author_name: 'Nhu',
      author_avatar_url: null,
      rating: 4,
      content: 'Tốt',
      status: ReviewStatus.PUBLISHED,
      created_at: row.created_at,
      media: [],
    });
  });

  it('review có một media published → media chứa đúng một phần tử đã qua toMedia()', () => {
    const m1 = {
      id: 'm1',
      type: MediaType.IMAGE,
      url: null,
      thumbnailUrl: null,
      caption: null,
      altText: null,
      status: MediaStatus.PUBLISHED,
      provider: MediaProvider.UPLOAD,
      objectKey: 'media/m1.jpg',
    } as Media;
    const row = baseRow({ media: [m1] });
    // Secure Private Media (2026-08-10): resolver nhận MEDIA ID và trả URL API ổn định.
    const resolveFileUrl = jest.fn().mockReturnValue('https://phuquochub.com/api/media/m1/file');

    const res = toReview(row, resolveFileUrl);

    expect(res.media).toEqual([
      expect.objectContaining({ id: 'm1', url: 'https://phuquochub.com/api/media/m1/file' }),
    ]);
    expect(resolveFileUrl).toHaveBeenCalledWith('m1');
    // SECURITY: object_key không bao giờ được truyền ra ngoài qua resolver này.
    expect(resolveFileUrl).not.toHaveBeenCalledWith('media/m1.jpg');
  });

  it('review có nhiều media → giữ nguyên thứ tự do repository trả về (đã sort_order/created_at/id ở tầng repository)', () => {
    const m1 = { id: 'm1', type: MediaType.IMAGE, status: MediaStatus.PUBLISHED, url: 'https://cdn/1.jpg' } as Media;
    const m2 = { id: 'm2', type: MediaType.IMAGE, status: MediaStatus.PUBLISHED, url: 'https://cdn/2.jpg' } as Media;
    const row = baseRow({ media: [m1, m2] });

    const res = toReview(row, noResolve);

    expect(res.media.map((m) => m.id)).toEqual(['m1', 'm2']);
  });
});
