import { UnauthorizedException } from '@nestjs/common';
import { TokenService } from './token.service';
import { createMock, LooseMock } from '../../../test/helpers/create-mock';

// Unit test logic cấp/xoay/thu hồi token (auth.md §1.2/1.4). Mock jwt/config/redis/usersRepo
// để không phụ thuộc hạ tầng — theo phong cách auth.service.spec.ts (new + mock).
describe('TokenService', () => {
  type Deps = ConstructorParameters<typeof TokenService>;
  let jwt: LooseMock<Deps[0]>;
  let config: LooseMock<Deps[1]>;
  let redis: LooseMock<Deps[2]>;
  let client: {
    set: jest.Mock;
    get: jest.Mock;
    del: jest.Mock;
    smembers: jest.Mock;
    multi: jest.Mock;
  };
  let usersRepo: LooseMock<Deps[3]>;
  let service: TokenService;
  // H-1: `issueTokens`/`rotate`/`revoke` gom lệnh vào MULTI (một round-trip). Mock ghi lại chuỗi
  // lệnh đã xếp để test khẳng định chính xác từng lệnh, thay vì chỉ khẳng định trên `client.set`.
  let queued: Array<[string, ...unknown[]]>;

  beforeEach(() => {
    jwt = createMock<Deps[0]>({ signAsync: jest.fn(), verifyAsync: jest.fn() });
    const cfg: Record<string, unknown> = {
      'jwt.accessTtl': 900,
      'jwt.refreshTtl': 1209600,
      'jwt.accessSecret': 'acc-secret',
      'jwt.refreshSecret': 'ref-secret',
    };
    config = createMock<Deps[1]>({ get: jest.fn((k: string) => cfg[k]) });

    queued = [];
    const multi: Record<string, unknown> = {};
    for (const cmd of ['set', 'del', 'sadd', 'srem', 'expire']) {
      multi[cmd] = (...args: unknown[]) => {
        queued.push([cmd, ...args]);
        return multi;
      };
    }
    multi.exec = jest.fn().mockResolvedValue([]);

    client = {
      set: jest.fn(),
      get: jest.fn(),
      del: jest.fn(),
      smembers: jest.fn().mockResolvedValue([]),
      multi: jest.fn(() => multi),
    };
    redis = createMock<Deps[2]>({ getClient: jest.fn(() => client) });
    usersRepo = createMock<Deps[3]>({ findById: jest.fn() });
    service = new TokenService(jwt, config, redis, usersRepo);
  });

  /** Tìm lệnh đã xếp vào MULTI theo tên (trợ giúp khẳng định). */
  function queuedCmd(name: string): Array<[string, ...unknown[]]> {
    return queued.filter((c) => c[0] === name);
  }

  afterEach(() => jest.clearAllMocks());

  it('issueTokens: ký access+refresh, lưu jti vào Redis với TTL refresh', async () => {
    jwt.signAsync.mockResolvedValueOnce('access-token').mockResolvedValueOnce('refresh-token');
    const result = await service.issueTokens(
      { id: 'user-1', email: 'a@b.com' } as Parameters<typeof service.issueTokens>[0],
    );

    expect(result).toEqual({
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      expiresIn: 900,
    });
    expect(queuedCmd('set')[0]).toEqual([
      'set',
      expect.stringMatching(/^refresh:/),
      'user-1',
      'EX',
      1209600,
    ]);
    // H-1: cùng lúc ghi chỉ mục theo user (cần cho logout-all) + đặt lại TTL của chỉ mục.
    expect(queuedCmd('sadd')[0]).toEqual([
      'sadd',
      'refresh:user:user-1',
      expect.any(String),
    ]);
    expect(queuedCmd('expire')[0]).toEqual(['expire', 'refresh:user:user-1', 1209600]);
  });

  it('rotate: jti hợp lệ + user active → xóa jti cũ, phát bộ mới', async () => {
    jwt.verifyAsync.mockResolvedValue({ sub: 'user-1', jti: 'jti-1', type: 'refresh' });
    client.get.mockResolvedValue('user-1');
    usersRepo.findById.mockResolvedValue({ id: 'user-1', isActive: true });
    jwt.signAsync.mockResolvedValueOnce('new-access').mockResolvedValueOnce('new-refresh');

    const result = await service.rotate('refresh-token');

    expect(queuedCmd('del')[0]).toEqual(['del', 'refresh:jti-1']);
    // H-1: rút jti cũ khỏi chỉ mục để nó không phình theo mỗi lần xoay vòng.
    expect(queuedCmd('srem')[0]).toEqual(['srem', 'refresh:user:user-1', 'jti-1']);
    expect(result.accessToken).toBe('new-access');
  });

  it('rotate: jti không còn trong Redis (đã thu hồi) → Unauthorized, không xoay', async () => {
    jwt.verifyAsync.mockResolvedValue({ sub: 'user-1', jti: 'jti-1', type: 'refresh' });
    client.get.mockResolvedValue(null);

    await expect(service.rotate('t')).rejects.toBeInstanceOf(UnauthorizedException);
    expect(queuedCmd('del')).toHaveLength(0);
  });

  it('rotate: user bị vô hiệu hóa → Unauthorized', async () => {
    jwt.verifyAsync.mockResolvedValue({ sub: 'user-1', jti: 'jti-1', type: 'refresh' });
    client.get.mockResolvedValue('user-1');
    usersRepo.findById.mockResolvedValue({ id: 'user-1', isActive: false });

    await expect(service.rotate('t')).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rotate: token type sai (không phải refresh) → Unauthorized', async () => {
    jwt.verifyAsync.mockResolvedValue({ sub: 'user-1', jti: 'jti-1', type: 'access' });
    await expect(service.rotate('t')).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('revoke: token hợp lệ → xóa jti', async () => {
    jwt.verifyAsync.mockResolvedValue({ sub: 'u', jti: 'jti-9', type: 'refresh' });
    await service.revoke('t');
    expect(queuedCmd('del')[0]).toEqual(['del', 'refresh:jti-9']);
    expect(queuedCmd('srem')[0]).toEqual(['srem', 'refresh:user:u', 'jti-9']);
  });

  it('revoke: token hỏng → nuốt lỗi (idempotent), không ném', async () => {
    jwt.verifyAsync.mockRejectedValue(new Error('bad token'));
    await expect(service.revoke('t')).resolves.toBeUndefined();
    expect(queuedCmd('del')).toHaveLength(0);
  });

  // H-1 — logout-all cần xoá MỌI refresh token của một user; trước đây Redis chỉ có
  // `refresh:{jti} -> userId` nên không có đường nào liệt kê chúng.
  describe('revokeAllRefreshForUser (H-1)', () => {
    it('xoá mọi jti trong chỉ mục + xoá luôn chỉ mục', async () => {
      client.smembers.mockResolvedValue(['jti-1', 'jti-2', 'jti-3']);

      const count = await service.revokeAllRefreshForUser('user-1');

      expect(count).toBe(3);
      expect(client.smembers).toHaveBeenCalledWith('refresh:user:user-1');
      expect(queuedCmd('del')).toEqual([
        ['del', 'refresh:jti-1', 'refresh:jti-2', 'refresh:jti-3'],
        ['del', 'refresh:user:user-1'],
      ]);
    });

    it('chỉ mục rỗng -> 0, vẫn dọn khoá chỉ mục, KHÔNG gọi MULTI vô ích', async () => {
      client.smembers.mockResolvedValue([]);

      const count = await service.revokeAllRefreshForUser('user-1');

      expect(count).toBe(0);
      expect(client.del).toHaveBeenCalledWith('refresh:user:user-1');
      expect(client.multi).not.toHaveBeenCalled();
    });

    it('jti "mồ côi" (khoá gốc đã tự hết hạn) vẫn được xử lý — DEL trên khoá thiếu là no-op', async () => {
      client.smembers.mockResolvedValue(['jti-stale']);
      await expect(service.revokeAllRefreshForUser('user-1')).resolves.toBe(1);
      expect(queuedCmd('del')[0]).toEqual(['del', 'refresh:jti-stale']);
    });

    it('lỗi Redis NỔI LÊN (không nuốt) — caller phải biết logout-all chưa hoàn tất', async () => {
      client.smembers.mockRejectedValue(new Error('redis down'));
      await expect(service.revokeAllRefreshForUser('user-1')).rejects.toThrow('redis down');
    });
  });
});
