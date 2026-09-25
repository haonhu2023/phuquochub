import { listPendingOwnerDecisions, resolvePlaceNames } from './owner-todo.api';
import { apiGetAuth } from '@/lib/http';
import { previewPlace } from '@/modules/place-management/api/place-management.api';

jest.mock('@/lib/http', () => ({
  apiGetAuth: jest.fn(),
}));

jest.mock('@/modules/place-management/api/place-management.api', () => ({
  previewPlace: jest.fn(),
}));

const mockGet = apiGetAuth as jest.Mock;
const mockPreview = previewPlace as jest.Mock;

beforeEach(() => {
  mockGet.mockReset().mockResolvedValue([]);
  mockPreview.mockReset();
});

describe('listPendingOwnerDecisions', () => {
  it('mặc định status=pending, limit=50, offset=0', async () => {
    await listPendingOwnerDecisions('tok');
    expect(mockGet).toHaveBeenCalledWith('/owner-decisions?status=pending&limit=50&offset=0', 'tok', {
      cache: 'no-store',
    });
  });

  it('nhận limit/offset tuỳ chỉnh', async () => {
    await listPendingOwnerDecisions('tok', { limit: 10, offset: 20 });
    expect(mockGet).toHaveBeenCalledWith('/owner-decisions?status=pending&limit=10&offset=20', 'tok', {
      cache: 'no-store',
    });
  });
});

describe('resolvePlaceNames', () => {
  it('gọi previewPlace một lần cho mỗi placeId KHÁC NHAU, bỏ qua null', async () => {
    mockPreview.mockImplementation((id: string) =>
      Promise.resolve({ name: `Place ${id}`, slug: `place-${id}` }),
    );
    const result = await resolvePlaceNames(['p1', 'p1', 'p2', null], 'tok');
    expect(mockPreview).toHaveBeenCalledTimes(2);
    expect(result.get('p1')).toEqual({ name: 'Place p1', slug: 'place-p1' });
    expect(result.get('p2')).toEqual({ name: 'Place p2', slug: 'place-p2' });
  });

  it('previewPlace lỗi (404/403) cho một id -> id đó vắng mặt trong map, KHÔNG ném lỗi cả hàm', async () => {
    mockPreview.mockImplementation((id: string) =>
      id === 'bad' ? Promise.reject(new Error('not found')) : Promise.resolve({ name: 'OK', slug: 'ok' }),
    );
    const result = await resolvePlaceNames(['ok', 'bad'], 'tok');
    expect(result.has('ok')).toBe(true);
    expect(result.has('bad')).toBe(false);
  });

  it('mảng placeId rỗng -> không gọi previewPlace, map rỗng', async () => {
    const result = await resolvePlaceNames([], 'tok');
    expect(mockPreview).not.toHaveBeenCalled();
    expect(result.size).toBe(0);
  });

  // Rà soát Gói A (2026-09-25): 200 place KHÁC NHAU (trần QUEUE_LIMIT của OwnerTodoView) trước đây
  // gọi previewPlace() cho CẢ 200 cùng lúc qua một Promise.all trần — đúng kiểu "hàng trăm request
  // preview cùng lúc" cần tránh. Test này đo SỐ LƯỢNG ĐANG CHẠY ĐỒNG THỜI thật (không chỉ tổng số
  // lần gọi), bằng cách giữ mỗi lời gọi "treo" tới khi test tự giải phóng — nếu concurrency không
  // bị giới hạn, đỉnh sẽ nhảy thẳng lên 200 ngay lập tức.
  it('200 placeId khác nhau -> KHÔNG BAO GIỜ có quá PREVIEW_CONCURRENCY (8) lời gọi previewPlace đồng thời', async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    // setImmediate (macrotask thật) thay vì hàng đợi tự xả — để Node's event loop tự điều phối thứ
    // tự resolve, không phụ thuộc một vòng lặp test tự viết có thể suy đoán sai nhịp microtask.
    mockPreview.mockImplementation(
      (id: string) =>
        new Promise((resolve) => {
          inFlight++;
          maxInFlight = Math.max(maxInFlight, inFlight);
          setImmediate(() => {
            inFlight--;
            resolve({ name: `Place ${id}`, slug: `place-${id}` });
          });
        }),
    );

    const ids = Array.from({ length: 200 }, (_, i) => `p${i}`);
    const result = await resolvePlaceNames(ids, 'tok');

    expect(mockPreview).toHaveBeenCalledTimes(200);
    expect(result.size).toBe(200);
    expect(maxInFlight).toBeLessThanOrEqual(8);
    expect(maxInFlight).toBeGreaterThan(1); // vẫn chạy song song thật, không tuần tự hoá quá mức
  });
});
