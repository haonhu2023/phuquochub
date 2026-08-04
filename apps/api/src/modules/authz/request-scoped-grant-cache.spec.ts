import { RequestScopedGrantCache } from './request-scoped-grant-cache';
import type { ScopedGrant } from './scoped-grant';

const FAKE_GRANT: ScopedGrant = { code: 'Category.Manage', effect: 'allow', scopeType: 'global', businessId: null };

describe('RequestScopedGrantCache (ADR-019 D11 — nền tảng ghi nhớ theo request)', () => {
  it('hai lệnh load() đồng thời trong CÙNG instance -> loader chỉ được gọi ĐÚNG MỘT LẦN', async () => {
    const loader = jest.fn().mockResolvedValue([FAKE_GRANT]);
    const cache = new RequestScopedGrantCache(loader);

    const [a, b] = await Promise.all([cache.load('u1'), cache.load('u1')]);

    expect(loader).toHaveBeenCalledTimes(1);
    expect(a).toEqual([FAKE_GRANT]);
    expect(b).toEqual([FAKE_GRANT]);
  });

  it('hai lệnh load() đồng thời chia sẻ CHÍNH XÁC cùng một Promise đang bay (không chỉ cùng giá trị)', () => {
    const loader = jest.fn().mockResolvedValue([FAKE_GRANT]);
    const cache = new RequestScopedGrantCache(loader);

    const p1 = cache.load('u1');
    const p2 = cache.load('u1');

    expect(p1).toBe(p2); // cùng object Promise, không phải hai Promise resolve cùng giá trị
  });

  it('load() nhiều lần TUẦN TỰ (sau khi Promise đầu đã resolve) trong CÙNG instance vẫn chỉ gọi loader một lần', async () => {
    const loader = jest.fn().mockResolvedValue([FAKE_GRANT]);
    const cache = new RequestScopedGrantCache(loader);

    await cache.load('u1');
    await cache.load('u1');
    await cache.load('u1');

    expect(loader).toHaveBeenCalledTimes(1);
  });

  it('hai userId KHÁC nhau trong CÙNG instance -> mỗi userId nạp riêng (không trộn kết quả)', async () => {
    const loader = jest
      .fn()
      .mockImplementation((userId: string) => Promise.resolve([{ ...FAKE_GRANT, code: `Grant.For.${userId}` }]));
    const cache = new RequestScopedGrantCache(loader);

    const [g1, g2] = await Promise.all([cache.load('u1'), cache.load('u2')]);

    expect(loader).toHaveBeenCalledTimes(2);
    expect(g1[0].code).toBe('Grant.For.u1');
    expect(g2[0].code).toBe('Grant.For.u2');
  });

  it('HAI instance riêng biệt (mô phỏng hai request khác nhau) -> mỗi instance tự nạp riêng, KHÔNG chia sẻ gì (cấm cache xuyên request, D11)', async () => {
    const loader = jest.fn().mockResolvedValue([FAKE_GRANT]);
    const requestA = new RequestScopedGrantCache(loader);
    const requestB = new RequestScopedGrantCache(loader);

    await requestA.load('u1');
    await requestB.load('u1');

    expect(loader).toHaveBeenCalledTimes(2); // KHÔNG phải 1 — hai request độc lập tuyệt đối
  });

  it('loader thất bại -> lỗi được truyền ra đúng, KHÔNG bị nuốt', async () => {
    const loader = jest.fn().mockRejectedValue(new Error('DB down'));
    const cache = new RequestScopedGrantCache(loader);

    await expect(cache.load('u1')).rejects.toThrow('DB down');
  });

  it('loader thất bại -> KHÔNG trở thành mục cache VĨNH VIỄN; lệnh load() sau đó (cùng instance) thử nạp lại', async () => {
    const loader = jest.fn().mockRejectedValueOnce(new Error('DB down')).mockResolvedValueOnce([FAKE_GRANT]);
    const cache = new RequestScopedGrantCache(loader);

    await expect(cache.load('u1')).rejects.toThrow('DB down');
    // Cho microtask catch() nội bộ chạy xong trước khi gọi lại (dọn cache thất bại là bất đồng bộ).
    await Promise.resolve();
    await Promise.resolve();

    await expect(cache.load('u1')).resolves.toEqual([FAKE_GRANT]);
    expect(loader).toHaveBeenCalledTimes(2); // lần 1 thất bại, lần 2 thử lại thành công — KHÔNG kẹt
  });

  it('loader thất bại cho userId A KHÔNG ảnh hưởng cache của userId B trong CÙNG instance', async () => {
    const loader = jest.fn().mockImplementation((userId: string) => {
      if (userId === 'bad') return Promise.reject(new Error('DB down'));
      return Promise.resolve([FAKE_GRANT]);
    });
    const cache = new RequestScopedGrantCache(loader);

    await expect(cache.load('bad')).rejects.toThrow('DB down');
    await expect(cache.load('good')).resolves.toEqual([FAKE_GRANT]);
    expect(loader).toHaveBeenCalledTimes(2);
  });

  it('size phản ánh đúng số userId đang ghi nhớ (đang bay hoặc đã xong) trong instance', async () => {
    const loader = jest.fn().mockResolvedValue([FAKE_GRANT]);
    const cache = new RequestScopedGrantCache(loader);

    expect(cache.size).toBe(0);
    const p = cache.load('u1');
    expect(cache.size).toBe(1);
    await p;
    expect(cache.size).toBe(1);
  });
});
