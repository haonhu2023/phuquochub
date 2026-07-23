import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { UsersRepository } from '../users/repositories/users.repository';
import { RolesRepository } from '../rbac/repositories/roles.repository';
import { UserRolesRepository } from '../rbac/repositories/user-roles.repository';
import { UserProvider } from '../users/user.enums';
import { User } from '../users/entities/user.entity';
import { TokenService, IssuedTokens } from './token.service';
import { LoginDto, RegisterDto } from './dto/auth.dto';

const BCRYPT_ROUNDS = 10;

// Response theo openapi.yaml (snake_case): AuthToken + PublicUser.
export interface PublicUserResponse {
  id: string;
  email: string;
  display_name: string;
  avatar_url: string | null;
}

export interface AuthResult {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  user: PublicUserResponse;
}

export interface TokenResult {
  access_token: string;
  refresh_token: string;
  expires_in: number;
}

// Logic nghiệp vụ Auth (WF-01/02). Đăng ký gán vai trò `member` qua user_roles (ADR-007).
@Injectable()
export class AuthService {
  constructor(
    private readonly usersRepo: UsersRepository,
    private readonly rolesRepo: RolesRepository,
    private readonly userRolesRepo: UserRolesRepository,
    private readonly tokenService: TokenService,
  ) {}

  async register(dto: RegisterDto): Promise<AuthResult> {
    if (await this.usersRepo.existsByEmail(dto.email)) {
      throw new ConflictException('Email đã được đăng ký');
    }
    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);
    const user = this.usersRepo.create({
      email: dto.email,
      passwordHash,
      displayName: dto.display_name,
      provider: UserProvider.LOCAL,
      // NOTE: WF-01 yêu cầu is_active=false tới khi xác minh email; luồng verify-email
      // (cần entity token — CHƯA phê duyệt, thuộc Wave) hoãn → tạm active để đăng nhập được.
      isActive: true,
    });
    const saved = await this.usersRepo.save(user);

    const memberRole = await this.rolesRepo.findByCode('member');
    if (memberRole) {
      await this.userRolesRepo.assign({ userId: saved.id, roleId: memberRole.id });
    }

    const tokens = await this.tokenService.issueTokens(saved);
    return { ...this.toTokenResult(tokens), user: this.toPublicUser(saved) };
  }

  async login(dto: LoginDto): Promise<AuthResult> {
    const user = await this.usersRepo.findByEmail(dto.email);
    if (!user || !user.passwordHash) {
      throw new UnauthorizedException('Email hoặc mật khẩu không đúng');
    }
    if (!user.isActive) {
      throw new UnauthorizedException('Tài khoản bị vô hiệu hóa');
    }
    const ok = await bcrypt.compare(dto.password, user.passwordHash);
    if (!ok) {
      throw new UnauthorizedException('Email hoặc mật khẩu không đúng');
    }
    const tokens = await this.tokenService.issueTokens(user);
    return { ...this.toTokenResult(tokens), user: this.toPublicUser(user) };
  }

  async refresh(refreshToken: string): Promise<TokenResult> {
    const tokens = await this.tokenService.rotate(refreshToken);
    return this.toTokenResult(tokens);
  }

  logout(refreshToken: string): Promise<void> {
    return this.tokenService.revoke(refreshToken);
  }

  private toTokenResult(tokens: IssuedTokens): TokenResult {
    return {
      access_token: tokens.accessToken,
      refresh_token: tokens.refreshToken,
      expires_in: tokens.expiresIn,
    };
  }

  private toPublicUser(user: User): PublicUserResponse {
    return {
      id: user.id,
      email: user.email,
      display_name: user.displayName,
      avatar_url: user.avatarUrl,
    };
  }
}
