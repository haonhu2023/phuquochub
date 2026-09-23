import { getHotel } from './hotels.api';
import { apiGet } from '@/lib/http';

jest.mock('@/lib/http', () => ({
  apiGet: jest.fn(),
  apiGetPaginated: jest.fn(),
}));

const mockGet = apiGet as jest.Mock;

beforeEach(() => {
  mockGet.mockReset();
});

// Mirrors places.api.spec.ts's `getPlace — locale passthrough` block: getHotel() previously never
// sent a `?locale=` at all (the bug this test suite guards against — see hotels.api.ts's own
// comment for the full trace and the still-open backend gap).
describe('getHotel — locale passthrough', () => {
  it('no locale argument → requests ?locale=vi (matches the current all-Vietnamese UI, zero behavior change for existing callers)', async () => {
    await getHotel('la-veranda-resort');
    expect(mockGet).toHaveBeenCalledWith('/hotels/la-veranda-resort?locale=vi', { cache: 'no-store' });
  });

  it('explicit locale=en → requests ?locale=en', async () => {
    await getHotel('la-veranda-resort', 'en');
    expect(mockGet).toHaveBeenCalledWith('/hotels/la-veranda-resort?locale=en', { cache: 'no-store' });
  });

  it('slug is still URI-encoded (unchanged from before this fix)', async () => {
    await getHotel('bãi sao');
    expect(mockGet).toHaveBeenCalledWith(`/hotels/${encodeURIComponent('bãi sao')}?locale=vi`, {
      cache: 'no-store',
    });
  });

  it('never fetches from cache (unchanged) — no stale locale can be served from a shared cache entry', async () => {
    await getHotel('la-veranda-resort', 'en');
    expect(mockGet).toHaveBeenCalledWith(expect.any(String), { cache: 'no-store' });
  });

  it('two consecutive calls with different locales produce two distinct request URLs, not a shared/collapsed one', async () => {
    await getHotel('la-veranda-resort', 'vi');
    await getHotel('la-veranda-resort', 'en');
    expect(mockGet).toHaveBeenNthCalledWith(1, '/hotels/la-veranda-resort?locale=vi', { cache: 'no-store' });
    expect(mockGet).toHaveBeenNthCalledWith(2, '/hotels/la-veranda-resort?locale=en', { cache: 'no-store' });
  });
});
