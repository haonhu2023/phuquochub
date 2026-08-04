import { decideModerationCase, getModerationCase, listModerationCases } from './moderation.api';
import { apiGetAuth, apiGetPaginatedAuth, apiPost } from '@/lib/http';

jest.mock('@/lib/http', () => ({
  apiGetAuth: jest.fn(),
  apiGetPaginatedAuth: jest.fn(),
  apiPost: jest.fn(),
}));

const mockPaginated = apiGetPaginatedAuth as jest.Mock;
const mockGet = apiGetAuth as jest.Mock;
const mockPost = apiPost as jest.Mock;

beforeEach(() => {
  mockPaginated.mockReset().mockResolvedValue({ data: [], meta: {} });
  mockGet.mockReset().mockResolvedValue({});
  mockPost.mockReset().mockResolvedValue(null);
});

describe('listModerationCases', () => {
  it('chỉ đưa vào query những filter được truyền, đúng thứ tự', async () => {
    await listModerationCases({ status: 'open', severity: 'high', page: 2, limit: 20 }, 'tok');
    expect(mockPaginated).toHaveBeenCalledWith(
      '/moderation/cases?status=open&severity=high&page=2&limit=20',
      'tok',
      { cache: 'no-store' },
    );
  });

  it('không filter → path trần', async () => {
    await listModerationCases({}, 'tok');
    expect(mockPaginated).toHaveBeenCalledWith('/moderation/cases', 'tok', { cache: 'no-store' });
  });

  it('gồm target_type/source/assigned_to khi có', async () => {
    await listModerationCases(
      { target_type: 'media', source: 'report', assigned_to: 'uuid-1' },
      'tok',
    );
    expect(mockPaginated).toHaveBeenCalledWith(
      '/moderation/cases?target_type=media&source=report&assigned_to=uuid-1',
      'tok',
      { cache: 'no-store' },
    );
  });
});

describe('getModerationCase', () => {
  it('gọi apiGetAuth với id đã encode + token', async () => {
    await getModerationCase('case 1', 'tok');
    expect(mockGet).toHaveBeenCalledWith('/moderation/cases/case%201', 'tok', { cache: 'no-store' });
  });
});

describe('decideModerationCase', () => {
  it('POST body + token tới endpoint decide', async () => {
    const body = { decision: 'hide' as const, reason: 'spam' };
    await decideModerationCase('c1', body, 'tok');
    expect(mockPost).toHaveBeenCalledWith('/moderation/cases/c1/decide', 'tok', body);
  });
});
