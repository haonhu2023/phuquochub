import { getHotel } from './hotels.api';

const realFetch = global.fetch;

function mockFetchOnce(body: unknown) {
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => body,
  }) as unknown as typeof fetch;
}

afterEach(() => {
  global.fetch = realFetch;
  jest.restoreAllMocks();
});

function calledPath(): string {
  const [url] = (global.fetch as jest.Mock).mock.calls[0];
  return new URL(url).pathname + new URL(url).search;
}

// 2026-09-17 (real-data pass): trước bản sửa này, getHotel() không truyền `?locale=` nên
// /en/hotels/{slug} luôn nhận nội dung mặc định của server bất kể route — xác nhận trực tiếp trên
// production rằng GET /hotels/:slug?locale=en đã trả tên/mô tả tiếng Anh THẬT khác bản vi cho
// khách sạn đã có bản dịch duyệt (la-veranda-resort); chỉ web quên gọi với query đó.
describe('getHotel — locale forwarding', () => {
  it('không truyền locale -> mặc định "vi"', async () => {
    mockFetchOnce({ success: true, data: { id: 'h1' } });
    await getHotel('la-veranda-resort');
    expect(calledPath()).toBe('/api/hotels/la-veranda-resort?locale=vi');
  });

  it('truyền locale="en" -> gọi đúng ?locale=en', async () => {
    mockFetchOnce({ success: true, data: { id: 'h1' } });
    await getHotel('la-veranda-resort', 'en');
    expect(calledPath()).toBe('/api/hotels/la-veranda-resort?locale=en');
  });
});
