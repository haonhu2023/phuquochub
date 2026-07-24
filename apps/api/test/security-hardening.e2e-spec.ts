import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { TransformInterceptor } from '../src/common/interceptors/transform.interceptor';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';

// PLACE-028 (OD2-12 rate limiting, OD2-13 CORS). CẦN Postgres + Redis đang chạy.
// Bootstrap giống hệt main.ts để phản ánh đúng hành vi thực tế của ứng dụng.
describe('Security hardening (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    const config = app.get(ConfigService);
    const allowedOrigins = config.get<string[]>('cors.allowedOrigins') ?? [];
    const corsCredentials = config.get<boolean>('cors.credentials') ?? false;

    app.setGlobalPrefix('api');
    app.enableCors({
      origin: allowedOrigins,
      credentials: corsCredentials,
      methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization'],
    });
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.useGlobalInterceptors(new TransformInterceptor());
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  describe('CORS (OD2-13)', () => {
    it('phản chiếu origin được cấu hình (dev default: http://localhost:3000)', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/health')
        .set('Origin', 'http://localhost:3000');
      expect(res.headers['access-control-allow-origin']).toBe('http://localhost:3000');
    });

    it('không phản chiếu origin không nằm trong allow-list', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/health')
        .set('Origin', 'https://evil.example.com');
      expect(res.headers['access-control-allow-origin']).not.toBe('https://evil.example.com');
    });

    it('không set Access-Control-Allow-Credentials khi CORS_CREDENTIALS mặc định false', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/health')
        .set('Origin', 'http://localhost:3000');
      expect(res.headers['access-control-allow-credentials']).toBeUndefined();
    });

    it('OPTIONS preflight cho POST + Authorization/Content-Type thành công', async () => {
      const res = await request(app.getHttpServer())
        .options('/api/auth/login')
        .set('Origin', 'http://localhost:3000')
        .set('Access-Control-Request-Method', 'POST')
        .set('Access-Control-Request-Headers', 'Content-Type,Authorization');
      expect([200, 204]).toContain(res.status);
      expect(res.headers['access-control-allow-methods']).toEqual(
        expect.stringContaining('POST'),
      );
    });

    it('request không có Origin header vẫn thành công (client không phải trình duyệt)', async () => {
      const res = await request(app.getHttpServer()).get('/api/health');
      expect([200, 503]).toContain(res.status);
    });
  });

  describe('Rate limiting (OD2-12)', () => {
    it(
      '/api/auth/login bị giới hạn nghiêm ngặt hơn mặc định (RATE_LIMIT_AUTH_LIMIT=10) → 429 sau khi vượt quá',
      async () => {
        const credentials = { email: 'nonexistent@phuquochub.test', password: 'wrong-password' };
        for (let i = 0; i < 10; i += 1) {
          const res = await request(app.getHttpServer()).post('/api/auth/login').send(credentials);
          expect(res.status).toBe(401);
        }
        const blocked = await request(app.getHttpServer()).post('/api/auth/login').send(credentials);
        expect(blocked.status).toBe(429);
      },
      15_000,
    );

    it(
      '/api/health không bao giờ bị giới hạn (@SkipThrottle)',
      async () => {
        for (let i = 0; i < 15; i += 1) {
          const res = await request(app.getHttpServer()).get('/api/health');
          expect(res.status).not.toBe(429);
        }
      },
      15_000,
    );
  });
});
