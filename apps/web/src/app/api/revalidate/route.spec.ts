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

function request(body: unknown, token?: string): Request {
  return new Request('http://localhost:3000/api/revalidate', {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  mockApiGetAuth.mockReset();
  mockRevalidateTag.mockReset();
});

// C1 (2026-09-22) — route xác thực bằng CHÍNH access token JWT (gọi thật GET /users/me qua API),
// không phải shared secret tĩnh — test khoá đúng cả hai nhánh (token hỏng/thiếu bị từ chối, token
// thật được xử lý) và whitelist tag (chỉ "place:"/"places:").
describe('POST /api/revalidate', () => {
  it('thiếu Authorization header → 401, không gọi apiGetAuth', async () => {
    const res = await POST(request({ tags: ['places:list'] }));
    expect(res.status).toBe(401);
    expect(mockApiGetAuth).not.toHaveBeenCalled();
  });

  it('access token không hợp lệ (API trả 401) → 401, không revalidate', async () => {
    mockApiGetAuth.mockRejectedValue(new ApiError('Unauthorized', 401));
    const res = await POST(request({ tags: ['places:list'] }, 'bad-token'));
    expect(res.status).toBe(401);
    expect(mockRevalidateTag).not.toHaveBeenCalled();
  });

  it('tags rỗng hoặc không đúng tiền tố cho phép → 400, không revalidate', async () => {
    mockApiGetAuth.mockResolvedValue({ id: 'u1' });
    const res1 = await POST(request({ tags: [] }, 'good-token'));
    expect(res1.status).toBe(400);

    const res2 = await POST(request({ tags: ['guide:some-slug'] }, 'good-token'));
    expect(res2.status).toBe(400);
    expect(mockRevalidateTag).not.toHaveBeenCalled();
  });

  it('token hợp lệ + tags hợp lệ → revalidateTag từng tag, trả revalidated: true', async () => {
    mockApiGetAuth.mockResolvedValue({ id: 'u1' });
    const res = await POST(request({ tags: ['places:list', 'place:bai-sao'] }, 'good-token'));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ revalidated: true, tags: ['places:list', 'place:bai-sao'] });
    expect(mockRevalidateTag).toHaveBeenCalledWith('places:list', { expire: 0 });
    expect(mockRevalidateTag).toHaveBeenCalledWith('place:bai-sao', { expire: 0 });
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
});
