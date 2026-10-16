import { getExternalIdentifiers, upsertGooglePlaceId } from './place-external-identifiers.api';
import { apiGetAuth, apiPutAuth } from '@/lib/http';

jest.mock('@/lib/http', () => ({
  apiGetAuth: jest.fn(),
  apiPutAuth: jest.fn(),
}));

const mockGetAuth = apiGetAuth as jest.Mock;
const mockPutAuth = apiPutAuth as jest.Mock;

beforeEach(() => {
  mockGetAuth.mockReset();
  mockPutAuth.mockReset();
});

describe('getExternalIdentifiers', () => {
  it('reads /places/:id/external-identifiers with the access token, no-store', async () => {
    mockGetAuth.mockResolvedValue([]);
    await getExternalIdentifiers('place-1', 'tok-123');
    expect(mockGetAuth).toHaveBeenCalledWith('/places/place-1/external-identifiers', 'tok-123', { cache: 'no-store' });
  });

  it('placeId is URI-encoded', async () => {
    mockGetAuth.mockResolvedValue([]);
    await getExternalIdentifiers('place with space', 'tok-123');
    expect(mockGetAuth).toHaveBeenCalledWith(
      `/places/${encodeURIComponent('place with space')}/external-identifiers`,
      'tok-123',
      { cache: 'no-store' },
    );
  });
});

describe('upsertGooglePlaceId', () => {
  it('PUTs to /places/:id/external-identifiers/google-places with the exact payload given (no client-side verifiedAt/isPrimary added)', async () => {
    mockPutAuth.mockResolvedValue({ id: 'ext-1' });
    await upsertGooglePlaceId('place-1', { external_id: 'ChIJ-x', source_id: 'src-1' }, 'tok-123');
    expect(mockPutAuth).toHaveBeenCalledWith(
      '/places/place-1/external-identifiers/google-places',
      'tok-123',
      { external_id: 'ChIJ-x', source_id: 'src-1' },
    );
  });
});
