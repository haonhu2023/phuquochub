import { lastValueFrom, of, throwError } from 'rxjs';
import { CallHandler, ExecutionContext, LoggerService } from '@nestjs/common';
import { LoggingInterceptor } from './logging.interceptor';
import type { RequestWithCorrelationId } from '../middleware/correlation-id.middleware';

function makeHttpContext(
  method: string,
  url: string,
  statusCode: number,
  correlationId = 'corr-test-1',
): ExecutionContext {
  return {
    getType: () => 'http',
    switchToHttp: () => ({
      getRequest: () => ({ method, url, correlationId }) as RequestWithCorrelationId,
      getResponse: () => ({ statusCode }),
    }),
  } as unknown as ExecutionContext;
}

function makeHandler<T>(value: T): CallHandler<T> {
  return { handle: () => of(value) };
}

function makeMockLogger(): LoggerService & { log: jest.Mock } {
  return {
    log: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    verbose: jest.fn(),
  };
}

describe('LoggingInterceptor', () => {
  afterEach(() => jest.restoreAllMocks());

  it('ghi một log có cấu trúc (correlationId, method, path, status, duration) khi thành công', async () => {
    const logger = makeMockLogger();
    const interceptor = new LoggingInterceptor(logger);
    const ctx = makeHttpContext('GET', '/api/health', 200, 'corr-abc');

    const result = await lastValueFrom(interceptor.intercept(ctx, makeHandler('ok')));

    expect(result).toBe('ok');
    expect(logger.log).toHaveBeenCalledTimes(1);
    const logged = logger.log.mock.calls[0][0];
    expect(logged).toMatchObject({
      correlationId: 'corr-abc',
      method: 'GET',
      path: '/api/health',
      statusCode: 200,
    });
    expect(typeof logged.durationMs).toBe('number');
  });

  it('vẫn ghi log khi handler ném lỗi, cùng correlationId', async () => {
    const logger = makeMockLogger();
    const interceptor = new LoggingInterceptor(logger);
    const ctx = makeHttpContext('POST', '/api/auth/login', 401, 'corr-err');
    const failing: CallHandler = { handle: () => throwError(() => new Error('boom')) };

    await expect(lastValueFrom(interceptor.intercept(ctx, failing))).rejects.toThrow('boom');
    expect(logger.log).toHaveBeenCalledTimes(1);
    const logged = logger.log.mock.calls[0][0];
    expect(logged).toMatchObject({
      correlationId: 'corr-err',
      method: 'POST',
      path: '/api/auth/login',
      statusCode: 'ERR',
    });
  });

  it('bỏ qua context không phải HTTP (vd RPC) — không log', async () => {
    const logger = makeMockLogger();
    const interceptor = new LoggingInterceptor(logger);
    const ctx = { getType: () => 'rpc' } as unknown as ExecutionContext;

    await lastValueFrom(interceptor.intercept(ctx, makeHandler('x')));
    expect(logger.log).not.toHaveBeenCalled();
  });

  it('ghi đúng một dòng log cho mỗi request — không log trùng lặp', async () => {
    const logger = makeMockLogger();
    const interceptor = new LoggingInterceptor(logger);
    const ctx = makeHttpContext('GET', '/api/places', 200);

    await lastValueFrom(interceptor.intercept(ctx, makeHandler([1, 2, 3])));
    expect(logger.log).toHaveBeenCalledTimes(1);
  });

  it('không có đối số tường minh vẫn khởi tạo được (default AppLoggerService)', () => {
    expect(() => new LoggingInterceptor()).not.toThrow();
  });
});
