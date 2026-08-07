import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { RefreshTokenError } from './token.service';
import { AuditResult } from '../../core/audit/audit.enums';
import { createMock, LooseMock } from '../../../test/helpers/create-mock';

// Mock bcrypt để test không phụ thuộc native addon.
jest.mock('bcrypt', () => ({
  hash: jest.fn().mockResolvedValue('hashed-pw'),
  compare: jest.fn(),
}));
// eslint-disable-next-line @typescript-eslint/no-var-requires
const bcrypt = require('bcrypt');

describe('AuthService', () => {
  type Deps = ConstructorParameters<typeof AuthService>;
  let usersRepo: LooseMock<Deps[0]>;
  let rolesRepo: LooseMock<Deps[1]>;
  let userRolesRepo: LooseMock<Deps[2]>;
  let tokenService: LooseMock<Deps[3]>;
  let authRevocation: LooseMock<Deps[4]>;
  let audit: LooseMock<Deps[5]>;
  let service: AuthService;

  beforeEach(() => {
    usersRepo = createMock<Deps[0]>({
      existsByEmail: jest.fn(),
      create: jest.fn((d) => d),
      save: jest.fn((u) => Promise.resolve({ ...u, id: 'user-1', provider: 'local' })),
      findByEmail: jest.fn(),
      findById: jest.fn(),
    });
    rolesRepo = createMock<Deps[1]>({ findByCode: jest.fn().mockResolvedValue({ id: 'role-member' }) });
    userRolesRepo = createMock<Deps[2]>({ assign: jest.fn() });
    tokenService = createMock<Deps[3]>({
      issueTokens: jest
        .fn()
        .mockResolvedValue({ accessToken: 'a', refreshToken: 'r', expiresIn: 900, userId: 'user-1' }),
      rotate: jest.fn(),
      revoke: jest.fn().mockResolvedValue(undefined),
    });
    // H-1: mặc định thu hồi thành công; test logoutAll bên dưới kiểm cả đường lỗi.
    authRevocation = createMock<Deps[4]>({ revokeAllForUser: jest.fn().mockResolvedValue(1700000000) });
    // H-3: mặc định audit ghi thành công; các test riêng bên dưới kiểm đường lỗi (không nuốt/không
    // đổi response).
    audit = createMock<Deps[5]>({ record: jest.fn().mockResolvedValue(undefined) });
    service = new AuthService(usersRepo, rolesRepo, userRolesRepo, tokenService, authRevocation, audit);
  });

  afterEach(() => jest.clearAllMocks());

  it('register: email trùng → ConflictException', async () => {
    usersRepo.existsByEmail.mockResolvedValue(true);
    await expect(
      service.register({ email: 'a@b.com', password: 'password1', display_name: 'A' }),
    ).rejects.toBeInstanceOf(ConflictException);
    // Rule 4: chỉ ghi audit sau khi thao tác THÀNH CÔNG — email trùng không tạo user nào.
    expect(audit.record).not.toHaveBeenCalled();
  });

  it('register: thành công → gán vai trò member + trả token', async () => {
    usersRepo.existsByEmail.mockResolvedValue(false);
    const result = await service.register({
      email: 'a@b.com',
      password: 'password1',
      display_name: 'An',
    });
    expect(bcrypt.hash).toHaveBeenCalled();
    expect(userRolesRepo.assign).toHaveBeenCalledWith({ userId: 'user-1', roleId: 'role-member' });
    expect(result.access_token).toBe('a');
    expect(result.user.email).toBe('a@b.com');
  });

  // H-3 — event bắt buộc #1.
  it('register: thành công → ghi audit user.registered (entityId/actorId = user mới, provider trong context)', async () => {
    usersRepo.existsByEmail.mockResolvedValue(false);
    await service.register({ email: 'a@b.com', password: 'password1', display_name: 'An' });

    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'user.registered',
        entityType: 'user',
        entityId: 'user-1',
        actorId: 'user-1',
        result: AuditResult.SUCCESS,
        context: { provider: 'local' },
      }),
    );
  });

  it('login: sai mật khẩu → UnauthorizedException', async () => {
    usersRepo.findByEmail.mockResolvedValue({
      id: 'user-1',
      email: 'a@b.com',
      passwordHash: 'hashed-pw',
      isActive: true,
    });
    bcrypt.compare.mockResolvedValue(false);
    await expect(
      service.login({ email: 'a@b.com', password: 'wrong' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('login: tài khoản vô hiệu hóa → UnauthorizedException', async () => {
    usersRepo.findByEmail.mockResolvedValue({
      id: 'user-1',
      email: 'a@b.com',
      passwordHash: 'hashed-pw',
      isActive: false,
    });
    await expect(
      service.login({ email: 'a@b.com', password: 'x' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  // H-3 — event bắt buộc #2/#3, cùng rule 2 (privacy trên thất bại đăng nhập).
  describe('H-3 — audit đăng nhập', () => {
    it('login thành công → ghi audit auth.login.success (entityId/actorId = user, KHÔNG có mật khẩu trong context)', async () => {
      usersRepo.findByEmail.mockResolvedValue({
        id: 'user-1',
        email: 'a@b.com',
        passwordHash: 'hashed-pw',
        isActive: true,
      });
      bcrypt.compare.mockResolvedValue(true);

      await service.login({ email: 'a@b.com', password: 'password1' });

      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'auth.login.success',
          entityType: 'user',
          entityId: 'user-1',
          actorId: 'user-1',
          result: AuditResult.SUCCESS,
        }),
      );
      const call = audit.record.mock.calls[0][0];
      expect(JSON.stringify(call)).not.toContain('password1');
    });

    it('sai mật khẩu → auth.login.failure (reason=invalid_password, actorId=null, email đã chuẩn hoá)', async () => {
      usersRepo.findByEmail.mockResolvedValue({
        id: 'user-1',
        email: 'a@b.com',
        passwordHash: 'hashed-pw',
        isActive: true,
      });
      bcrypt.compare.mockResolvedValue(false);

      await expect(
        service.login({ email: '  A@B.com  ', password: 'wrong-pw' }),
      ).rejects.toBeInstanceOf(UnauthorizedException);

      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'auth.login.failure',
          entityType: 'user',
          entityId: 'user-1',
          actorId: null,
          result: AuditResult.FAILURE,
          context: { email: 'a@b.com', reason: 'invalid_password' },
        }),
      );
    });

    // Rule 2: "unknown email" PHẢI trả về ĐÚNG cùng response bên ngoài như "sai mật khẩu".
    it('email không tồn tại → CÙNG response 401 như sai mật khẩu, audit ghi reason=user_not_found, entityId=null', async () => {
      usersRepo.findByEmail.mockResolvedValue(null);

      let unknownEmailError: UnauthorizedException | undefined;
      try {
        await service.login({ email: 'khong-ton-tai@b.com', password: 'anything' });
      } catch (err) {
        unknownEmailError = err as UnauthorizedException;
      }

      usersRepo.findByEmail.mockResolvedValue({
        id: 'user-1',
        email: 'a@b.com',
        passwordHash: 'hashed-pw',
        isActive: true,
      });
      bcrypt.compare.mockResolvedValue(false);
      let badPasswordError: UnauthorizedException | undefined;
      try {
        await service.login({ email: 'a@b.com', password: 'wrong' });
      } catch (err) {
        badPasswordError = err as UnauthorizedException;
      }

      // Response bên ngoài (status + message) giống HỆT nhau — không rò rỉ email có tồn tại hay không.
      expect(unknownEmailError).toBeInstanceOf(UnauthorizedException);
      expect(unknownEmailError!.getStatus()).toBe(badPasswordError!.getStatus());
      expect(unknownEmailError!.getResponse()).toEqual(badPasswordError!.getResponse());

      // Nhưng audit (chỉ đọc được qua System.Audit.View) PHÂN BIỆT được lý do, cho điều tra viên.
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'auth.login.failure',
          entityType: 'user',
          entityId: null,
          actorId: null,
          result: AuditResult.FAILURE,
          context: { email: 'khong-ton-tai@b.com', reason: 'user_not_found' },
        }),
      );
    });

    it('tài khoản vô hiệu hoá → auth.login.failure (reason=account_inactive)', async () => {
      usersRepo.findByEmail.mockResolvedValue({
        id: 'user-1',
        email: 'a@b.com',
        passwordHash: 'hashed-pw',
        isActive: false,
      });

      await expect(
        service.login({ email: 'a@b.com', password: 'x' }),
      ).rejects.toBeInstanceOf(UnauthorizedException);

      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'auth.login.failure',
          context: expect.objectContaining({ reason: 'account_inactive' }),
        }),
      );
    });
  });

  // H-3 — event bắt buộc #4/#5.
  describe('H-3 — audit refresh', () => {
    it('refresh thành công → ghi audit auth.refresh.success (entityId/actorId = tokens.userId)', async () => {
      tokenService.rotate.mockResolvedValue({
        accessToken: 'new-a',
        refreshToken: 'new-r',
        expiresIn: 900,
        userId: 'user-1',
      });

      const result = await service.refresh('refresh-token');

      expect(result.access_token).toBe('new-a');
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'auth.refresh.success',
          entityType: 'user',
          entityId: 'user-1',
          actorId: 'user-1',
          result: AuditResult.SUCCESS,
        }),
      );
      const call = audit.record.mock.calls[0][0];
      expect(JSON.stringify(call)).not.toContain('refresh-token');
      expect(JSON.stringify(call)).not.toContain('new-r');
    });

    it('refresh thất bại (token đã thu hồi) → auth.refresh.failure (reason=revoked, actorId=userId), NÉM LẠI đúng lỗi gốc (không đổi status)', async () => {
      const original = new RefreshTokenError('Refresh token đã bị thu hồi hoặc không hợp lệ', 'revoked', 'user-1');
      tokenService.rotate.mockRejectedValue(original);

      await expect(service.refresh('bad-refresh')).rejects.toBe(original);

      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'auth.refresh.failure',
          entityType: 'user',
          entityId: 'user-1',
          actorId: 'user-1',
          result: AuditResult.FAILURE,
          context: { reason: 'revoked' },
        }),
      );
    });

    it('refresh thất bại (token hỏng, không xác định được user) → auth.refresh.failure (reason=invalid_token, entityId/actorId=null)', async () => {
      const original = new RefreshTokenError('Refresh token không hợp lệ hoặc đã hết hạn', 'invalid_token', null);
      tokenService.rotate.mockRejectedValue(original);

      await expect(service.refresh('garbage')).rejects.toBe(original);

      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'auth.refresh.failure',
          entityId: null,
          actorId: null,
          context: { reason: 'invalid_token' },
        }),
      );
    });

    it('refresh ném lỗi KHÔNG PHẢI RefreshTokenError → vẫn audit (reason=unknown_error) và ném lại nguyên vẹn', async () => {
      const original = new Error('kết nối Redis lỗi giữa chừng');
      tokenService.rotate.mockRejectedValue(original);

      await expect(service.refresh('t')).rejects.toBe(original);
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({ event: 'auth.refresh.failure', context: { reason: 'unknown_error' } }),
      );
    });
  });

  // H-3 — event bắt buộc #6.
  it('logout: ghi audit auth.logout (entityId/actorId = principal đã xác thực, KHÔNG phụ thuộc refresh_token gửi lên)', async () => {
    await service.logout('some-refresh-token', 'user-1');

    expect(tokenService.revoke).toHaveBeenCalledWith('some-refresh-token');
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'auth.logout',
        entityType: 'user',
        entityId: 'user-1',
        actorId: 'user-1',
        result: AuditResult.SUCCESS,
      }),
    );
  });

  // H-1 — logout-all: thu hồi CẢ refresh token lẫn access token của chính principal.
  describe('logoutAll', () => {
    beforeEach(() => {
      tokenService.revokeAllRefreshForUser = jest.fn().mockResolvedValue(3);
    });

    it('thu hồi refresh TRƯỚC, mốc access SAU — thứ tự an toàn khi lỗi giữa chừng', async () => {
      const order: string[] = [];
      tokenService.revokeAllRefreshForUser.mockImplementation(async () => {
        order.push('refresh');
        return 3;
      });
      authRevocation.revokeAllForUser.mockImplementation(async () => {
        order.push('access');
        return 1_700_000_000;
      });

      await service.logoutAll('user-1');

      // Nếu đảo thứ tự và bước 2 lỗi, refresh còn nguyên -> user vẫn đúc được access token MỚI,
      // tức logout-all thất bại ÂM THẦM. Thứ tự này khiến lỗi giữa chừng vẫn an toàn.
      expect(order).toEqual(['refresh', 'access']);
      expect(tokenService.revokeAllRefreshForUser).toHaveBeenCalledWith('user-1');
      expect(authRevocation.revokeAllForUser).toHaveBeenCalledWith('user-1');
    });

    it('lỗi thu hồi mốc access -> NÉM ra ngoài (không nuốt, không báo thành công giả)', async () => {
      authRevocation.revokeAllForUser.mockRejectedValue(new Error('redis down'));
      await expect(service.logoutAll('user-1')).rejects.toThrow('redis down');
      // Refresh vẫn đã bị xoá trước đó -> user không thể tự cấp lại access token mới.
      expect(tokenService.revokeAllRefreshForUser).toHaveBeenCalledWith('user-1');
    });

    it('lỗi xoá refresh -> NÉM ngay, KHÔNG đặt mốc access', async () => {
      tokenService.revokeAllRefreshForUser.mockRejectedValue(new Error('redis down'));
      await expect(service.logoutAll('user-1')).rejects.toThrow('redis down');
      expect(authRevocation.revokeAllForUser).not.toHaveBeenCalled();
    });

    // H-3 — event bắt buộc #7.
    it('cả hai bước thu hồi thành công → ghi audit auth.logout_all (entityId/actorId = user)', async () => {
      await service.logoutAll('user-1');

      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'auth.logout_all',
          entityType: 'user',
          entityId: 'user-1',
          actorId: 'user-1',
          result: AuditResult.SUCCESS,
        }),
      );
    });

    it('KHÔNG hoàn tất (một bước thu hồi lỗi) → KHÔNG ghi audit auth.logout_all (sẽ nói dối)', async () => {
      authRevocation.revokeAllForUser.mockRejectedValue(new Error('redis down'));
      await expect(service.logoutAll('user-1')).rejects.toThrow('redis down');
      expect(audit.record).not.toHaveBeenCalledWith(
        expect.objectContaining({ event: 'auth.logout_all' }),
      );
    });
  });

  // H-3 — rule 6 (post-commit convention) + rule 1 (không rò rỉ secret).
  describe('H-3 — audit không đổi hành vi response', () => {
    it('ghi audit LỖI KHÔNG làm hỏng một đăng nhập THÀNH CÔNG (rule 6: không hoàn tác, chỉ log)', async () => {
      usersRepo.findByEmail.mockResolvedValue({
        id: 'user-1',
        email: 'a@b.com',
        passwordHash: 'hashed-pw',
        isActive: true,
      });
      bcrypt.compare.mockResolvedValue(true);
      audit.record.mockRejectedValue(new Error('audit_logs INSERT thất bại'));
      const logSpy = jest.spyOn(service['logger'], 'error').mockImplementation(() => undefined);

      const result = await service.login({ email: 'a@b.com', password: 'password1' });

      expect(result.access_token).toBe('a');
      expect(logSpy).toHaveBeenCalled();
    });

    it('ghi audit LỖI KHÔNG thay thế 401 gốc của một đăng nhập THẤT BẠI bằng lỗi khác', async () => {
      usersRepo.findByEmail.mockResolvedValue({
        id: 'user-1',
        email: 'a@b.com',
        passwordHash: 'hashed-pw',
        isActive: true,
      });
      bcrypt.compare.mockResolvedValue(false);
      audit.record.mockRejectedValue(new Error('audit_logs INSERT thất bại'));
      const logSpy = jest.spyOn(service['logger'], 'error').mockImplementation(() => undefined);

      await expect(
        service.login({ email: 'a@b.com', password: 'wrong' }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      expect(logSpy).toHaveBeenCalled();
    });

    it('ghi audit LỖI KHÔNG làm hỏng refresh THÀNH CÔNG', async () => {
      tokenService.rotate.mockResolvedValue({
        accessToken: 'new-a',
        refreshToken: 'new-r',
        expiresIn: 900,
        userId: 'user-1',
      });
      audit.record.mockRejectedValue(new Error('audit_logs INSERT thất bại'));

      const result = await service.refresh('t');
      expect(result.access_token).toBe('new-a');
    });

    it('ghi audit LỖI KHÔNG thay thế 401 gốc của một refresh THẤT BẠI', async () => {
      const original = new RefreshTokenError('hết hạn', 'invalid_token', null);
      tokenService.rotate.mockRejectedValue(original);
      audit.record.mockRejectedValue(new Error('audit_logs INSERT thất bại'));

      await expect(service.refresh('t')).rejects.toBe(original);
    });

    it('mật khẩu THẬT KHÔNG BAO GIỜ xuất hiện trong bất kỳ lời gọi audit.record nào (register/login)', async () => {
      usersRepo.existsByEmail.mockResolvedValue(false);
      await service.register({ email: 'a@b.com', password: 'super-secret-pw', display_name: 'A' });

      usersRepo.findByEmail.mockResolvedValue({
        id: 'user-1',
        email: 'a@b.com',
        passwordHash: 'hashed-pw',
        isActive: true,
      });
      bcrypt.compare.mockResolvedValue(true);
      await service.login({ email: 'a@b.com', password: 'super-secret-pw' });

      for (const call of audit.record.mock.calls) {
        expect(JSON.stringify(call[0])).not.toContain('super-secret-pw');
        expect(JSON.stringify(call[0])).not.toContain('hashed-pw');
      }
    });
  });
});
