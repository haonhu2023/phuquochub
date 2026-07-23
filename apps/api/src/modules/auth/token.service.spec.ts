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
  let client: { set: jest.Mock; get: jest.Mock; del: jest.Mock };
  let usersRepo: LooseMock<Deps[3]>;
  let service: TokenService;

  beforeEach(() => {
    jwt = createMock<Deps[0]>({ signAsync: jest.fn(), verifyAsync: jest.fn() });
    const cfg: Record<string, unknown> = {
      'jwt.accessTtl': 900,
      'jwt.refreshTtl': 1209600,
      'jwt.accessSecret': 'acc-secret',
      'jwt.refreshSecret': 'ref-secret',
    };
    config = createMock<Deps[1]>({ get: jest.fn((k: string) => cfg[k]) });
    client = { set: jest.fn(), get: jest.fn(), del: jest.fn() };
    redis = createMock<Deps[2]>({ getClient: jest.fn(() => client) });
    usersRepo = createMock<Deps[3]>({ findById: jest.fn() });
    service = new TokenService(jwt, config, redis, usersRepo);
  });

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
    expect(client.set).toHaveBeenCalledWith(
      expect.stringMatching(/^refresh:/),
      'user-1',
      'EX',
      1209600,
    );
  });

  it('rotate: jti hợp lệ + user active → xóa jti cũ, phát bộ mới', async () => {
    jwt.verifyAsync.mockResolvedValue({ sub: 'user-1', jti: 'jti-1', type: 'refresh' });
    client.get.mockResolvedValue('user-1');
    usersRepo.findById.mockResolvedValue({ id: 'user-1', isActive: true });
    jwt.signAsync.mockResolvedValueOnce('new-access').mockResolvedValueOnce('new-refresh');

    const result = await service.rotate('refresh-token');

    expect(client.del).toHaveBeenCalledWith('refresh:jti-1');
    expect(result.accessToken).toBe('new-access');
  });

  it('rotate: jti không còn trong Redis (đã thu hồi) → Unauthorized, không xoay', async () => {
    jwt.verifyAsync.mockResolvedValue({ sub: 'user-1', jti: 'jti-1', type: 'refresh' });
    client.get.mockResolvedValue(null);

    await expect(service.rotate('t')).rejects.toBeInstanceOf(UnauthorizedException);
    expect(client.del).not.toHaveBeenCalled();
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
    expect(client.del).toHaveBeenCalledWith('refresh:jti-9');
  });

  it('revoke: token hỏng → nuốt lỗi (idempotent), không ném', async () => {
    jwt.verifyAsync.mockRejectedValue(new Error('bad token'));
    await expect(service.revoke('t')).resolves.toBeUndefined();
    expect(client.del).not.toHaveBeenCalled();
  });
});
