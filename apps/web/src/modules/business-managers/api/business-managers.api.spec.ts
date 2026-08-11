import {
  assignBusinessManager,
  listBusinessManagers,
  lookupBusinessUserByEmail,
  revokeBusinessManager,
} from './business-managers.api';
import { apiDeleteAuth, apiGetAuth, apiPost } from '@/lib/http';
import type { BusinessManager, LookupBusinessUserResult } from '../types';

jest.mock('@/lib/http', () => ({
  apiGetAuth: jest.fn(),
  apiPost: jest.fn(),
  apiDeleteAuth: jest.fn(),
}));

const mockGetAuth = apiGetAuth as jest.Mock;
const mockPost = apiPost as jest.Mock;
const mockDeleteAuth = apiDeleteAuth as jest.Mock;

beforeEach(() => {
  mockGetAuth.mockReset().mockResolvedValue([]);
  mockPost.mockReset().mockResolvedValue({});
  mockDeleteAuth.mockReset().mockResolvedValue(null);
});

describe('listBusinessManagers', () => {
  it('GET /business/{id}/managers với token, no-store', async () => {
    await listBusinessManagers('place-1', 'tok');
    expect(mockGetAuth).toHaveBeenCalledWith('/business/place-1/managers', 'tok', { cache: 'no-store' });
  });

  it('encode placeId trong URL', async () => {
    await listBusinessManagers('place with space', 'tok');
    expect(mockGetAuth).toHaveBeenCalledWith(
      '/business/place%20with%20space/managers',
      'tok',
      { cache: 'no-store' },
    );
  });

  it('trả về ĐÚNG dữ liệu apiGetAuth trả', async () => {
    const managers: BusinessManager[] = [
      { user_id: 'u1', display_name: 'A', email: 'a@b.c', role: 'manager', granted_at: '2026-08-10T00:00:00.000Z' },
    ];
    mockGetAuth.mockResolvedValue(managers);
    await expect(listBusinessManagers('place-1', 'tok')).resolves.toEqual(managers);
  });
});

describe('lookupBusinessUserByEmail', () => {
  it('GET /business/{id}/managers/lookup?email=... với email encode đúng', async () => {
    await lookupBusinessUserByEmail('place-1', 'a+b@c.com', 'tok');
    expect(mockGetAuth).toHaveBeenCalledWith(
      '/business/place-1/managers/lookup?email=a%2Bb%40c.com',
      'tok',
      { cache: 'no-store' },
    );
  });

  it('trả về ĐÚNG dữ liệu apiGetAuth trả', async () => {
    const result: LookupBusinessUserResult = { user_id: 'u9', display_name: 'Target' };
    mockGetAuth.mockResolvedValue(result);
    await expect(lookupBusinessUserByEmail('place-1', 'x@y.com', 'tok')).resolves.toEqual(result);
  });

  it('lỗi 404 từ apiGetAuth truyền nguyên vẹn lên caller', async () => {
    const err = new Error('not found');
    mockGetAuth.mockRejectedValue(err);
    await expect(lookupBusinessUserByEmail('place-1', 'missing@y.com', 'tok')).rejects.toBe(err);
  });
});

describe('assignBusinessManager', () => {
  it('POST /business/{id}/managers với { user_id }', async () => {
    await assignBusinessManager('place-1', 'u9', 'tok');
    expect(mockPost).toHaveBeenCalledWith('/business/place-1/managers', 'tok', { user_id: 'u9' });
  });
});

describe('revokeBusinessManager', () => {
  it('DELETE /business/{id}/managers/{userId} với token', async () => {
    await revokeBusinessManager('place-1', 'u9', 'tok');
    expect(mockDeleteAuth).toHaveBeenCalledWith('/business/place-1/managers/u9', 'tok');
  });
});
