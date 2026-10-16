import {
  getExternalIdentifiers,
  upsertGooglePlaceId,
  confirmGooglePlaceId,
  revokeGooglePlaceIdVerification,
} from './place-external-identifiers.api';
import { apiGetAuth, apiPost, apiPutAuth } from '@/lib/http';

jest.mock('@/lib/http', () => ({
  apiGetAuth: jest.fn(),
  apiPutAuth: jest.fn(),
  apiPost: jest.fn(),
}));

const mockGetAuth = apiGetAuth as jest.Mock;
const mockPutAuth = apiPutAuth as jest.Mock;
const mockPost = apiPost as jest.Mock;

beforeEach(() => {
  mockGetAuth.mockReset();
  mockPutAuth.mockReset();
  mockPost.mockReset();
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

describe('confirmGooglePlaceId', () => {
  it('POSTs to .../google-places/confirm with the payload given', async () => {
    mockPost.mockResolvedValue({ id: 'ext-1', verified_at: '2026-10-16T00:00:00Z' });
    await confirmGooglePlaceId('place-1', { evidence_id: 'ev-1' }, 'tok-123');
    expect(mockPost).toHaveBeenCalledWith('/places/place-1/external-identifiers/google-places/confirm', 'tok-123', { evidence_id: 'ev-1' });
  });

  it('no evidence given → still posts an (empty) payload, no verified_at ever sent by the client', async () => {
    mockPost.mockResolvedValue({ id: 'ext-1' });
    await confirmGooglePlaceId('place-1', {}, 'tok-123');
    expect(mockPost).toHaveBeenCalledWith('/places/place-1/external-identifiers/google-places/confirm', 'tok-123', {});
  });
});

describe('revokeGooglePlaceIdVerification', () => {
  it('POSTs to .../google-places/revoke with an empty body', async () => {
    mockPost.mockResolvedValue({ id: 'ext-1', verified_at: null });
    await revokeGooglePlaceIdVerification('place-1', 'tok-123');
    expect(mockPost).toHaveBeenCalledWith('/places/place-1/external-identifiers/google-places/revoke', 'tok-123', {});
  });
});
