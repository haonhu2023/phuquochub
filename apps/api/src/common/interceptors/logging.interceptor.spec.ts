import { lastValueFrom, of, throwError } from 'rxjs';
import { CallHandler, ExecutionContext, Logger } from '@nestjs/common';
import { LoggingInterceptor } from './logging.interceptor';

function makeHttpContext(method: string, url: string, statusCode: number): ExecutionContext {
  return {
    getType: () => 'http',
    switchToHttp: () => ({
      getRequest: () => ({ method, url }),
      getResponse: () => ({ statusCode }),
    }),
  } as unknown as ExecutionContext;
}

function makeHandler<T>(value: T): CallHandler<T> {
  return { handle: () => of(value) };
}

describe('LoggingInterceptor', () => {
  const interceptor = new LoggingInterceptor();

  afterEach(() => jest.restoreAllMocks());

  it('ghi một dòng log với method, url và status khi thành công', async () => {
    const logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    const ctx = makeHttpContext('GET', '/api/health', 200);

    const result = await lastValueFrom(interceptor.intercept(ctx, makeHandler('ok')));

    expect(result).toBe('ok');
    expect(logSpy).toHaveBeenCalledTimes(1);
    expect(logSpy.mock.calls[0][0]).toMatch(/GET \/api\/health → 200 \(\d+ms\)/);
  });

  it('vẫn ghi log khi handler ném lỗi', async () => {
    const logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    const ctx = makeHttpContext('POST', '/api/auth/login', 401);
    const failing: CallHandler = { handle: () => throwError(() => new Error('boom')) };

    await expect(lastValueFrom(interceptor.intercept(ctx, failing))).rejects.toThrow('boom');
    expect(logSpy).toHaveBeenCalledTimes(1);
    expect(logSpy.mock.calls[0][0]).toContain('POST /api/auth/login → ERR');
  });

  it('bỏ qua context không phải HTTP (vd RPC) — không log', async () => {
    const logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    const ctx = { getType: () => 'rpc' } as unknown as ExecutionContext;

    await lastValueFrom(interceptor.intercept(ctx, makeHandler('x')));
    expect(logSpy).not.toHaveBeenCalled();
  });
});
