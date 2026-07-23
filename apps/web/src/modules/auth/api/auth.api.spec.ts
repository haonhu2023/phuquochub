import { AuthApiError, login, logout, refresh, register } from './auth.api';

// Mock fetch toàn cục để test bóc envelope + map snake_case→camelCase (env=node).
const realFetch = global.fetch;

function mockFetchOnce(status: number, body: unknown) {
  global.fetch = jest.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  }) as unknown as typeof fetch;
}

const AUTH_RESULT = {
  access_token: 'acc',
  refresh_token: 'ref',
  expires_in: 900,
  user: { id: 'u1', email: 'a@b.c', display_name: 'Người Dùng', avatar_url: null },
};

afterEach(() => {
  global.fetch = realFetch;
  jest.restoreAllMocks();
});

describe('auth.api login/register', () => {
  it('login map đúng camelCase và tính expiresAt', async () => {
    const before = Date.now();
    mockFetchOnce(200, { success: true, data: AUTH_RESULT, meta: {} });
    const session = await login({ email: 'a@b.c', password: 'secret12' });

    expect(session.accessToken).toBe('acc');
    expect(session.refreshToken).toBe('ref');
    expect(session.user).toEqual({
      id: 'u1',
      email: 'a@b.c',
      displayName: 'Người Dùng',
      avatarUrl: null,
    });
    expect(session.expiresAt).toBeGreaterThanOrEqual(before + 900 * 1000);
  });

  it('register gửi displayName và trả phiên', async () => {
    mockFetchOnce(201, { success: true, data: AUTH_RESULT, meta: {} });
    const session = await register({ email: 'a@b.c', password: 'secret12', displayName: 'X' });
    expect(session.user.displayName).toBe('Người Dùng');

    const [, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect(JSON.parse(init.body)).toEqual({ email: 'a@b.c', password: 'secret12', display_name: 'X' });
  });
});

describe('auth.api lỗi', () => {
  it('ném AuthApiError với code từ envelope lỗi', async () => {
    mockFetchOnce(401, {
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'Email hoặc mật khẩu không đúng' },
      meta: {},
    });
    await expect(login({ email: 'a@b.c', password: 'x' })).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
      httpStatus: 401,
    });
  });

  it('ném NETWORK_ERROR khi fetch reject', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('offline')) as unknown as typeof fetch;
    await expect(login({ email: 'a@b.c', password: 'x' })).rejects.toBeInstanceOf(AuthApiError);
    await expect(login({ email: 'a@b.c', password: 'x' })).rejects.toMatchObject({
      code: 'NETWORK_ERROR',
    });
  });
});

describe('auth.api refresh/logout', () => {
  it('refresh trả token mới (không kèm user)', async () => {
    mockFetchOnce(200, {
      success: true,
      data: { access_token: 'a2', refresh_token: 'r2', expires_in: 900 },
      meta: {},
    });
    const tokens = await refresh('ref');
    expect(tokens.accessToken).toBe('a2');
    expect(tokens.refreshToken).toBe('r2');
  });

  it('logout gắn Authorization Bearer access token', async () => {
    mockFetchOnce(200, { success: true, data: null, meta: {} });
    await logout('ref', 'acc');
    const [, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect(init.headers.Authorization).toBe('Bearer acc');
  });
});
