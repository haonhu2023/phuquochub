import { listMyBusinessClaims, submitBusinessClaim } from './business-claims.api';
import { apiGetAuth, apiPost } from '@/lib/http';
import type { OwnBusinessClaim, SubmitBusinessClaimInput } from '../types';

jest.mock('@/lib/http', () => ({
  apiPost: jest.fn(),
  apiGetAuth: jest.fn(),
}));

const mockPost = apiPost as jest.Mock;
const mockGetAuth = apiGetAuth as jest.Mock;

beforeEach(() => {
  mockPost.mockReset().mockResolvedValue({ id: 'claim1', status: 'pending' });
  mockGetAuth.mockReset().mockResolvedValue([]);
});

describe('submitBusinessClaim', () => {
  it('POST /business-claims với payload + token', async () => {
    const input: SubmitBusinessClaimInput = {
      place_id: 'p1',
      evidence: [{ type: 'storefront_photo', reference: 'ảnh mặt tiền' }],
    };
    await submitBusinessClaim(input, 'tok');
    expect(mockPost).toHaveBeenCalledWith('/business-claims', 'tok', input);
  });
});

describe('listMyBusinessClaims', () => {
  it('GET /business-claims/mine với token xác thực, no-store', async () => {
    await listMyBusinessClaims('tok');
    expect(mockGetAuth).toHaveBeenCalledWith('/business-claims/mine', 'tok', { cache: 'no-store' });
  });

  it('trả về ĐÚNG dữ liệu apiGetAuth trả — không biến đổi thêm', async () => {
    const claims: OwnBusinessClaim[] = [
      {
        id: 'c1',
        place_id: 'p1',
        place_name: 'Bãi Sao',
        place_slug: 'bai-sao',
        status: 'pending',
        reason_code: null,
        decided_at: null,
        created_at: '2026-08-10T00:00:00.000Z',
        updated_at: '2026-08-10T00:00:00.000Z',
      },
    ];
    mockGetAuth.mockResolvedValue(claims);
    await expect(listMyBusinessClaims('tok')).resolves.toEqual(claims);
  });

  it('lỗi từ apiGetAuth (vd 401) truyền nguyên vẹn lên caller', async () => {
    const err = new Error('unauthorized');
    mockGetAuth.mockRejectedValue(err);
    await expect(listMyBusinessClaims('tok')).rejects.toBe(err);
  });
});
