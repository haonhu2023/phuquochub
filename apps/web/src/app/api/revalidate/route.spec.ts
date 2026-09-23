/** @jest-environment node */
import { POST } from './route';
import { apiGetAuth, ApiError } from '@/lib/http';
import { revalidateTag } from 'next/cache';

jest.mock('@/lib/http', () => {
  const actual = jest.requireActual('@/lib/http');
  return { ...actual, apiGetAuth: jest.fn() };
});
jest.mock('next/cache', () => ({ revalidateTag: jest.fn() }));

const mockApiGetAuth = apiGetAuth as jest.Mock;
const mockRevalidateTag = revalidateTag as jest.Mock;

function request(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request('http://localhost:3000/api/revalidate', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
}

function tokenRequest(body: unknown, token?: string): Request {
  return request(body, token ? { Authorization: `Bearer ${token}` } : {});
}

const ORIGINAL_SECRET = process.env.REVALIDATE_INTERNAL_SECRET;

beforeEach(() => {
  mockApiGetAuth.mockReset();
  mockRevalidateTag.mockReset();
  delete process.env.REVALIDATE_INTERNAL_SECRET;
});

afterAll(() => {
  if (ORIGINAL_SECRET === undefined) delete process.env.REVALIDATE_INTERNAL_SECRET;
  else process.env.REVALIDATE_INTERNAL_SECRET = ORIGINAL_SECRET;
});

// C1 (2026-09-22, hardened same day) — route hỗ trợ HAI chế độ xác thực: (1) internal shared
// secret cho lời gọi server-to-server từ CHÍNH API backend (CacheInvalidationService — write
// boundary duy nhất mọi caller đều đi qua, kể cả một client bỏ qua web UI hoàn toàn); (2) JWT access
// token thật (gọi GET /users/me) cho lời gọi nhanh từ dashboard sau mutation của chính nó. Body
// KHÔNG còn nhận tag thô — chỉ nhận { entityType, slug }, route tự tính tag server-side (một caller
// không thể yêu cầu invalidate một tag tuỳ ý).
describe('POST /api/revalidate', () => {
  it('thiếu cả Authorization header lẫn internal secret → 401, không gọi apiGetAuth', async () => {
    const res = await POST(tokenRequest({ entityType: 'place', slug: 'bai-sao' }));
    expect(res.status).toBe(401);
    expect(mockApiGetAuth).not.toHaveBeenCalled();
  });

  it('access token JWT không hợp lệ (API trả 401) → 401, không revalidate', async () => {
    mockApiGetAuth.mockRejectedValue(new ApiError('Unauthorized', 401));
    const res = await POST(tokenRequest({ entityType: 'place', slug: 'bai-sao' }, 'bad-token'));
    expect(res.status).toBe(401);
    expect(mockRevalidateTag).not.toHaveBeenCalled();
  });

  it('entityType/slug thiếu hoặc sai định dạng → 400, không revalidate', async () => {
    mockApiGetAuth.mockResolvedValue({ id: 'u1' });
    const res1 = await POST(tokenRequest({ entityType: 'place', slug: '' }, 'good-token'));
    expect(res1.status).toBe(400);

    const res2 = await POST(tokenRequest({ entityType: 'guide', slug: 'x' }, 'good-token'));
    expect(res2.status).toBe(400);
    expect(mockRevalidateTag).not.toHaveBeenCalled();
  });

  it('JWT hợp lệ + body hợp lệ → tự tính tag place:<slug> + places:list, trả revalidated: true', async () => {
    mockApiGetAuth.mockResolvedValue({ id: 'u1' });
    const res = await POST(tokenRequest({ entityType: 'place', slug: 'bai-sao' }, 'good-token'));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ revalidated: true, tags: ['place:bai-sao', 'places:list'] });
    expect(mockRevalidateTag).toHaveBeenCalledWith('place:bai-sao', { expire: 0 });
    expect(mockRevalidateTag).toHaveBeenCalledWith('places:list', { expire: 0 });
    expect(mockApiGetAuth).toHaveBeenCalledWith('/users/me', 'good-token', { cache: 'no-store' });
  });

  it('body không phải JSON hợp lệ → 400', async () => {
    mockApiGetAuth.mockResolvedValue({ id: 'u1' });
    const req = new Request('http://localhost:3000/api/revalidate', {
      method: 'POST',
      headers: { Authorization: 'Bearer good-token' },
      body: 'không phải json',
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  describe('chế độ internal secret (server-to-server, ví dụ CacheInvalidationService phía API)', () => {
    it('secret đúng, KHÔNG có Authorization header → 200, không gọi apiGetAuth (không cần JWT)', async () => {
      process.env.REVALIDATE_INTERNAL_SECRET = 'a-very-secret-value-16+';
      const res = await POST(
        request({ entityType: 'place', slug: 'bai-sao' }, { 'x-internal-revalidate-secret': 'a-very-secret-value-16+' }),
      );

      expect(res.status).toBe(200);
      expect(mockApiGetAuth).not.toHaveBeenCalled();
      expect(mockRevalidateTag).toHaveBeenCalledWith('place:bai-sao', { expire: 0 });
    });

    it('secret sai → rơi về JWT path (không tự động cho qua); thiếu JWT → 401', async () => {
      process.env.REVALIDATE_INTERNAL_SECRET = 'a-very-secret-value-16+';
      const res = await POST(
        request({ entityType: 'place', slug: 'bai-sao' }, { 'x-internal-revalidate-secret': 'wrong-secret-value' }),
      );

      expect(res.status).toBe(401);
      expect(mockRevalidateTag).not.toHaveBeenCalled();
    });

    it('server chưa cấu hình REVALIDATE_INTERNAL_SECRET → header secret bị bỏ qua, rơi về JWT path', async () => {
      // REVALIDATE_INTERNAL_SECRET không được set (beforeEach đã xoá) — mô phỏng môi trường
      // dev/test chưa cấu hình đường server-to-server, chỉ còn đường JWT hoạt động.
      const res = await POST(
        request(
          { entityType: 'place', slug: 'bai-sao' },
          { 'x-internal-revalidate-secret': 'anything-at-all-here' },
        ),
      );

      expect(res.status).toBe(401);
      expect(mockApiGetAuth).not.toHaveBeenCalled();
    });
  });
});
