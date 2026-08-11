import { archivePlace, createPlace, listMyPlaces, updatePlace } from './place-management.api';
import { apiDeleteAuth, apiGetAuth, apiPatchAuth, apiPost } from '@/lib/http';
import type { PlaceFormInput } from '../types';

jest.mock('@/lib/http', () => ({
  apiGetAuth: jest.fn(),
  apiPost: jest.fn(),
  apiPatchAuth: jest.fn(),
  apiDeleteAuth: jest.fn(),
}));

const mockGet = apiGetAuth as jest.Mock;
const mockPost = apiPost as jest.Mock;
const mockPatch = apiPatchAuth as jest.Mock;
const mockDelete = apiDeleteAuth as jest.Mock;

beforeEach(() => {
  mockGet.mockReset().mockResolvedValue([]);
  mockPost.mockReset().mockResolvedValue(null);
  mockPatch.mockReset().mockResolvedValue(null);
  mockDelete.mockReset().mockResolvedValue(null);
});

const PAYLOAD: PlaceFormInput = {
  name: 'Bãi Sao',
  category_id: 'c1',
  location: { lat: 10.05, lng: 104.0 },
  address: null,
  ward: null,
  description: null,
  short_description: null,
  price_range: null,
  opening_hours: { is_24h: false, regular: { mon: [], tue: [], wed: [], thu: [], fri: [], sat: [], sun: [] } },
};

describe('listMyPlaces', () => {
  it('GET /places/mine với token, không cache', async () => {
    await listMyPlaces('tok');
    expect(mockGet).toHaveBeenCalledWith('/places/mine', 'tok', { cache: 'no-store' });
  });
});

describe('createPlace', () => {
  it('POST /places với payload + token', async () => {
    await createPlace(PAYLOAD, 'tok');
    expect(mockPost).toHaveBeenCalledWith('/places', 'tok', PAYLOAD);
  });
});

describe('updatePlace', () => {
  it('PATCH /places/:id (encode id) với payload + token', async () => {
    await updatePlace('place 1', PAYLOAD, 'tok');
    expect(mockPatch).toHaveBeenCalledWith('/places/place%201', 'tok', PAYLOAD);
  });
});

describe('archivePlace', () => {
  it('DELETE /places/:id (encode id) với token', async () => {
    await archivePlace('place 1', 'tok');
    expect(mockDelete).toHaveBeenCalledWith('/places/place%201', 'tok');
  });
});
