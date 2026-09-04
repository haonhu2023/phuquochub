import { listReviewQueue, reviewTranslation } from './translation-review.api';
import { apiGetAuth, apiPost } from '@/lib/http';

jest.mock('@/lib/http', () => ({
  apiGetAuth: jest.fn(),
  apiPost: jest.fn(),
}));

const mockGet = apiGetAuth as jest.Mock;
const mockPost = apiPost as jest.Mock;

beforeEach(() => {
  mockGet.mockReset().mockResolvedValue({ rows: [], nextCursor: null });
  mockPost.mockReset().mockResolvedValue(null);
});

describe('listReviewQueue', () => {
  it('không filter → path trần', async () => {
    await listReviewQueue({}, 'tok');
    expect(mockGet).toHaveBeenCalledWith('/admin/place-translations/review-queue', 'tok', { cache: 'no-store' });
  });

  it('chỉ đưa vào query những filter được truyền', async () => {
    await listReviewQueue({ placeSlug: 'vinwonders-phu-quoc', localeCode: 'vi', limit: 10 }, 'tok');
    expect(mockGet).toHaveBeenCalledWith(
      '/admin/place-translations/review-queue?placeSlug=vinwonders-phu-quoc&localeCode=vi&limit=10',
      'tok',
      { cache: 'no-store' },
    );
  });

  it('gồm placeId/fieldKey khi có', async () => {
    await listReviewQueue({ placeId: 'place-1', fieldKey: 'short_description' }, 'tok');
    expect(mockGet).toHaveBeenCalledWith(
      '/admin/place-translations/review-queue?placeId=place-1&fieldKey=short_description',
      'tok',
      { cache: 'no-store' },
    );
  });

  it('gồm cursor khi có (trang tiếp theo)', async () => {
    await listReviewQueue({ cursor: 'opaque-cursor-token' }, 'tok');
    expect(mockGet).toHaveBeenCalledWith(
      '/admin/place-translations/review-queue?cursor=opaque-cursor-token',
      'tok',
      { cache: 'no-store' },
    );
  });

  it('trả nguyên { rows, nextCursor } từ BE, không bóc tách', async () => {
    mockGet.mockResolvedValue({ rows: [{ id: 't1' }], nextCursor: 'next-page-token' });
    const result = await listReviewQueue({}, 'tok');
    expect(result).toEqual({ rows: [{ id: 't1' }], nextCursor: 'next-page-token' });
  });
});

describe('reviewTranslation', () => {
  it('POST body + token tới endpoint review, id đã encode', async () => {
    const body = { decision: 'APPROVED' as const, notes: 'looks good' };
    await reviewTranslation('translation 1', body, 'tok');
    expect(mockPost).toHaveBeenCalledWith('/admin/place-translations/translation%201/review', 'tok', body);
  });
});
