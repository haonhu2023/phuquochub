import { getPlace, listEnIndexablePlaceIds, listPlaces } from './places.api';
import { apiGet, apiPostPublic } from '@/lib/http';

jest.mock('@/lib/http', () => ({
  apiGet: jest.fn(),
  apiPostPublic: jest.fn(),
}));

const mockGet = apiGet as jest.Mock;
const mockPostPublic = apiPostPublic as jest.Mock;

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
    expect(mockGet).toHaveBeenCalledWith('/places/vinwonders-phu-quoc?locale=vi', {
      next: { tags: ['place:vinwonders-phu-quoc'], revalidate: 60 },
    });
  });

  it('explicit locale=en → requests ?locale=en', async () => {
    await getPlace('vinwonders-phu-quoc', 'en');
    expect(mockGet).toHaveBeenCalledWith('/places/vinwonders-phu-quoc?locale=en', {
      next: { tags: ['place:vinwonders-phu-quoc'], revalidate: 60 },
    });
  });

  it('slug is still URI-encoded (unchanged from before this feature)', async () => {
    await getPlace('bãi sao');
    expect(mockGet).toHaveBeenCalledWith(
      `/places/${encodeURIComponent('bãi sao')}?locale=vi`,
      { next: { tags: ['place:bãi sao'], revalidate: 60 } },
    );
  });

  // C1 (2026-09-22): thay `no-store` bằng cache có tag + cửa sổ 60s an toàn — publish/update/
  // unpublish qua EditPlaceView.tsx gọi POST /api/revalidate với tag `place:<slug>` NGAY sau khi
  // ghi thành công, nên dữ liệu công khai vẫn cập nhật gần như tức thời (xác nhận thật bằng tay
  // trên production build — xem plan checkpoint) dù không còn no-store.
  it('dùng tag theo slug, có cửa sổ revalidate an toàn (không còn no-store)', async () => {
    await getPlace('vinwonders-phu-quoc');
    expect(mockGet).toHaveBeenCalledWith(expect.any(String), {
      next: { tags: ['place:vinwonders-phu-quoc'], revalidate: 60 },
    });
  });
});

describe('listPlaces — unaffected by the locale read path (list localization deferred, see report)', () => {
  it('still builds the same query string with no locale param, dùng tag places:list (C1)', async () => {
    mockGet.mockResolvedValue([]);
    await listPlaces({ category: 'attraction' });
    expect(mockGet).toHaveBeenCalledWith('/places?category=attraction', {
      next: { tags: ['places:list'], revalidate: 60 },
    });
  });
});

describe('listEnIndexablePlaceIds (SEO1, 2026-09-22)', () => {
  beforeEach(() => {
    mockPostPublic.mockReset();
  });

  it('empty input → empty output, no request made', async () => {
    const result = await listEnIndexablePlaceIds([]);
    expect(result).toEqual([]);
    expect(mockPostPublic).not.toHaveBeenCalled();
  });

  it('POSTs the ids to /places/en-indexable-ids, no auth', async () => {
    mockPostPublic.mockResolvedValue(['id-1']);
    const result = await listEnIndexablePlaceIds(['id-1', 'id-2']);
    expect(mockPostPublic).toHaveBeenCalledWith('/places/en-indexable-ids', { ids: ['id-1', 'id-2'] });
    expect(result).toEqual(['id-1']);
  });
});
