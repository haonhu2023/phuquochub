import { Controller, Get, INestApplication, LoggerService, Module, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { LoggingInterceptor } from '../src/common/interceptors/logging.interceptor';
import { TransformInterceptor } from '../src/common/interceptors/transform.interceptor';
import { correlationIdMiddleware, CORRELATION_ID_HEADER } from '../src/common/middleware/correlation-id.middleware';
import { Public } from '../src/modules/authz/decorators/public.decorator';

// PLACE-030 (Candidate D, logging sub-scope). CẦN Postgres + Redis đang chạy — bootstrap giống
// hệt main.ts để phản ánh đúng hành vi thực tế (middleware -> interceptor -> filter).
//
// ThrowingTestController CHỈ tồn tại trong file test này (không đăng ký ở app.module.ts thật,
// không có trong Docker image) — cách chuẩn, an toàn để chứng minh nhánh lỗi >=500 của
// AllExceptionsFilter mà không để lại route debug nào trong ứng dụng thật.
@Controller('test-observability')
class ThrowingTestController {
  @Public()
  @Get('boom')
  boom(): never {
    throw new Error('synthetic unexpected error for PLACE-030 verification');
  }
}

@Module({ controllers: [ThrowingTestController] })
class ThrowingTestModule {}

function makeMockLogger(): LoggerService & { log: jest.Mock; error: jest.Mock } {
  return {
    log: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    verbose: jest.fn(),
  };
}

describe('Observability — correlation ID + structured logging (e2e, PLACE-030)', () => {
  let app: INestApplication;
  let logger: LoggerService & { log: jest.Mock; error: jest.Mock };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule, ThrowingTestModule],
    }).compile();

    app = moduleRef.createNestApplication();
    logger = makeMockLogger();

    app.use(correlationIdMiddleware);
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.useGlobalInterceptors(new LoggingInterceptor(logger), new TransformInterceptor());
    app.useGlobalFilters(new AllExceptionsFilter(logger));
    await app.init();
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  beforeEach(() => jest.clearAllMocks());

  describe('Correlation ID lifecycle', () => {
    it('sinh một correlation ID mới khi request không kèm header', async () => {
      const res = await request(app.getHttpServer()).get('/api/health');
      const headerId = res.headers[CORRELATION_ID_HEADER.toLowerCase()];
      expect(typeof headerId).toBe('string');
      expect(headerId.length).toBeGreaterThan(0);
      expect(res.body.data ?? res.body.meta).toBeDefined();
      expect(res.body.meta.requestId).toBe(headerId);
    });

    it('lan truyền đúng correlation ID hợp lệ do client cung cấp', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/health')
        .set(CORRELATION_ID_HEADER, 'client-supplied-e2e-id');
      expect(res.headers[CORRELATION_ID_HEADER.toLowerCase()]).toBe('client-supplied-e2e-id');
      expect(res.body.meta.requestId).toBe('client-supplied-e2e-id');
    });

    it('log vòng đời request mang đúng correlation ID có trong response', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/health')
        .set(CORRELATION_ID_HEADER, 'corr-lifecycle-check');

      expect(res.headers[CORRELATION_ID_HEADER.toLowerCase()]).toBe('corr-lifecycle-check');
      expect(logger.log).toHaveBeenCalledWith(
        expect.objectContaining({ correlationId: 'corr-lifecycle-check', path: '/api/health' }),
      );
    });

    it('lỗi không mong đợi (500) log kèm ĐÚNG correlation ID có trong response body', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/test-observability/boom')
        .set(CORRELATION_ID_HEADER, 'corr-boom-check');

      expect(res.status).toBe(500);
      expect(res.body.meta.requestId).toBe('corr-boom-check');
      expect(res.headers[CORRELATION_ID_HEADER.toLowerCase()]).toBe('corr-boom-check');

      expect(logger.error).toHaveBeenCalledTimes(1);
      const [loggedObj] = logger.error.mock.calls[0];
      expect(loggedObj).toMatchObject({
        correlationId: 'corr-boom-check',
        method: 'GET',
        path: '/api/test-observability/boom',
        statusCode: 500,
        errorType: 'Error',
      });
    });
  });

  describe('Sensitive-data protection (real auth flow)', () => {
    const secretPassword = 'Corr3lationIdTestSecretPw!';
    const email = `place030-observability-${Date.now()}@example.test`;

    it('mật khẩu thật không xuất hiện trong bất kỳ lời gọi log nào khi đăng ký + đăng nhập', async () => {
      const registerRes = await request(app.getHttpServer())
        .post('/api/auth/register')
        .send({ email, password: secretPassword, display_name: 'Obs Test' });
      expect(registerRes.status).toBe(201);

      const loginRes = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email, password: secretPassword });
      expect(loginRes.status).toBe(200);

      const allCalls = [...logger.log.mock.calls, ...logger.error.mock.calls];
      const serialized = JSON.stringify(allCalls);
      expect(serialized).not.toContain(secretPassword);
      expect(serialized).not.toContain(loginRes.body.data.access_token);
      expect(serialized).not.toContain(loginRes.body.data.refresh_token);
    });

    it('lỗi đăng nhập sai mật khẩu (401) KHÔNG tạo log lỗi — tránh nhiễu cho lỗi nghiệp vụ', async () => {
      jest.clearAllMocks();
      const res = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: 'nonexistent-observability@example.test', password: 'wrong-password' });

      expect(res.status).toBe(401);
      expect(logger.error).not.toHaveBeenCalled();
      // Log vòng đời request (không phải error) vẫn được ghi bình thường. LoggingInterceptor
      // ghi 'ERR' cho nhánh throw (không biết status HTTP cuối do AllExceptionsFilter set sau) —
      // hành vi này CÓ TỪ TRƯỚC PLACE-030 (không phải thay đổi của task này), giữ nguyên ở đây.
      expect(logger.log).toHaveBeenCalledWith(
        expect.objectContaining({ path: '/api/auth/login', statusCode: 'ERR' }),
      );
    });
  });

  describe('Existing behavior preserved', () => {
    it('/api/health vẫn trả 200/503 với data.status như trước PLACE-030', async () => {
      const res = await request(app.getHttpServer()).get('/api/health');
      expect([200, 503]).toContain(res.status);
      expect(res.body.data).toHaveProperty('status');
    });

    it('đăng nhập sai vẫn 401 với thông điệp không đổi', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: 'nobody@example.test', password: 'x' });
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });
  });
});
