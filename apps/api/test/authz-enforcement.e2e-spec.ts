import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { TransformInterceptor } from '../src/common/interceptors/transform.interceptor';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';

// Đóng Sprint 1 DoD còn thiếu: (1) cưỡng chế permission → 403 khi thiếu quyền
// (deny-by-default, rbac.md §2), (2) refresh token thu hồi được (rotation single-use
// + logout revoke, auth.md §1.2/1.4). e2e đăng nhập đã có ở auth.e2e-spec.ts.
//
// CẦN Postgres + Redis + migration đã chạy (gồm SeedRbac: vai trò `member`).
// docker compose up -d postgres redis && npm run migration:run --workspace @phuquochub/api
describe('AuthZ enforcement & token revocation (e2e)', () => {
  let app: INestApplication;
  const password = 'password123';

  // Đăng ký một user mới (được gán `member`) → trả bộ token của phiên đó.
  async function registerMember(): Promise<{ accessToken: string; refreshToken: string }> {
    const email = `e2e_authz_${Date.now()}_${Math.random().toString(36).slice(2)}@phuquochub.test`;
    const res = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ email, password, display_name: 'AuthZ E2E' });
    expect(res.status).toBe(201);
    return { accessToken: res.body.data.access_token, refreshToken: res.body.data.refresh_token };
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    // Mirror cấu hình runtime của main.ts để test sát production.
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }),
    );
    app.useGlobalInterceptors(new TransformInterceptor());
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  describe('Permission enforcement (deny-by-default)', () => {
    it('member KHÔNG có Category.Manage → POST /api/categories = 403', async () => {
      const { accessToken } = await registerMember();
      // Guard chạy trước ValidationPipe → 403 xảy ra bất kể body (không cần body hợp lệ).
      const res = await request(app.getHttpServer())
        .post('/api/categories')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({});
      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('không token → POST /api/categories = 401 (AuthN chặn trước)', async () => {
      const res = await request(app.getHttpServer()).post('/api/categories').send({});
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });
  });

  describe('Refresh token revocation & rotation', () => {
    it('rotation single-use: refresh cũ bị vô hiệu sau khi xoay', async () => {
      const { refreshToken } = await registerMember();

      const rotated = await request(app.getHttpServer())
        .post('/api/auth/refresh')
        .send({ refresh_token: refreshToken });
      expect(rotated.status).toBe(200);
      expect(rotated.body.data.access_token).toBeDefined();
      expect(rotated.body.data.refresh_token).toBeDefined();
      expect(rotated.body.data.refresh_token).not.toBe(refreshToken);

      // Dùng lại refresh token CŨ → phải bị từ chối (jti đã xóa khỏi Redis).
      const reused = await request(app.getHttpServer())
        .post('/api/auth/refresh')
        .send({ refresh_token: refreshToken });
      expect(reused.status).toBe(401);
    });

    it('logout thu hồi refresh: refresh sau logout = 401', async () => {
      const { accessToken, refreshToken } = await registerMember();

      const loggedOut = await request(app.getHttpServer())
        .post('/api/auth/logout')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ refresh_token: refreshToken });
      expect(loggedOut.status).toBe(200);

      const afterLogout = await request(app.getHttpServer())
        .post('/api/auth/refresh')
        .send({ refresh_token: refreshToken });
      expect(afterLogout.status).toBe(401);
    });
  });
});
