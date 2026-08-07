import { ConflictException, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { UsersRepository } from '../users/repositories/users.repository';
import { RolesRepository } from '../rbac/repositories/roles.repository';
import { UserRolesRepository } from '../rbac/repositories/user-roles.repository';
import { AuthRevocationService } from '../../core/auth-revocation/auth-revocation.service';
import { AuditService, AuditEvent } from '../../core/audit/audit.service';
import { AuditResult } from '../../core/audit/audit.enums';
import { UserProvider } from '../users/user.enums';
import { User } from '../users/entities/user.entity';
import { TokenService, IssuedTokens, RefreshTokenError } from './token.service';
import { LoginDto, RegisterDto } from './dto/auth.dto';

const BCRYPT_ROUNDS = 10;

/** Lý do một lần đăng nhập THẤT BẠI — chỉ dùng cho ngữ cảnh audit, không đổi response bên ngoài. */
type LoginFailureReason = 'user_not_found' | 'account_inactive' | 'invalid_password';

/**
 * H-3 (Authentication Audit Events, 2026-08-07): chuẩn hoá email CHỈ để ghi audit — trim +
 * lowercase. KHÔNG đổi logic so khớp đăng nhập nào (`usersRepo.findByEmail` vẫn nhận `dto.email`
 * nguyên bản, rule 3 "Auth response behavior must remain unchanged"). Không phải mã hoá/hash — chỉ
 * là "email đã chuẩn hoá" đúng nghĩa đen theo yêu cầu; `AuditService` hiện KHÔNG có biến đổi
 * "privacy-safe identifier" nào khác để dùng.
 */
function normalizeEmailForAudit(email: string): string {
  return email.trim().toLowerCase();
}

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
//
// H-3 (Authentication Audit Events, 2026-08-07): đóng finding H-3 — trước milestone này, Auth
// KHÔNG ghi audit event nào dù ADR-016 §Context nêu thẳng `user.registered`/`auth.login.success`
// làm ví dụ MỞ ĐẦU cho lý do bảng `audit_logs` tồn tại. 7 event: `user.registered`,
// `auth.login.success`/`.failure`, `auth.refresh.success`/`.failure`, `auth.logout`,
// `auth.logout_all`. Mọi audit đi qua `emitAudit()` — bọc try/catch, log lỗi, KHÔNG BAO GIỜ ném ra
// ngoài (cùng quy ước "post-commit" đã dùng ở `ModerationService.emitPostCommit`/`ReviewsService`):
// một lỗi ghi audit KHÔNG được phép biến một đăng nhập/đăng ký HỢP LỆ thành lỗi, cũng KHÔNG được
// phép biến một 401 THẬT thành 500. Sự kiện THẤT BẠI (login/refresh) được ghi TRƯỚC khi throw lại
// nguyên vẹn exception gốc — mã HTTP/response bên ngoài không đổi.
@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly usersRepo: UsersRepository,
    private readonly rolesRepo: RolesRepository,
    private readonly userRolesRepo: UserRolesRepository,
    private readonly tokenService: TokenService,
    private readonly authRevocation: AuthRevocationService,
    private readonly audit: AuditService,
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
    const result = { ...this.toTokenResult(tokens), user: this.toPublicUser(saved) };

    // Ghi audit SAU KHI toàn bộ thao tác (user + role + token) đã thành công (rule 4).
    await this.emitAudit({
      event: 'user.registered',
      entityType: 'user',
      entityId: saved.id,
      actorId: saved.id,
      result: AuditResult.SUCCESS,
      context: { provider: saved.provider },
    });

    return result;
  }

  async login(dto: LoginDto): Promise<AuthResult> {
    const user = await this.usersRepo.findByEmail(dto.email);
    if (!user || !user.passwordHash) {
      await this.auditLoginFailure(dto.email, user?.id ?? null, 'user_not_found');
      throw new UnauthorizedException('Email hoặc mật khẩu không đúng');
    }
    if (!user.isActive) {
      await this.auditLoginFailure(dto.email, user.id, 'account_inactive');
      throw new UnauthorizedException('Tài khoản bị vô hiệu hóa');
    }
    const ok = await bcrypt.compare(dto.password, user.passwordHash);
    if (!ok) {
      await this.auditLoginFailure(dto.email, user.id, 'invalid_password');
      throw new UnauthorizedException('Email hoặc mật khẩu không đúng');
    }
    const tokens = await this.tokenService.issueTokens(user);
    const result = { ...this.toTokenResult(tokens), user: this.toPublicUser(user) };

    await this.emitAudit({
      event: 'auth.login.success',
      entityType: 'user',
      entityId: user.id,
      actorId: user.id,
      result: AuditResult.SUCCESS,
    });

    return result;
  }

  async refresh(refreshToken: string): Promise<TokenResult> {
    let tokens: IssuedTokens;
    try {
      tokens = await this.tokenService.rotate(refreshToken);
    } catch (err) {
      // Rule 5: ghi audit TRƯỚC, rồi ném LẠI NGUYÊN VẸN exception gốc — KHÔNG đổi status/response.
      await this.emitAudit({
        event: 'auth.refresh.failure',
        entityType: 'user',
        entityId: err instanceof RefreshTokenError ? err.userId : null,
        actorId: err instanceof RefreshTokenError ? err.userId : null,
        result: AuditResult.FAILURE,
        context: { reason: err instanceof RefreshTokenError ? err.reason : 'unknown_error' },
      });
      throw err;
    }

    const result = this.toTokenResult(tokens);
    await this.emitAudit({
      event: 'auth.refresh.success',
      entityType: 'user',
      entityId: tokens.userId,
      actorId: tokens.userId,
      result: AuditResult.SUCCESS,
    });
    return result;
  }

  async logout(refreshToken: string, actorId: string): Promise<void> {
    await this.tokenService.revoke(refreshToken);
    await this.emitAudit({
      event: 'auth.logout',
      entityType: 'user',
      entityId: actorId,
      actorId,
      result: AuditResult.SUCCESS,
    });
  }

  /**
   * H-1 — POST /auth/logout-all. Đăng xuất khỏi MỌI thiết bị của chính principal.
   *
   * THỨ TỰ CÓ CHỦ ĐÍCH: xoá refresh token TRƯỚC, đặt mốc thu hồi access token SAU.
   *  - Nếu bước 2 lỗi: refresh đã bị xoá nên user KHÔNG thể tự cấp lại access token mới; các access
   *    token cũ còn sống tới hết TTL (đúng hành vi trước khi có H-1) và lỗi được NÉM ra cho caller.
   *  - Nếu làm ngược lại (mốc trước, refresh sau) và bước 2 lỗi: access token bị chặn nhưng refresh
   *    còn nguyên -> user vẫn đúc được access token MỚI hợp lệ, tức "logout-all" thất bại âm thầm.
   * Vì vậy thứ tự này là hướng an toàn hơn khi có lỗi giữa chừng.
   *
   * KHÔNG nuốt lỗi (Owner "security-side-effect rule") — cả hai bước đều để lỗi Redis nổi lên.
   * H-3: audit CHỈ ghi SAU KHI cả hai bước thu hồi thành công — nếu một bước ném lỗi, hàm này
   * cũng ném theo và KHÔNG ghi audit `auth.logout_all` nào (đúng: logout-all thật sự CHƯA hoàn
   * tất, ghi audit "thành công" lúc đó sẽ nói dối).
   */
  async logoutAll(userId: string): Promise<void> {
    await this.tokenService.revokeAllRefreshForUser(userId);
    await this.authRevocation.revokeAllForUser(userId);
    await this.emitAudit({
      event: 'auth.logout_all',
      entityType: 'user',
      entityId: userId,
      actorId: userId,
      result: AuditResult.SUCCESS,
    });
  }

  private async auditLoginFailure(
    rawEmail: string,
    userId: string | null,
    reason: LoginFailureReason,
  ): Promise<void> {
    await this.emitAudit({
      event: 'auth.login.failure',
      entityType: 'user',
      entityId: userId,
      actorId: null,
      result: AuditResult.FAILURE,
      // Rule 2 (Owner): "unknown email" và "sai mật khẩu" PHẢI trả về ĐÚNG cùng response bên
      // ngoài — đã đúng từ trước khi có milestone này (cùng UnauthorizedException + cùng message
      // cho cả hai nhánh). Ở TẦNG AUDIT (chỉ đọc qua `System.Audit.View`, KHÔNG phải bề mặt tấn
      // công) ghi `reason` để điều tra viên phân biệt được, và `email` đã CHUẨN HOÁ — không đổi
      // gì tới response API.
      context: { email: normalizeEmailForAudit(rawEmail), reason },
    });
  }

  /**
   * MỌI audit của AuthService đi qua đây — bọc try/catch, log lỗi, KHÔNG BAO GIỜ ném ra ngoài.
   * Xem chú thích đầu class.
   */
  private async emitAudit(event: AuditEvent): Promise<void> {
    try {
      await this.audit.record(event);
    } catch (err) {
      this.logger.error(
        `Ghi audit '${event.event}' thất bại: ${(err as Error).message}`,
        (err as Error).stack,
      );
    }
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
