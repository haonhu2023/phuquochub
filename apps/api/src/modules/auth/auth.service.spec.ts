import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';
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
  let service: AuthService;

  beforeEach(() => {
    usersRepo = createMock<Deps[0]>({
      existsByEmail: jest.fn(),
      create: jest.fn((d) => d),
      save: jest.fn((u) => Promise.resolve({ ...u, id: 'user-1' })),
      findByEmail: jest.fn(),
      findById: jest.fn(),
    });
    rolesRepo = createMock<Deps[1]>({ findByCode: jest.fn().mockResolvedValue({ id: 'role-member' }) });
    userRolesRepo = createMock<Deps[2]>({ assign: jest.fn() });
    tokenService = createMock<Deps[3]>({
      issueTokens: jest
        .fn()
        .mockResolvedValue({ accessToken: 'a', refreshToken: 'r', expiresIn: 900 }),
    });
    // H-1: mặc định thu hồi thành công; test logoutAll bên dưới kiểm cả đường lỗi.
    authRevocation = createMock<Deps[4]>({ revokeAllForUser: jest.fn().mockResolvedValue(1700000000) });
    service = new AuthService(usersRepo, rolesRepo, userRolesRepo, tokenService, authRevocation);
  });

  afterEach(() => jest.clearAllMocks());

  it('register: email trùng → ConflictException', async () => {
    usersRepo.existsByEmail.mockResolvedValue(true);
    await expect(
      service.register({ email: 'a@b.com', password: 'password1', display_name: 'A' }),
    ).rejects.toBeInstanceOf(ConflictException);
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
  });
});
