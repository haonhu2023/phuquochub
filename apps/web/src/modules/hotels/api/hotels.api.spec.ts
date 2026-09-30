import { getHotel, updateHotelDetails } from './hotels.api';
import { apiGet, apiPatchAuth } from '@/lib/http';

jest.mock('@/lib/http', () => ({
  apiGet: jest.fn(),
  apiGetPaginated: jest.fn(),
  apiPatchAuth: jest.fn(),
}));

const mockGet = apiGet as jest.Mock;
const mockPatchAuth = apiPatchAuth as jest.Mock;

beforeEach(() => {
  mockGet.mockReset();
  mockPatchAuth.mockReset();
});

// Mirrors places.api.spec.ts's `getPlace — locale passthrough` block: getHotel() previously never
// sent a `?locale=` at all. Backend now genuinely forwards it end to end
// (HotelsService.getBySlug(slug, locale) -> PlacesService.getBySlug(slug, locale), see
// hotels.api.ts's own comment, gộp nhánh 2026-09-23) — confirmed directly on production that
// GET /hotels/:slug?locale=en returns real English name/description for a hotel with an approved
// translation (la-veranda-resort); this suite guards the web client actually sending that query.
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

// PATCH TỪNG PHẦN thật (product spec, 2026-09-29) — omitted field giữ nguyên, `null` xoá. Client
// chỉ chuyển tiếp payload nguyên vẹn xuống apiPatchAuth (JSON.stringify tự loại key undefined) —
// test này khoá lại việc KHÔNG có tầng nào ở client âm thầm chèn `?? null`/mặc định vào giữa.
describe('updateHotelDetails', () => {
  it('gửi đúng payload nguyên vẹn (kể cả field vắng mặt), đúng URL/token', async () => {
    mockPatchAuth.mockResolvedValue({ hotel_type: 'resort', content_version: 2 });
    await updateHotelDetails('h1', { expected_content_version: 1, hotel_type: 'resort', star_rating: 5 }, 'token-1');
    expect(mockPatchAuth).toHaveBeenCalledWith('/hotels/h1/details', 'token-1', {
      expected_content_version: 1,
      hotel_type: 'resort',
      star_rating: 5,
    });
  });

  it('gửi field=null (xoá tường minh) nguyên vẹn, không bị đổi thành undefined hay bỏ qua', async () => {
    mockPatchAuth.mockResolvedValue({ hotel_type: 'resort', content_version: 2 });
    await updateHotelDetails('h1', { expected_content_version: 1, hotel_type: 'resort', check_out: null }, 'token-1');
    expect(mockPatchAuth).toHaveBeenCalledWith('/hotels/h1/details', 'token-1', {
      expected_content_version: 1,
      hotel_type: 'resort',
      check_out: null,
    });
  });
});
