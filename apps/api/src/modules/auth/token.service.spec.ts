import { UnauthorizedException } from '@nestjs/common';
import { TokenService, RefreshTokenError } from './token.service';
import { createMock, LooseMock } from '../../../test/helpers/create-mock';

// Unit test logic cấp/xoay/thu hồi token (auth.md §1.2/1.4). Mock jwt/config/redis/usersRepo
// để không phụ thuộc hạ tầng — theo phong cách auth.service.spec.ts (new + mock).
//
// H-5: `rotate()` tiêu thụ jti qua MỘT lệnh Lua atomic (`client.eval`) thay vì GET/DEL riêng lẻ —
// unit test mock TRỰC TIẾP kết quả `eval()` trả về (như thể Lua đã chạy), vì mục tiêu ở tầng unit
// là chứng minh TokenService ánh xạ ĐÚNG từng kết quả sang hành vi/exception tương ứng — KHÔNG
// phải chứng minh bản thân script Lua atomic (việc đó cần Redis THẬT, xem
// `auth-refresh-reuse.e2e-spec.ts`).
describe('TokenService', () => {
  type Deps = ConstructorParameters<typeof TokenService>;
  let jwt: LooseMock<Deps[0]>;
  let config: LooseMock<Deps[1]>;
  let redis: LooseMock<Deps[2]>;
  let client: {
    set: jest.Mock;
    get: jest.Mock;
    del: jest.Mock;
    srem: jest.Mock;
    smembers: jest.Mock;
    eval: jest.Mock;
    multi: jest.Mock;
  };
  let usersRepo: LooseMock<Deps[3]>;
  let service: TokenService;
  // H-1: `issueTokens`/`revoke`/`revokeAllRefreshForUser` gom lệnh vào MULTI (một round-trip). Mock
  // ghi lại chuỗi lệnh đã xếp để test khẳng định chính xác từng lệnh, thay vì chỉ khẳng định trên
  // `client.set`.
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
      srem: jest.fn(),
      // H-5: hai chỉ mục theo user (jti và family) dùng chung `smembers` — phân biệt theo key.
      smembers: jest.fn().mockResolvedValue([]),
      eval: jest.fn(),
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

  /** H-3: gọi rotate() mong đợi THẤT BẠI, trả về đúng lỗi RefreshTokenError đã ném (không union type). */
  async function rotateExpectingError(refreshToken: string): Promise<RefreshTokenError> {
    try {
      await service.rotate(refreshToken);
      throw new Error('rotate() lẽ ra phải ném lỗi nhưng lại thành công');
    } catch (err) {
      return err as RefreshTokenError;
    }
  }

  afterEach(() => jest.clearAllMocks());

  it('issueTokens: ký access+refresh, lưu jti (kèm state+family) vào Redis với TTL refresh, + chỉ mục jti VÀ family theo user', async () => {
    jwt.signAsync.mockResolvedValueOnce('access-token').mockResolvedValueOnce('refresh-token');
    const result = await service.issueTokens(
      { id: 'user-1', email: 'a@b.com' } as Parameters<typeof service.issueTokens>[0],
    );

    expect(result).toEqual({
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      expiresIn: 900,
      userId: 'user-1',
    });
    // H-5: giá trị Redis nay là `active:{userId}:{familyId}`, KHÔNG còn là bare userId. Payload JWT
    // (đối số cho signAsync) KHÔNG đổi — kiểm riêng ở test dưới.
    expect(queuedCmd('set')[0]).toEqual([
      'set',
      expect.stringMatching(/^refresh:/),
      expect.stringMatching(/^active:user-1:[0-9a-f-]{36}$/),
      'EX',
      1209600,
    ]);
    expect(queuedCmd('sadd')).toEqual([
      ['sadd', 'refresh:user:user-1', expect.any(String)],
      ['sadd', 'refresh:user:families:user-1', expect.any(String)],
    ]);
    expect(queuedCmd('expire')).toEqual([
      ['expire', 'refresh:user:user-1', 1209600],
      ['expire', 'refresh:user:families:user-1', 1209600],
    ]);
  });

  it('issueTokens: KHÔNG thêm claim `fam` (hay bất kỳ claim mới nào) vào JWT — family chỉ sống trong Redis', async () => {
    jwt.signAsync.mockResolvedValueOnce('access-token').mockResolvedValueOnce('refresh-token');
    await service.issueTokens({ id: 'user-1', email: 'a@b.com' } as Parameters<
      typeof service.issueTokens
    >[0]);

    const refreshPayload = jwt.signAsync.mock.calls[1][0];
    expect(Object.keys(refreshPayload).sort()).toEqual(['jti', 'sub', 'type']);
  });

  it('issueTokens: hai lần cấp liên tiếp (login/register) → hai family KHÁC NHAU', async () => {
    jwt.signAsync.mockResolvedValue('t');
    await service.issueTokens({ id: 'user-1', email: 'a@b.com' } as Parameters<
      typeof service.issueTokens
    >[0]);
    const firstValue = queuedCmd('set')[0][2] as string;
    queued = [];
    await service.issueTokens({ id: 'user-1', email: 'a@b.com' } as Parameters<
      typeof service.issueTokens
    >[0]);
    const secondValue = queuedCmd('set')[0][2] as string;

    expect(firstValue).not.toBe(secondValue);
  });

  it('issueTokens: gọi với familyId (đường rotate) → dùng ĐÚNG family truyền vào, không sinh mới', async () => {
    jwt.signAsync.mockResolvedValueOnce('access-token').mockResolvedValueOnce('refresh-token');
    await service.issueTokens(
      { id: 'user-1', email: 'a@b.com' } as Parameters<typeof service.issueTokens>[0],
      'fam-existing',
    );
    expect(queuedCmd('set')[0]).toEqual([
      'set',
      expect.stringMatching(/^refresh:/),
      'active:user-1:fam-existing',
      'EX',
      1209600,
    ]);
    expect(queuedCmd('sadd')[1]).toEqual(['sadd', 'refresh:user:families:user-1', 'fam-existing']);
  });

  describe('rotate — tiêu thụ jti qua Lua atomic (eval)', () => {
    it('eval → ok: rút jti cũ khỏi chỉ mục ACTIVE, phát bộ mới CÙNG family', async () => {
      jwt.verifyAsync.mockResolvedValue({ sub: 'user-1', jti: 'jti-1', type: 'refresh' });
      client.eval.mockResolvedValue(['ok', 'user-1', 'fam-1']);
      usersRepo.findById.mockResolvedValue({ id: 'user-1', isActive: true });
      jwt.signAsync.mockResolvedValueOnce('new-access').mockResolvedValueOnce('new-refresh');

      const result = await service.rotate('refresh-token');

      expect(client.eval).toHaveBeenCalledWith(
        expect.any(String),
        1,
        'refresh:jti-1',
        'refresh:family:',
        ':revoked',
        '1209600',
      );
      expect(client.srem).toHaveBeenCalledWith('refresh:user:user-1', 'jti-1');
      // family truyền tiếp cho issueTokens() — jti CON nằm CÙNG family với jti cha.
      expect(queuedCmd('set')[0]).toEqual([
        'set',
        expect.stringMatching(/^refresh:/),
        'active:user-1:fam-1',
        'EX',
        1209600,
      ]);
      expect(result.accessToken).toBe('new-access');
    });

    it('eval → invalid (jti không tồn tại) → RefreshTokenError(reason=revoked, userId=payload.sub), KHÔNG xoay', async () => {
      jwt.verifyAsync.mockResolvedValue({ sub: 'user-1', jti: 'jti-1', type: 'refresh' });
      client.eval.mockResolvedValue(['invalid']);

      const err = await rotateExpectingError('t');
      expect(err).toBeInstanceOf(UnauthorizedException);
      expect(err.reason).toBe('revoked');
      expect(err.userId).toBe('user-1');
      expect(client.srem).not.toHaveBeenCalled();
      expect(usersRepo.findById).not.toHaveBeenCalled();
    });

    it('eval → family_revoked → RefreshTokenError(reason=revoked — KHÔNG phải "reused", family đã xử lý từ trước) + dọn jti khỏi chỉ mục active (best-effort)', async () => {
      jwt.verifyAsync.mockResolvedValue({ sub: 'user-1', jti: 'jti-2', type: 'refresh' });
      client.eval.mockResolvedValue(['family_revoked', 'user-1', 'fam-1']);

      const err = await rotateExpectingError('t');
      expect(err.reason).toBe('revoked');
      expect(err.userId).toBe('user-1');
      expect(err.familyId).toBeNull();
      expect(client.srem).toHaveBeenCalledWith('refresh:user:user-1', 'jti-2');
    });

    // H-5 — trọng tâm finding: tái dùng một jti ĐÃ tiêu thụ phải được PHÂN BIỆT khỏi "revoked" thường.
    it('eval → reused → RefreshTokenError(reason=reused, userId, familyId) — để AuthService kích hoạt phản ứng H-1/audit riêng', async () => {
      jwt.verifyAsync.mockResolvedValue({ sub: 'user-1', jti: 'jti-3', type: 'refresh' });
      client.eval.mockResolvedValue(['reused', 'user-1', 'fam-2']);

      const err = await rotateExpectingError('t');
      expect(err).toBeInstanceOf(UnauthorizedException);
      expect(err.reason).toBe('reused');
      expect(err.userId).toBe('user-1');
      expect(err.familyId).toBe('fam-2');
      // KHÔNG cấp bộ token mới nào cho request tái dùng.
      expect(jwt.signAsync).not.toHaveBeenCalled();
    });

    it('eval → ok nhưng userId trả về LỆCH payload.sub (không thể xảy ra trừ khi khoá ký JWT lộ) → invalid_token, phòng thủ chiều sâu', async () => {
      jwt.verifyAsync.mockResolvedValue({ sub: 'user-attacker', jti: 'jti-4', type: 'refresh' });
      client.eval.mockResolvedValue(['ok', 'user-real-owner', 'fam-1']);

      const err = await rotateExpectingError('t');
      expect(err.reason).toBe('invalid_token');
      expect(err.userId).toBeNull();
    });

    it('user bị vô hiệu hóa sau khi jti hợp lệ → RefreshTokenError(reason=user_inactive)', async () => {
      jwt.verifyAsync.mockResolvedValue({ sub: 'user-1', jti: 'jti-5', type: 'refresh' });
      client.eval.mockResolvedValue(['ok', 'user-1', 'fam-1']);
      usersRepo.findById.mockResolvedValue({ id: 'user-1', isActive: false });

      const err = await rotateExpectingError('t');
      expect(err.reason).toBe('user_inactive');
      expect(err.userId).toBe('user-1');
    });

    it('token type sai (không phải refresh) → Unauthorized, KHÔNG chạm Redis', async () => {
      jwt.verifyAsync.mockResolvedValue({ sub: 'user-1', jti: 'jti-1', type: 'access' });
      await expect(service.rotate('t')).rejects.toBeInstanceOf(UnauthorizedException);
      expect(client.eval).not.toHaveBeenCalled();
    });

    it('chữ ký/định dạng hỏng → RefreshTokenError(reason=invalid_token, userId=null) — KHÔNG BAO GIỜ tin payload chưa verify', async () => {
      jwt.verifyAsync.mockRejectedValue(new Error('bad signature'));
      const err = await rotateExpectingError('t');
      expect(err.reason).toBe('invalid_token');
      expect(err.userId).toBeNull();
    });

    // Phase 7 — "Redis failure behavior explicit": lỗi hạ tầng KHÔNG bị nuốt/biến thành 401 giả.
    it('Redis (eval) lỗi → rotate() ném NGUYÊN lỗi đó, KHÔNG nuốt/không map thành RefreshTokenError', async () => {
      jwt.verifyAsync.mockResolvedValue({ sub: 'user-1', jti: 'jti-1', type: 'refresh' });
      client.eval.mockRejectedValue(new Error('redis down'));
      await expect(service.rotate('t')).rejects.toThrow('redis down');
    });

    it('eval trả kết quả không nhận diện được → ném lỗi rõ ràng (không âm thầm coi là hợp lệ)', async () => {
      jwt.verifyAsync.mockResolvedValue({ sub: 'user-1', jti: 'jti-1', type: 'refresh' });
      client.eval.mockResolvedValue(['unexpected-status']);
      await expect(service.rotate('t')).rejects.toThrow(/không nhận diện được/);
    });
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

  // H-1/H-5 — logout-all cần xoá MỌI refresh token CỦA MỘT user, VÀ (H-5) thu hồi MỌI family.
  describe('revokeAllRefreshForUser (H-1 + H-5)', () => {
    /** Mock hai chỉ mục (jti / family) trả kết quả KHÁC NHAU theo đúng key được truy vấn. */
    function mockIndexes(jtis: string[], familyIds: string[]): void {
      client.smembers.mockImplementation((key: string) =>
        Promise.resolve(key.startsWith('refresh:user:families:') ? familyIds : jtis),
      );
    }

    it('xoá mọi jti + xoá chỉ mục jti + đặt family-revoked cho mọi family + xoá chỉ mục family', async () => {
      mockIndexes(['jti-1', 'jti-2', 'jti-3'], ['fam-1', 'fam-2']);

      const count = await service.revokeAllRefreshForUser('user-1');

      expect(count).toBe(3);
      expect(client.smembers).toHaveBeenCalledWith('refresh:user:user-1');
      expect(client.smembers).toHaveBeenCalledWith('refresh:user:families:user-1');
      expect(queuedCmd('del')).toEqual([
        ['del', 'refresh:jti-1', 'refresh:jti-2', 'refresh:jti-3'],
        ['del', 'refresh:user:user-1'],
        ['del', 'refresh:user:families:user-1'],
      ]);
      expect(queuedCmd('set')).toEqual([
        ['set', 'refresh:family:fam-1:revoked', '1', 'EX', 1209600],
        ['set', 'refresh:family:fam-2:revoked', '1', 'EX', 1209600],
      ]);
    });

    it('chỉ mục rỗng (cả jti lẫn family) -> 0, vẫn dọn cả hai khoá chỉ mục, KHÔNG gọi MULTI vô ích', async () => {
      mockIndexes([], []);

      const count = await service.revokeAllRefreshForUser('user-1');

      expect(count).toBe(0);
      expect(client.del).toHaveBeenCalledWith('refresh:user:user-1', 'refresh:user:families:user-1');
      expect(client.multi).not.toHaveBeenCalled();
    });

    it('chỉ family còn (jti trống, vd đã tự hết hạn hết) → vẫn thu hồi family qua MULTI', async () => {
      mockIndexes([], ['fam-1']);

      const count = await service.revokeAllRefreshForUser('user-1');

      expect(count).toBe(0);
      expect(client.multi).toHaveBeenCalled();
      expect(queuedCmd('set')).toEqual([['set', 'refresh:family:fam-1:revoked', '1', 'EX', 1209600]]);
    });

    it('jti "mồ côi" (khoá gốc đã tự hết hạn) vẫn được xử lý — DEL trên khoá thiếu là no-op', async () => {
      mockIndexes(['jti-stale'], []);
      await expect(service.revokeAllRefreshForUser('user-1')).resolves.toBe(1);
      expect(queuedCmd('del')[0]).toEqual(['del', 'refresh:jti-stale']);
    });

    it('lỗi Redis NỔI LÊN (không nuốt) — caller phải biết logout-all chưa hoàn tất', async () => {
      client.smembers.mockRejectedValue(new Error('redis down'));
      await expect(service.revokeAllRefreshForUser('user-1')).rejects.toThrow('redis down');
    });
  });
});
