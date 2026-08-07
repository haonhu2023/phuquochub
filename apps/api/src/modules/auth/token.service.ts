import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { randomUUID } from 'crypto';
import { RedisService } from '../../core/redis/redis.service';
import { UsersRepository } from '../users/repositories/users.repository';
import { User } from '../users/entities/user.entity';

export interface IssuedTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  // H-3 (Authentication Audit Events, 2026-08-07): AuthService.refresh() không có object `User`
  // nào trong tay (chỉ một chuỗi refresh token cơ hội) nên cần userId TRẢ VỀ từ đây để ghi audit
  // `auth.refresh.success` với entityId/actorId đúng. Thuần bổ sung — không đổi ý nghĩa 3 trường cũ.
  userId: string;
}

const REFRESH_PREFIX = 'refresh:';
// H-1: chỉ mục refresh token THEO USER (Redis SET các `jti`) — cần cho logout-all ("revoke all
// refresh tokens belonging to that user"). Trước đây Redis chỉ có `refresh:{jti} -> userId`, tức
// KHÔNG có đường nào liệt kê mọi jti của một user để xoá hết. Đây là chỉ mục THUẦN BỔ TRỢ: ngữ nghĩa
// xoay vòng refresh (rotate) KHÔNG đổi một byte — vẫn single-use, vẫn kiểm `jti` trong Redis, vẫn
// kiểm `isActive`.
const REFRESH_USER_PREFIX = 'refresh:user:';
// H-5: chỉ mục THỨ HAI theo user — Redis SET các `familyId` (KHÔNG phải jti). Dùng DUY NHẤT bởi
// logout-all để liệt kê MỌI family cần đánh dấu thu hồi (Phase 4 "LOGOUT-ALL: revoke all user
// refresh families"); việc giết token NGAY LẬP TỨC vẫn do REFRESH_USER_PREFIX đảm nhiệm như cũ —
// hai chỉ mục độc lập, phục vụ hai mục đích khác nhau.
const REFRESH_USER_FAMILIES_PREFIX = 'refresh:user:families:';
// H-5: `refresh:family:{familyId}:revoked` — sự TỒN TẠI của khoá này = family đã bị thu hồi (do
// phát hiện tái dùng, hoặc do logout-all). TTL = refreshTtl, đủ sống lâu hơn MỌI descendant còn hạn
// của family đó (không cần lâu hơn vì mọi refresh token trong family cũng tự hết hạn cùng lúc).
const REFRESH_FAMILY_PREFIX = 'refresh:family:';
const REFRESH_FAMILY_REVOKED_SUFFIX = ':revoked';

/**
 * H-5 — tiêu thụ MỘT jti một cách ATOMIC (Lua EVAL). Redis thực thi toàn bộ script như MỘT lệnh
 * duy nhất — không lệnh nào khác (kể cả một EVAL khác) có thể xen giữa lúc script đang chạy — nên
 * chuỗi đọc-kiểm-đổi bên dưới không thể bị đua bởi hai `rotate()` gọi đồng thời cùng một token
 * (khác hẳn GET-rồi-DEL riêng lẻ trước đây, vốn có khoảng hở thật giữa hai round-trip Redis).
 *
 * Giá trị `refresh:{jti}` có dạng `${state}:${userId}:${familyId}` với state ∈ {active, consumed}.
 * KEYS[1] = khoá jti. Khoá family KHÔNG truyền qua KEYS vì tên của nó phụ thuộc `familyId` — thứ
 * chỉ đọc được SAU khi đã GET khoá jti — nên được DỰNG ĐỘNG bên trong script từ ARGV[1]/ARGV[2]
 * (tiền tố/hậu tố). An toàn trên Redis đơn instance (docker-compose `redis:7-alpine`, một node,
 * không phải Cluster); trên Redis Cluster cách này sẽ vỡ vì hash-slot của hai khoá có thể khác node.
 *
 * Trả về một trong bốn dạng:
 *  - {'invalid'}                          — khoá jti không tồn tại (chưa từng cấp / đã bị logout).
 *  - {'family_revoked', userId, familyId} — family đã bị thu hồi từ trước (tái dùng trước đó, hoặc
 *                                            logout-all) — mọi jti của family, dù active hay
 *                                            consumed, đều bị chặn ngay ở nhánh này.
 *  - {'reused', userId, familyId}         — jti này đã ở trạng thái consumed → đây là TÁI DÙNG.
 *                                            Script TỰ đặt khoá family-revoked (atomic, không phụ
 *                                            thuộc bước nào ở tầng ứng dụng phía sau).
 *  - {'ok', userId, familyId}             — jti hợp lệ, vừa chuyển active -> consumed (KEEPTTL —
 *                                            giữ nguyên TTL gốc, không gia hạn).
 */
const CONSUME_JTI_SCRIPT = `
local jtiVal = redis.call('GET', KEYS[1])
if not jtiVal then
  return {'invalid'}
end
local sep1 = string.find(jtiVal, ':')
local state = string.sub(jtiVal, 1, sep1 - 1)
local rest = string.sub(jtiVal, sep1 + 1)
local sep2 = string.find(rest, ':')
local userId = string.sub(rest, 1, sep2 - 1)
local familyId = string.sub(rest, sep2 + 1)
local familyKey = ARGV[1] .. familyId .. ARGV[2]

if redis.call('EXISTS', familyKey) == 1 then
  return {'family_revoked', userId, familyId}
end

if state == 'consumed' then
  redis.call('SET', familyKey, '1', 'EX', ARGV[3])
  return {'reused', userId, familyId}
end

redis.call('SET', KEYS[1], 'consumed:' .. userId .. ':' .. familyId, 'KEEPTTL')
return {'ok', userId, familyId}
`;

type ConsumeResult =
  | { status: 'invalid' }
  | { status: 'family_revoked'; userId: string; familyId: string }
  | { status: 'reused'; userId: string; familyId: string }
  | { status: 'ok'; userId: string; familyId: string };

// H-3 (Authentication Audit Events, 2026-08-07) — lý do một refresh THẤT BẠI, mang theo qua
// exception để `AuthService` ghi audit `auth.refresh.failure` với ngữ cảnh hữu ích.
// H-5: thêm 'reused' — phân biệt với 'revoked' để AuthService biết khi nào cần kích hoạt phản ứng
// bổ sung (thu hồi access token qua H-1 + audit `auth.refresh.reuse_detected`), thay vì audit
// `auth.refresh.failure` thông thường.
export type RefreshFailureReason = 'invalid_token' | 'revoked' | 'user_inactive' | 'reused';

/**
 * VẪN LÀ `UnauthorizedException` — mã HTTP 401 KHÔNG đổi. `AllExceptionsFilter` chỉ cần
 * `instanceof HttpException` + `getStatus()`/`getResponse()` (cả `Catch` decorator lẫn cách đọc
 * message), cả hai đều kế thừa NGUYÊN VẸN qua `super(message)`, nên response body/status không
 * đổi một byte so với `UnauthorizedException` trần trước đây — chỉ THÊM vài trường chỉ để audit.
 *
 * `userId` CHỈ được gán ở nhánh đã XÁC THỰC chữ ký JWT thành công (`verifyRefresh()` đã pass) —
 * KHÔNG BAO GIỜ lấy từ một payload CHƯA verify. Trường này CHỈ dùng làm actorId/entityId
 * tốt-nhất-có-thể cho audit, TUYỆT ĐỐI không dùng cho bất kỳ quyết định phân quyền nào.
 *
 * `familyId` (H-5) CHỈ gán khi `reason === 'reused'` — id family bị compromise, dùng cho audit
 * context. KHÔNG nhạy cảm: một UUID nội bộ do server sinh, không phải token/secret nào.
 */
export class RefreshTokenError extends UnauthorizedException {
  constructor(
    message: string,
    readonly reason: RefreshFailureReason,
    readonly userId: string | null = null,
    readonly familyId: string | null = null,
  ) {
    super(message);
  }
}

// Cấp/xoay/thu hồi token. Access ngắn hạn (verify bằng accessSecret);
// refresh có jti lưu ở Redis (thu hồi được) — auth.md.
@Injectable()
export class TokenService {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly redis: RedisService,
    private readonly usersRepo: UsersRepository,
  ) {}

  /**
   * `familyId` (H-5): CHỈ truyền bởi `rotate()` khi phát hành token con CÙNG family với token cha
   * vừa tiêu thụ. Bỏ trống (login/register) → family MỚI được sinh. Tham số THUẦN NỘI BỘ — không
   * lộ ra `IssuedTokens`/response API nào, nên chữ ký/response của login/register/refresh KHÔNG đổi.
   */
  async issueTokens(user: User, familyId?: string): Promise<IssuedTokens> {
    const accessTtl = this.config.get<number>('jwt.accessTtl') ?? 900;
    const refreshTtl = this.config.get<number>('jwt.refreshTtl') ?? 1209600;
    const jti = randomUUID();
    const family = familyId ?? randomUUID();

    const accessToken = await this.jwt.signAsync(
      { sub: user.id, email: user.email, type: 'access' },
      { secret: this.config.get<string>('jwt.accessSecret'), expiresIn: accessTtl },
    );
    // H-5: payload JWT KHÔNG đổi — `familyId` KHÔNG phải claim mới. Redis đã round-trip `userId`
    // qua giá trị `refresh:{jti}` từ trước (H-1); family chỉ là MỘT trường nữa trong CHÍNH giá trị
    // đó, đọc lại được ngay khi cần (script CONSUME_JTI_SCRIPT) mà không cần đổi định dạng token.
    const refreshToken = await this.jwt.signAsync(
      { sub: user.id, jti, type: 'refresh' },
      { secret: this.config.get<string>('jwt.refreshSecret'), expiresIn: refreshTtl },
    );

    // H-1/H-5: ghi khoá jti (nay mang kèm state+familyId), chỉ mục jti theo user, VÀ chỉ mục family
    // theo user — tất cả trong MỘT pipeline (một round-trip). `EXPIRE`/`SADD` đặt lại mỗi lần cấp
    // token nên cả hai chỉ mục tự tiêu sau `refreshTtl` kể từ hoạt động cuối — không cần job dọn dẹp.
    await this.redis
      .getClient()
      .multi()
      .set(`${REFRESH_PREFIX}${jti}`, `active:${user.id}:${family}`, 'EX', refreshTtl)
      .sadd(`${REFRESH_USER_PREFIX}${user.id}`, jti)
      .expire(`${REFRESH_USER_PREFIX}${user.id}`, refreshTtl)
      .sadd(`${REFRESH_USER_FAMILIES_PREFIX}${user.id}`, family)
      .expire(`${REFRESH_USER_FAMILIES_PREFIX}${user.id}`, refreshTtl)
      .exec();
    return { accessToken, refreshToken, expiresIn: accessTtl, userId: user.id };
  }

  /**
   * Xoay refresh token (H-5: + phát hiện tái dùng/thu hồi theo family).
   *
   * Tiêu thụ jti bằng MỘT lệnh Lua atomic (`CONSUME_JTI_SCRIPT` — xem chú thích ở khai báo) thay vì
   * GET rồi DEL riêng lẻ: hai `rotate()` gọi đồng thời với CÙNG một refresh token trước đây có thể
   * cùng vượt qua bước kiểm tra trước khi bên nào kịp DEL (đua thật) — Lua script loại bỏ khoảng hở
   * đó vì Redis chạy toàn bộ script như một đơn vị không thể chia cắt.
   */
  async rotate(refreshToken: string): Promise<IssuedTokens> {
    const payload = await this.verifyRefresh(refreshToken);
    const consumed = await this.consumeJti(payload.jti);

    if (consumed.status === 'invalid') {
      throw new RefreshTokenError(
        'Refresh token đã bị thu hồi hoặc không hợp lệ',
        'revoked',
        payload.sub,
      );
    }
    if (consumed.status === 'family_revoked') {
      // Family đã chết từ một lần phát hiện tái dùng TRƯỚC ĐÓ (hoặc logout-all) — KHÔNG kích hoạt
      // lại phản ứng H-1/audit reuse lần nữa (đã xảy ra đúng MỘT lần tại thời điểm phát hiện gốc).
      // Dọn dẹp CƠ HỘI (best-effort): jti này có thể vẫn đang "active" trong chỉ mục theo user (chưa
      // từng được tiêu thụ trước khi family bị thu hồi — vd descendant mới nhất chưa kịp dùng) — rút
      // nó ra ngay vì nó VĨNH VIỄN không dùng lại được nữa, thay vì chờ tự hết hạn theo TTL gốc.
      await this.redis.getClient().srem(`${REFRESH_USER_PREFIX}${consumed.userId}`, payload.jti);
      throw new RefreshTokenError(
        'Refresh token đã bị thu hồi hoặc không hợp lệ',
        'revoked',
        consumed.userId,
      );
    }
    if (consumed.status === 'reused') {
      // Family đã được script TỰ đánh dấu thu hồi (atomic, độc lập với mọi bước phía sau) — AuthService
      // sẽ thu hồi access token qua H-1 + ghi audit `auth.refresh.reuse_detected` dựa trên reason này.
      throw new RefreshTokenError(
        'Refresh token đã bị thu hồi hoặc không hợp lệ',
        'reused',
        consumed.userId,
        consumed.familyId,
      );
    }

    // consumed.status === 'ok'. So khớp userId đọc từ Redis (ghi tại thời điểm cấp) với `sub` đã
    // xác thực chữ ký — phòng thủ chiều sâu kế thừa từ kiểm tra `storedUserId !== payload.sub` cũ;
    // về lý thuyết không thể lệch (jti là randomUUID, không đụng độ) trừ khi khoá ký JWT đã lộ, lúc
    // đó jti NÀY đã bị tiêu thụ (an toàn hơn để active) nên không coi là mất mát thêm.
    if (consumed.userId !== payload.sub) {
      throw new RefreshTokenError('Refresh token không hợp lệ hoặc đã hết hạn', 'invalid_token', null);
    }

    // H-1: rút jti (nay đã consumed) khỏi chỉ mục ACTIVE theo user để chỉ mục không phình theo mỗi
    // lần xoay vòng — giữ NGUYÊN hành vi/ý nghĩa đã có, chỉ dời khỏi MULTI(DEL,SREM) cũ.
    await this.redis
      .getClient()
      .srem(`${REFRESH_USER_PREFIX}${consumed.userId}`, payload.jti);

    const user = await this.usersRepo.findById(consumed.userId);
    if (!user || !user.isActive) {
      throw new RefreshTokenError(
        'Người dùng không tồn tại hoặc bị vô hiệu hóa',
        'user_inactive',
        consumed.userId,
      );
    }
    return this.issueTokens(user, consumed.familyId);
  }

  /** Chạy `CONSUME_JTI_SCRIPT` — xem chú thích atomic ở khai báo script. */
  private async consumeJti(jti: string): Promise<ConsumeResult> {
    const refreshTtl = this.config.get<number>('jwt.refreshTtl') ?? 1209600;
    const raw = (await this.redis
      .getClient()
      .eval(
        CONSUME_JTI_SCRIPT,
        1,
        `${REFRESH_PREFIX}${jti}`,
        REFRESH_FAMILY_PREFIX,
        REFRESH_FAMILY_REVOKED_SUFFIX,
        String(refreshTtl),
      )) as [string, string?, string?];

    switch (raw[0]) {
      case 'invalid':
        return { status: 'invalid' };
      case 'family_revoked':
        return { status: 'family_revoked', userId: raw[1]!, familyId: raw[2]! };
      case 'reused':
        return { status: 'reused', userId: raw[1]!, familyId: raw[2]! };
      case 'ok':
        return { status: 'ok', userId: raw[1]!, familyId: raw[2]! };
      default:
        throw new Error(`CONSUME_JTI_SCRIPT: kết quả không nhận diện được: ${JSON.stringify(raw)}`);
    }
  }

  /** Thu hồi (logout) — idempotent: token sai vẫn coi như thành công. */
  async revoke(refreshToken: string): Promise<void> {
    try {
      const payload = await this.verifyRefresh(refreshToken);
      await this.redis
        .getClient()
        .multi()
        .del(`${REFRESH_PREFIX}${payload.jti}`)
        .srem(`${REFRESH_USER_PREFIX}${payload.sub}`, payload.jti)
        .exec();
    } catch {
      // bỏ qua — logout luôn thành công.
    }
  }

  /**
   * H-1 (logout-all): thu hồi MỌI refresh token của một user, dùng chỉ mục theo user.
   * H-5: THÊM thu hồi MỌI family của user đó (Phase 4 "LOGOUT-ALL: revoke all user refresh
   * families") — đặt khoá `refresh:family:{fam}:revoked` cho từng family trong chỉ mục
   * `REFRESH_USER_FAMILIES_PREFIX`, rồi xoá chỉ mục đó. Điều này đóng luôn một khe hở nhỏ: nếu
   * KHÔNG làm vậy, một jti "consumed" cũ (còn sống tới hết TTL gốc, không bị đụng bởi vòng DEL theo
   * chỉ mục active bên dưới) bị phát lại SAU logout-all vẫn sẽ đi vào nhánh 'reused' (kích hoạt lại
   * H-1/audit dù user đã tự logout-all sạch sẽ) thay vì 'family_revoked' gọn hơn.
   *
   * KHÔNG nuốt lỗi Redis (Owner "security-side-effect rule") — lỗi được ném ra cho caller
   * (`AuthService.logoutAll`) để người gọi biết việc thu hồi KHÔNG hoàn tất.
   *
   * Chỉ mục có thể chứa `jti` "mồ côi" (khoá `refresh:{jti}` đã tự hết hạn nhưng jti còn trong SET):
   * `DEL` trên khoá không tồn tại là no-op nên vô hại, và cả SET bị xoá ở bước cuối.
   *
   * @returns số `jti` ACTIVE có trong chỉ mục tại thời điểm thu hồi (kể cả mồ côi) — ý nghĩa KHÔNG
   * đổi so với trước H-5; số family bị thu hồi không được trả về (caller hiện không cần).
   */
  async revokeAllRefreshForUser(userId: string): Promise<number> {
    const client = this.redis.getClient();
    const indexKey = `${REFRESH_USER_PREFIX}${userId}`;
    const familiesKey = `${REFRESH_USER_FAMILIES_PREFIX}${userId}`;
    const refreshTtl = this.config.get<number>('jwt.refreshTtl') ?? 1209600;

    const [jtis, familyIds] = await Promise.all([client.smembers(indexKey), client.smembers(familiesKey)]);

    if (jtis.length === 0 && familyIds.length === 0) {
      await client.del(indexKey, familiesKey);
      return 0;
    }

    const multi = client.multi();
    if (jtis.length > 0) {
      multi.del(...jtis.map((jti) => `${REFRESH_PREFIX}${jti}`));
    }
    multi.del(indexKey);
    for (const fam of familyIds) {
      multi.set(`${REFRESH_FAMILY_PREFIX}${fam}${REFRESH_FAMILY_REVOKED_SUFFIX}`, '1', 'EX', refreshTtl);
    }
    multi.del(familiesKey);
    await multi.exec();
    return jtis.length;
  }

  private async verifyRefresh(token: string): Promise<{ sub: string; jti: string }> {
    try {
      const payload = await this.jwt.verifyAsync(token, {
        secret: this.config.get<string>('jwt.refreshSecret'),
      });
      if (payload.type !== 'refresh' || !payload.jti) {
        throw new Error('wrong token type');
      }
      return { sub: payload.sub, jti: payload.jti };
    } catch {
      throw new RefreshTokenError('Refresh token không hợp lệ hoặc đã hết hạn', 'invalid_token', null);
    }
  }
}
