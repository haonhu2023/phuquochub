import { reportPlace } from './place-reports.api';
import { apiPost } from '@/lib/http';
import type { CreatePlaceReportInput } from '../types';

jest.mock('@/lib/http', () => ({
  apiPost: jest.fn(),
}));

const mockPost = apiPost as jest.Mock;

beforeEach(() => {
  mockPost.mockReset().mockResolvedValue(null);
});

describe('reportPlace', () => {
  it('POST /places/{id}/report với payload + token, id được encode', async () => {
    const input: CreatePlaceReportInput = { reason: 'misinformation', description: 'Giờ mở cửa sai' };
    await reportPlace('p 1', input, 'tok');
    expect(mockPost).toHaveBeenCalledWith('/places/p%201/report', 'tok', input);
  });
});
