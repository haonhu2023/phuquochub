import { listMyPlaceEditProposals, submitPlaceEditProposal } from './place-edit-proposals.api';
import { apiGetAuth, apiPost } from '@/lib/http';
import type { CreatePlaceEditProposalInput } from '../types';

jest.mock('@/lib/http', () => ({
  apiPost: jest.fn(),
  apiGetAuth: jest.fn(),
}));

const mockPost = apiPost as jest.Mock;
const mockGetAuth = apiGetAuth as jest.Mock;

beforeEach(() => {
  mockPost.mockReset().mockResolvedValue(null);
  mockGetAuth.mockReset().mockResolvedValue([]);
});

describe('submitPlaceEditProposal', () => {
  it('POST /places/{id}/edit-proposals với payload + token, id được encode', async () => {
    const input: CreatePlaceEditProposalInput<'address'> = {
      field_key: 'address',
      proposed_value: '123 Trần Hưng Đạo',
      reason: 'Địa chỉ cũ đã sai',
    };
    await submitPlaceEditProposal('p 1', input, 'tok');
    expect(mockPost).toHaveBeenCalledWith('/places/p%201/edit-proposals', 'tok', input);
  });
});

describe('listMyPlaceEditProposals', () => {
  it('GET /place-edit-proposals/mine với token, không cache', async () => {
    await listMyPlaceEditProposals('tok');
    expect(mockGetAuth).toHaveBeenCalledWith('/place-edit-proposals/mine', 'tok', { cache: 'no-store' });
  });
});
