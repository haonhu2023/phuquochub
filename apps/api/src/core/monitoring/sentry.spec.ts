import * as SentryNode from '@sentry/node';
import { initSentry } from './sentry';

jest.mock('@sentry/node', () => ({ init: jest.fn() }));

// `initSentry()` reads `process.env` INSIDE the function body (not at module load time), so a
// plain static import + mutating process.env per test is enough -- no jest.resetModules() needed.
describe('initSentry', () => {
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...ORIGINAL_ENV };
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  it('không gọi Sentry.init() khi SENTRY_DSN chưa đặt — an toàn triển khai trước khi có Sentry project', () => {
    delete process.env.SENTRY_DSN;

    initSentry();

    expect(SentryNode.init).not.toHaveBeenCalled();
  });

  it('không gọi Sentry.init() khi SENTRY_DSN chỉ toàn khoảng trắng', () => {
    process.env.SENTRY_DSN = '   ';

    initSentry();

    expect(SentryNode.init).not.toHaveBeenCalled();
  });

  it('gọi Sentry.init() với dsn/environment/release khi SENTRY_DSN có giá trị thật', () => {
    process.env.SENTRY_DSN = 'https://example@sentry.io/123';
    process.env.SENTRY_ENVIRONMENT = 'production';
    process.env.SENTRY_RELEASE = 'abc1234';

    initSentry();

    expect(SentryNode.init).toHaveBeenCalledWith(
      expect.objectContaining({
        dsn: 'https://example@sentry.io/123',
        environment: 'production',
        release: 'abc1234',
        tracesSampleRate: 0,
      }),
    );
  });

  it('environment mặc định theo NODE_ENV khi SENTRY_ENVIRONMENT chưa đặt', () => {
    process.env.SENTRY_DSN = 'https://example@sentry.io/123';
    delete process.env.SENTRY_ENVIRONMENT;
    process.env.NODE_ENV = 'test';

    initSentry();

    expect(SentryNode.init).toHaveBeenCalledWith(expect.objectContaining({ environment: 'test' }));
  });
});
