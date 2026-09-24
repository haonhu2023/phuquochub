import { submitPlaceEditProposal } from './place-edit-proposals.api';
import { apiPost } from '@/lib/http';
import type { CreatePlaceEditProposalInput } from '../types';

jest.mock('@/lib/http', () => ({
  apiPost: jest.fn(),
}));

const mockPost = apiPost as jest.Mock;

beforeEach(() => {
  mockPost.mockReset().mockResolvedValue(null);
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
