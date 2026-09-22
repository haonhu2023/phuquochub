import { getGuideArticle, listGuideArticles } from './guide.api';
import { apiGet } from '@/lib/http';

jest.mock('@/lib/http', () => ({ apiGet: jest.fn() }));

const mockGet = apiGet as jest.Mock;

beforeEach(() => {
  mockGet.mockReset();
});

describe('getGuideArticle', () => {
  it('GET /guide-articles/:slug?locale=, no-store (C1 — publish/unpublish phải phản ánh ngay)', async () => {
    await getGuideArticle('phu-quoc', 'vi');
    expect(mockGet).toHaveBeenCalledWith('/guide-articles/phu-quoc?locale=vi', { cache: 'no-store' });
  });

  it('encode slug đúng khi có ký tự đặc biệt', async () => {
    await getGuideArticle('bãi biển', 'vi');
    expect(mockGet).toHaveBeenCalledWith(expect.stringContaining('/guide-articles/b%C3%A3i%20bi%E1%BB%83n'), expect.anything());
  });
});

describe('listGuideArticles', () => {
  it('GET /guide-articles?locale=, no-store (cùng lý do getGuideArticle)', async () => {
    await listGuideArticles('en');
    expect(mockGet).toHaveBeenCalledWith('/guide-articles?locale=en', { cache: 'no-store' });
  });
});
