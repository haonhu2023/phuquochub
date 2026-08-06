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
}

const REFRESH_PREFIX = 'refresh:';
// H-1: chỉ mục refresh token THEO USER (Redis SET các `jti`) — cần cho logout-all ("revoke all
// refresh tokens belonging to that user"). Trước đây Redis chỉ có `refresh:{jti} -> userId`, tức
// KHÔNG có đường nào liệt kê mọi jti của một user để xoá hết. Đây là chỉ mục THUẦN BỔ TRỢ: ngữ nghĩa
// xoay vòng refresh (rotate) KHÔNG đổi một byte — vẫn single-use, vẫn kiểm `jti` trong Redis, vẫn
// kiểm `isActive`. KHÔNG phải family/lineage tracking (đó là H-5, ngoài phạm vi milestone này).
const REFRESH_USER_PREFIX = 'refresh:user:';

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

  async issueTokens(user: User): Promise<IssuedTokens> {
    const accessTtl = this.config.get<number>('jwt.accessTtl') ?? 900;
    const refreshTtl = this.config.get<number>('jwt.refreshTtl') ?? 1209600;
    const jti = randomUUID();

    const accessToken = await this.jwt.signAsync(
      { sub: user.id, email: user.email, type: 'access' },
      { secret: this.config.get<string>('jwt.accessSecret'), expiresIn: accessTtl },
    );
    const refreshToken = await this.jwt.signAsync(
      { sub: user.id, jti, type: 'refresh' },
      { secret: this.config.get<string>('jwt.refreshSecret'), expiresIn: refreshTtl },
    );

    // H-1: ghi CẢ khoá jti gốc VÀ chỉ mục theo user, trong MỘT pipeline (một vòng round-trip, và
    // hai lệnh không bị xen giữa bởi lệnh khác của cùng connection). `EXPIRE` đặt lại mỗi lần cấp
    // token nên chỉ mục tự tiêu sau `refreshTtl` kể từ hoạt động cuối — không cần job dọn dẹp.
    await this.redis
      .getClient()
      .multi()
      .set(`${REFRESH_PREFIX}${jti}`, user.id, 'EX', refreshTtl)
      .sadd(`${REFRESH_USER_PREFIX}${user.id}`, jti)
      .expire(`${REFRESH_USER_PREFIX}${user.id}`, refreshTtl)
      .exec();
    return { accessToken, refreshToken, expiresIn: accessTtl };
  }

  /** Xoay refresh token: xác thực + kiểm tra jti còn trong Redis, rồi phát bộ mới. */
  async rotate(refreshToken: string): Promise<IssuedTokens> {
    const payload = await this.verifyRefresh(refreshToken);
    const key = `${REFRESH_PREFIX}${payload.jti}`;
    const storedUserId = await this.redis.getClient().get(key);
    if (!storedUserId || storedUserId !== payload.sub) {
      throw new UnauthorizedException('Refresh token đã bị thu hồi hoặc không hợp lệ');
    }
    // H-1: xoá jti cũ + rút nó khỏi chỉ mục theo user. Ngữ nghĩa single-use KHÔNG đổi — chỉ thêm
    // bước dọn chỉ mục để nó không phình theo mỗi lần xoay vòng.
    await this.redis
      .getClient()
      .multi()
      .del(key)
      .srem(`${REFRESH_USER_PREFIX}${payload.sub}`, payload.jti)
      .exec();

    const user = await this.usersRepo.findById(payload.sub);
    if (!user || !user.isActive) {
      throw new UnauthorizedException('Người dùng không tồn tại hoặc bị vô hiệu hóa');
    }
    return this.issueTokens(user);
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
   *
   * KHÔNG nuốt lỗi Redis (Owner "security-side-effect rule") — lỗi được ném ra cho caller
   * (`AuthService.logoutAll`) để người gọi biết việc thu hồi KHÔNG hoàn tất.
   *
   * Chỉ mục có thể chứa `jti` "mồ côi" (khoá `refresh:{jti}` đã tự hết hạn nhưng jti còn trong SET):
   * `DEL` trên khoá không tồn tại là no-op nên vô hại, và cả SET bị xoá ở bước cuối.
   *
   * @returns số `jti` có trong chỉ mục tại thời điểm thu hồi (kể cả mồ côi).
   */
  async revokeAllRefreshForUser(userId: string): Promise<number> {
    const client = this.redis.getClient();
    const indexKey = `${REFRESH_USER_PREFIX}${userId}`;
    const jtis = await client.smembers(indexKey);
    if (jtis.length === 0) {
      await client.del(indexKey);
      return 0;
    }
    await client
      .multi()
      .del(...jtis.map((jti) => `${REFRESH_PREFIX}${jti}`))
      .del(indexKey)
      .exec();
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
      throw new UnauthorizedException('Refresh token không hợp lệ hoặc đã hết hạn');
    }
  }
}
