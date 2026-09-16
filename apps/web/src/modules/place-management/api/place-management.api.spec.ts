import {
  archivePlace,
  createPlace,
  listMyPlaces,
  publishPlaceDraft,
  saveDraftPlace,
  updatePlace,
} from './place-management.api';
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

// CAS cho scalar fields (2026-09-17) — xem EditPlaceView.tsx's bảng chức năng.
describe('saveDraftPlace', () => {
  it('POST /places/:id/draft (encode id) với payload scalar + token', async () => {
    mockPost.mockResolvedValueOnce({ id: 'rev1', revisionNumber: 3 });
    const result = await saveDraftPlace(
      'place 1',
      { category_id: 'c1', address: 'X', ward: null, price_range: 'mid', opening_hours: PAYLOAD.opening_hours },
      'tok',
    );
    expect(mockPost).toHaveBeenCalledWith('/places/place%201/draft', 'tok', {
      category_id: 'c1',
      address: 'X',
      ward: null,
      price_range: 'mid',
      opening_hours: PAYLOAD.opening_hours,
    });
    expect(result).toEqual({ id: 'rev1', revisionNumber: 3 });
  });
});

describe('publishPlaceDraft', () => {
  it('POST /places/:id/revisions/:revisionId/publish (encode cả hai id), không body', async () => {
    await publishPlaceDraft('place 1', 'rev 1', 'tok');
    expect(mockPost).toHaveBeenCalledWith('/places/place%201/revisions/rev%201/publish', 'tok');
  });
});

// location (2026-09-17) — nay tham gia CÙNG saveDraftPlace/publishPlaceDraft như các trường scalar
// khác, KHÔNG còn đường PATCH riêng không-CAS nào (updatePlaceLegacyFields đã bị gỡ).
describe('saveDraftPlace — location', () => {
  it('gửi location CÙNG các trường scalar khác trong MỘT payload', async () => {
    mockPost.mockResolvedValueOnce({ id: 'rev1', revisionNumber: 1 });
    await saveDraftPlace('place 1', { address: 'X', location: { lat: 10.2, lng: 104.0 } }, 'tok');
    expect(mockPost).toHaveBeenCalledWith('/places/place%201/draft', 'tok', {
      address: 'X',
      location: { lat: 10.2, lng: 104.0 },
    });
  });
});
