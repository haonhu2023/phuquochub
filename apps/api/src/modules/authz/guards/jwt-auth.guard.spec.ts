import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { JwtAuthGuard } from './jwt-auth.guard';
import { createMock, LooseMock } from '../../../../test/helpers/create-mock';

// H-1 — điểm cưỡng chế DUY NHẤT của cơ chế thu hồi. Test ở đây tập trung vào hai cam kết:
// (1) route `@Public()` KHÔNG chạm tới trạng thái thu hồi (kênh công khai không phụ thuộc Redis);
// (2) token có chữ ký hợp lệ nhưng đã bị thu hồi thì KHÔNG được gắn principal vào request.
describe('JwtAuthGuard (H-1 revocation)', () => {
  type Deps = ConstructorParameters<typeof JwtAuthGuard>;
  let jwt: LooseMock<Deps[0]>;
  let config: LooseMock<Deps[1]>;
  let reflector: LooseMock<Deps[2]>;
  let revocation: LooseMock<Deps[3]>;
  let guard: JwtAuthGuard;
  let request: { headers: Record<string, string>; user?: unknown };

  function ctx(): ExecutionContext {
    return {
      getHandler: () => () => undefined,
      getClass: () => class {},
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext;
  }

  beforeEach(() => {
    request = { headers: { authorization: 'Bearer token-abc' } };
    jwt = createMock<Deps[0]>({
      verifyAsync: jest.fn().mockResolvedValue({ sub: 'user-1', email: 'a@b.com', iat: 1_700_000_000 }),
    });
    config = createMock<Deps[1]>({ get: jest.fn().mockReturnValue('secret') });
    reflector = createMock<Deps[2]>({ getAllAndOverride: jest.fn().mockReturnValue(false) });
    revocation = createMock<Deps[3]>({ assertNotRevoked: jest.fn().mockResolvedValue(undefined) });
    guard = new JwtAuthGuard(jwt, config, reflector, revocation);
  });

  afterEach(() => jest.clearAllMocks());

  it('route @Public() -> KHÔNG verify token, KHÔNG kiểm tra thu hồi (không chạm Redis)', async () => {
    reflector.getAllAndOverride.mockReturnValue(true);

    await expect(guard.canActivate(ctx())).resolves.toBe(true);

    expect(jwt.verifyAsync).not.toHaveBeenCalled();
    expect(revocation.assertNotRevoked).not.toHaveBeenCalled();
  });

  it('thiếu header Authorization -> 401, KHÔNG kiểm tra thu hồi', async () => {
    request.headers = {};
    await expect(guard.canActivate(ctx())).rejects.toBeInstanceOf(UnauthorizedException);
    expect(revocation.assertNotRevoked).not.toHaveBeenCalled();
  });

  it('token hợp lệ + chưa thu hồi -> pass, gắn principal, truyền ĐÚNG sub + iat cho bước kiểm tra', async () => {
    await expect(guard.canActivate(ctx())).resolves.toBe(true);

    expect(revocation.assertNotRevoked).toHaveBeenCalledWith('user-1', 1_700_000_000);
    expect(request.user).toEqual({ sub: 'user-1', email: 'a@b.com' });
  });

  it('chữ ký hợp lệ nhưng ĐÃ THU HỒI -> 401 và KHÔNG gắn principal vào request', async () => {
    revocation.assertNotRevoked.mockRejectedValue(new UnauthorizedException('revoked'));

    await expect(guard.canActivate(ctx())).rejects.toBeInstanceOf(UnauthorizedException);
    // Điểm cốt lõi: request KHÔNG được mang principal, nên PermissionsGuard phía sau không thể
    // hiểu nhầm là đã xác thực.
    expect(request.user).toBeUndefined();
  });

  it('chữ ký KHÔNG hợp lệ -> 401 trước khi kiểm tra thu hồi (không tốn round-trip Redis)', async () => {
    jwt.verifyAsync.mockRejectedValue(new Error('invalid signature'));

    await expect(guard.canActivate(ctx())).rejects.toBeInstanceOf(UnauthorizedException);
    expect(revocation.assertNotRevoked).not.toHaveBeenCalled();
  });

  it('lỗi hạ tầng khi kiểm tra thu hồi (fail closed) nổi lên thành 401', async () => {
    revocation.assertNotRevoked.mockRejectedValue(
      new UnauthorizedException('Không xác minh được trạng thái phiên đăng nhập'),
    );
    await expect(guard.canActivate(ctx())).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
