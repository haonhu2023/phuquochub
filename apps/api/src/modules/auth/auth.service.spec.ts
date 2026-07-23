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
    service = new AuthService(usersRepo, rolesRepo, userRolesRepo, tokenService);
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
});
