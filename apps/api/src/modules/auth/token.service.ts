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

    await this.redis.getClient().set(`${REFRESH_PREFIX}${jti}`, user.id, 'EX', refreshTtl);
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
    await this.redis.getClient().del(key);

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
      await this.redis.getClient().del(`${REFRESH_PREFIX}${payload.jti}`);
    } catch {
      // bỏ qua — logout luôn thành công.
    }
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
