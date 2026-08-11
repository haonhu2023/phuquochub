import { submitBusinessClaim } from './business-claims.api';
import { apiPost } from '@/lib/http';
import type { SubmitBusinessClaimInput } from '../types';

jest.mock('@/lib/http', () => ({
  apiPost: jest.fn(),
}));

const mockPost = apiPost as jest.Mock;

beforeEach(() => {
  mockPost.mockReset().mockResolvedValue({ id: 'claim1', status: 'pending' });
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
