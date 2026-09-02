import { getPlace, listPlaces } from './places.api';
import { apiGet } from '@/lib/http';

jest.mock('@/lib/http', () => ({
  apiGet: jest.fn(),
}));

const mockGet = apiGet as jest.Mock;

beforeEach(() => {
  mockGet.mockReset().mockResolvedValue({ id: 'p1' });
});

// Public Place i18n Read Path (2026-09-02) — web client seam. No language selector exists in
// apps/web today (all UI copy is hardcoded Vietnamese), so the default here MUST stay 'vi' —
// this is not a UX decision, it is preserving exactly the behavior every existing caller already
// gets (see 4 call sites: places/[slug]/page.tsx, SearchMapExplorer, MapView — none pass a
// second argument).
describe('getPlace — locale passthrough', () => {
  it('no locale argument → requests ?locale=vi (matches the current all-Vietnamese UI, zero behavior change for existing callers)', async () => {
    await getPlace('vinwonders-phu-quoc');
    expect(mockGet).toHaveBeenCalledWith('/places/vinwonders-phu-quoc?locale=vi', { cache: 'no-store' });
  });

  it('explicit locale=en → requests ?locale=en', async () => {
    await getPlace('vinwonders-phu-quoc', 'en');
    expect(mockGet).toHaveBeenCalledWith('/places/vinwonders-phu-quoc?locale=en', { cache: 'no-store' });
  });

  it('slug is still URI-encoded (unchanged from before this feature)', async () => {
    await getPlace('bãi sao');
    expect(mockGet).toHaveBeenCalledWith(
      `/places/${encodeURIComponent('bãi sao')}?locale=vi`,
      { cache: 'no-store' },
    );
  });

  it('never fetches from cache — Server Component must re-check "open now" every request (unchanged)', async () => {
    await getPlace('vinwonders-phu-quoc');
    expect(mockGet).toHaveBeenCalledWith(expect.any(String), { cache: 'no-store' });
  });
});

describe('listPlaces — unaffected by the locale read path (list localization deferred, see report)', () => {
  it('still builds the same query string with no locale param', async () => {
    mockGet.mockResolvedValue([]);
    await listPlaces({ category: 'attraction' });
    expect(mockGet).toHaveBeenCalledWith('/places?category=attraction', { cache: 'no-store' });
  });
});
