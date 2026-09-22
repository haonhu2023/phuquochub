import {
  archivePlace,
  createPlace,
  listEditorialPlaces,
  listMyPlaces,
  previewPlace,
  publishPlace,
  unpublishPlace,
  updatePlace,
} from './place-management.api';
import { apiDeleteAuth, apiGetAuth, apiGetPaginatedAuth, apiPatchAuth, apiPost } from '@/lib/http';
import type { PlaceFormInput, UpdatePlaceFormInput } from '../types';

jest.mock('@/lib/http', () => ({
  apiGetAuth: jest.fn(),
  apiGetPaginatedAuth: jest.fn(),
  apiPost: jest.fn(),
  apiPatchAuth: jest.fn(),
  apiDeleteAuth: jest.fn(),
}));

const mockGet = apiGetAuth as jest.Mock;
const mockGetPaginated = apiGetPaginatedAuth as jest.Mock;
const mockPost = apiPost as jest.Mock;
const mockPatch = apiPatchAuth as jest.Mock;
const mockDelete = apiDeleteAuth as jest.Mock;

beforeEach(() => {
  mockGet.mockReset().mockResolvedValue([]);
  mockGetPaginated.mockReset().mockResolvedValue({ data: [], meta: {} });
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

// CAS (AddPlaceContentVersion, 2026-09-22) — updatePlace() không còn nhận PlaceFormInput trần.
const UPDATE_PAYLOAD: UpdatePlaceFormInput = { ...PAYLOAD, expected_content_version: 3 };

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
  it('PATCH /places/:id (encode id) với payload (kèm expected_content_version) + token', async () => {
    await updatePlace('place 1', UPDATE_PAYLOAD, 'tok');
    expect(mockPatch).toHaveBeenCalledWith('/places/place%201', 'tok', UPDATE_PAYLOAD);
  });
});

describe('archivePlace', () => {
  it('DELETE /places/:id (encode id) với token', async () => {
    await archivePlace('place 1', 'tok');
    expect(mockDelete).toHaveBeenCalledWith('/places/place%201', 'tok');
  });
});

// P3 (Preview riêng tư, 2026-09-22)
describe('previewPlace', () => {
  it('GET /places/:id/preview (encode id) với token, không cache', async () => {
    await previewPlace('place 1', 'tok');
    expect(mockGet).toHaveBeenCalledWith('/places/place%201/preview', 'tok', { cache: 'no-store' });
  });
});

// P1 (Owner self-publish, 2026-09-22)
describe('publishPlace', () => {
  it('POST /places/:id/approve (encode id) với token', async () => {
    await publishPlace('place 1', 'tok');
    expect(mockPost).toHaveBeenCalledWith('/places/place%201/approve', 'tok');
  });
});

describe('unpublishPlace', () => {
  it('POST /places/:id/unpublish (encode id) với token', async () => {
    await unpublishPlace('place 1', 'tok');
    expect(mockPost).toHaveBeenCalledWith('/places/place%201/unpublish', 'tok');
  });
});

describe('listEditorialPlaces', () => {
  it('GET /places/editorial không tham số → không query string', async () => {
    await listEditorialPlaces('tok');
    expect(mockGetPaginated).toHaveBeenCalledWith('/places/editorial', 'tok');
  });

  it('page/limit → query string đúng', async () => {
    await listEditorialPlaces('tok', { page: 2, limit: 10 });
    expect(mockGetPaginated).toHaveBeenCalledWith('/places/editorial?page=2&limit=10', 'tok');
  });
});
