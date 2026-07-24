import { ArgumentsHost, BadRequestException, LoggerService, UnauthorizedException } from '@nestjs/common';
import { AllExceptionsFilter } from './all-exceptions.filter';
import type { RequestWithCorrelationId } from '../middleware/correlation-id.middleware';

function makeMockLogger(): LoggerService & { log: jest.Mock; error: jest.Mock } {
  return {
    log: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    verbose: jest.fn(),
  };
}

function makeHost(
  method: string,
  url: string,
  correlationId = 'corr-filter-1',
): { host: ArgumentsHost; json: jest.Mock; status: jest.Mock } {
  const json = jest.fn();
  const status = jest.fn().mockReturnValue({ json });
  const request: Partial<RequestWithCorrelationId> = { method, url, correlationId };
  const host = {
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => ({ status }),
    }),
  } as unknown as ArgumentsHost;
  return { host, json, status };
}

describe('AllExceptionsFilter', () => {
  it('lỗi không mong đợi (>=500) được log kèm correlationId, method, path, errorType, stack', () => {
    const logger = makeMockLogger();
    const filter = new AllExceptionsFilter(logger);
    const { host, status, json } = makeHost('GET', '/api/places', 'corr-500');
    const error = new Error('unexpected boom');

    filter.catch(error, host);

    expect(logger.error).toHaveBeenCalledTimes(1);
    const [loggedObj, trace] = logger.error.mock.calls[0];
    expect(loggedObj).toMatchObject({
      correlationId: 'corr-500',
      method: 'GET',
      path: '/api/places',
      statusCode: 500,
      errorType: 'Error',
      message: 'unexpected boom',
    });
    expect(trace).toBe(error.stack);
    expect(status).toHaveBeenCalledWith(500);
    expect(json.mock.calls[0][0].meta.requestId).toBe('corr-500');
  });

  it.each([
    ['400 (validation)', new BadRequestException('bad input')],
    ['401 (unauthorized)', new UnauthorizedException('nope')],
  ])('lỗi nghiệp vụ mong đợi (%s) KHÔNG được log — tránh nhiễu', (_label, exception) => {
    const logger = makeMockLogger();
    const filter = new AllExceptionsFilter(logger);
    const { host } = makeHost('POST', '/api/auth/login');

    filter.catch(exception, host);

    expect(logger.error).not.toHaveBeenCalled();
  });

  it('response body luôn mang meta.requestId khớp header/correlation ID của request', () => {
    const logger = makeMockLogger();
    const filter = new AllExceptionsFilter(logger);
    const { host, json } = makeHost('GET', '/api/health', 'corr-body-check');

    filter.catch(new BadRequestException('x'), host);

    expect(json.mock.calls[0][0].meta.requestId).toBe('corr-body-check');
  });

  it('không có đối số tường minh vẫn khởi tạo được (default AppLoggerService)', () => {
    expect(() => new AllExceptionsFilter()).not.toThrow();
  });
});
