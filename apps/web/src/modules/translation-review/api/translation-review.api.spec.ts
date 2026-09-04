import { listReviewQueue, reviewTranslation } from './translation-review.api';
import { apiGetAuth, apiPost } from '@/lib/http';

jest.mock('@/lib/http', () => ({
  apiGetAuth: jest.fn(),
  apiPost: jest.fn(),
}));

const mockGet = apiGetAuth as jest.Mock;
const mockPost = apiPost as jest.Mock;

beforeEach(() => {
  mockGet.mockReset().mockResolvedValue([]);
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
});

describe('reviewTranslation', () => {
  it('POST body + token tới endpoint review, id đã encode', async () => {
    const body = { decision: 'APPROVED' as const, notes: 'looks good' };
    await reviewTranslation('translation 1', body, 'tok');
    expect(mockPost).toHaveBeenCalledWith('/admin/place-translations/translation%201/review', 'tok', body);
  });
});
