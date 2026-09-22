import { getHomeContent, listSiteContent, upsertSiteContent } from './site-content.api';
import { apiGet, apiGetAuth, apiPutAuth } from '@/lib/http';

jest.mock('@/lib/http', () => ({
  apiGet: jest.fn(),
  apiGetAuth: jest.fn(),
  apiPutAuth: jest.fn(),
}));

const mockGet = apiGet as jest.Mock;
const mockGetAuth = apiGetAuth as jest.Mock;
const mockPutAuth = apiPutAuth as jest.Mock;

beforeEach(() => {
  mockGet.mockReset();
  mockGetAuth.mockReset();
  mockPutAuth.mockReset();
});

describe('getHomeContent', () => {
  it('GET /site-content/home?locale=, no-store (C1 — publish phải phản ánh ngay)', async () => {
    await getHomeContent('vi');
    expect(mockGet).toHaveBeenCalledWith('/site-content/home?locale=vi', { cache: 'no-store' });
  });
});

describe('listSiteContent', () => {
  it('GET /admin/site-content có Bearer', async () => {
    await listSiteContent('tok123');
    expect(mockGetAuth).toHaveBeenCalledWith('/admin/site-content', 'tok123');
  });
});

describe('upsertSiteContent', () => {
  it('PUT /admin/site-content với body nguyên vẹn, có Bearer', async () => {
    const input = { key: 'home_hero' as const, locale: 'vi', value: { title: 't' }, expectedContentVersion: 0 };
    await upsertSiteContent(input, 'tok123');
    expect(mockPutAuth).toHaveBeenCalledWith('/admin/site-content', 'tok123', input);
  });
});
