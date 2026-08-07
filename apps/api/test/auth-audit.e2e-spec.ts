import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { TransformInterceptor } from '../src/common/interceptors/transform.interceptor';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { AuditService } from '../src/core/audit/audit.service';
import { TokenService } from '../src/modules/auth/token.service';

// H-3 (Production Readiness Audit, 2026-08-07) — sự kiện audit cho Auth (ADR-016 §Context nêu
// thẳng `user.registered`/`auth.login.success` làm ví dụ mở đầu cho lý do bảng `audit_logs` tồn
// tại). Kiểm chứng trên Postgres THẬT qua HTTP thật.
//
// `/auth/register`/`/auth/login` bị `@Throttle` giới hạn 10 req/60s THẬT (bucket RIÊNG cho từng
// route). Suite này dùng SỐ LƯỢNG NHỎ các lời gọi thật tới hai route đó (đủ để chứng minh event
// user.registered/auth.login.* thật sự được ghi từ đầu-đến-cuối qua HTTP), và dùng khuôn đã có ở
// `auth-token-revocation.e2e-spec.ts` (SQL INSERT + mint token qua chính `TokenService`) cho các
// luồng refresh/logout/logout-all vốn KHÔNG bị auth-throttle.
describe('H-3 Authentication audit events (live Postgres)', () => {
  let app: INestApplication;
  let ds: DataSource;
  let tokens: TokenService;
  let jwt: JwtService;
  let config: ConfigService;
  let auditService: AuditService;

  const userIds: string[] = [];
  const password = 'password123';

  async function mkUser(label: string) {
    const email = `e2e_h3_${label}_${Date.now()}_${Math.random().toString(36).slice(2)}@phuquochub.test`;
    const rows: Array<{ id: string }> = await ds.query(
      `INSERT INTO users (email, display_name, password_hash, is_active)
       VALUES ($1, $2, $3, true) RETURNING id`,
      [email, `H3 ${label}`, 'not-a-real-hash'],
    );
    const userId = rows[0].id;
    userIds.push(userId);
    const [{ id: roleId }] = await ds.query(`SELECT id FROM roles WHERE code = 'member'`);
    await ds.query(
      `INSERT INTO user_roles (user_id, role_id, scope_type, business_id) VALUES ($1,$2,'global',NULL)`,
      [userId, roleId],
    );
    return { userId, email };
  }

  async function signAccess(userId: string, email: string): Promise<string> {
    return jwt.signAsync(
      { sub: userId, email, type: 'access' },
      {
        secret: config.get<string>('jwt.accessSecret'),
        expiresIn: config.get<number>('jwt.accessTtl') ?? 900,
      },
    );
  }

  /** Dòng audit MỚI NHẤT khớp event + entityId — tránh đụng dòng do file e2e khác tạo song song. */
  async function latestAudit(event: string, entityId: string | null) {
    const rows = await ds.query(
      entityId === null
        ? `SELECT * FROM audit_logs WHERE event = $1 AND entity_id IS NULL ORDER BY created_at DESC LIMIT 5`
        : `SELECT * FROM audit_logs WHERE event = $1 AND entity_id = $2 ORDER BY created_at DESC LIMIT 1`,
      entityId === null ? [event] : [event, entityId],
    );
    return entityId === null ? rows : rows[0];
  }

  /** Dòng audit MỚI NHẤT khớp event + context.email — dùng khi entity_id là NULL (email chưa tồn tại). */
  async function latestAuditByEmail(event: string, email: string) {
    const rows = await ds.query(
      `SELECT * FROM audit_logs WHERE event = $1 AND context->>'email' = $2 ORDER BY created_at DESC LIMIT 1`,
      [event, email],
    );
    return rows[0];
  }

  /** Rule 1: quét TOÀN BỘ cột jsonb (before/after/context) tìm chuỗi bí mật không được xuất hiện. */
  function assertNoSecret(row: Record<string, unknown>, secrets: string[]) {
    const blob = JSON.stringify([row.before, row.after, row.context]);
    for (const s of secrets) {
      expect(blob).not.toContain(s);
    }
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    app.useGlobalInterceptors(new TransformInterceptor());
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();

    ds = app.get<DataSource>(getDataSourceToken());
    tokens = app.get(TokenService);
    jwt = app.get(JwtService);
    config = app.get(ConfigService);
    auditService = app.get(AuditService);
  }, 60_000);

  // Teardown hang fix (2026-08-07): dọn dẹp fixture PHẢI nằm trong `try` — nếu bất kỳ bước nào ném
  // lỗi, `finally` vẫn đảm bảo `app.close()` LUÔN chạy, thay vì để Nest/TypeORM/ioredis giữ handle
  // mở khiến Jest treo sau khi in kết quả. KHÔNG nuốt lỗi bằng `.catch()`: lỗi dọn dẹp vẫn nổi lên
  // sau `finally`, khiến lần chạy thất bại RÕ RÀNG thay vì treo âm thầm.
  afterAll(async () => {
    try {
      if (ds?.isInitialized) {
        if (userIds.length) {
          await ds.query(`DELETE FROM audit_logs WHERE actor_id = ANY($1) OR entity_id = ANY($1)`, [userIds]);
          await ds.query(`DELETE FROM user_roles WHERE user_id = ANY($1)`, [userIds]);
          await ds.query(`DELETE FROM users WHERE id = ANY($1)`, [userIds]);
        }
        // Dọn audit của những user tạo qua HTTP thật (register) — track theo email pattern riêng.
        await ds.query(
          `DELETE FROM audit_logs WHERE entity_id IN (SELECT id FROM users WHERE email LIKE 'e2e_h3_http_%')`,
        );
        await ds.query(`DELETE FROM user_roles WHERE user_id IN (SELECT id FROM users WHERE email LIKE 'e2e_h3_http_%')`);
        await ds.query(`DELETE FROM users WHERE email LIKE 'e2e_h3_http_%'`);
        await ds.query(`DELETE FROM audit_logs WHERE context->>'email' LIKE 'e2e_h3_unknown_%'`);
      }
    } finally {
      if (app) {
        await app.close();
      }
    }
  });

  // ============================== user.registered ==============================
  it('POST /auth/register (HTTP thật) → 201 + ghi audit user.registered (entityId=user mới, KHÔNG mật khẩu trong payload)', async () => {
    const email = `e2e_h3_http_register_${Date.now()}@phuquochub.test`;
    const res = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ email, password, display_name: 'H3 Register' });
    expect(res.status).toBe(201);
    const userId = res.body.data.user.id as string;

    const row = await latestAudit('user.registered', userId);
    expect(row).toBeDefined();
    expect(row.actor_id).toBe(userId);
    expect(row.result).toBe('success');
    expect(row.context).toMatchObject({ provider: 'local' });
    assertNoSecret(row, [password, res.body.data.access_token, res.body.data.refresh_token]);
  });

  // ============================== auth.login.success / .failure ==============================
  describe('login (HTTP thật)', () => {
    let email: string;
    let userId: string;

    beforeAll(async () => {
      email = `e2e_h3_http_login_${Date.now()}@phuquochub.test`;
      const res = await request(app.getHttpServer())
        .post('/api/auth/register')
        .send({ email, password, display_name: 'H3 Login' });
      userId = res.body.data.user.id;
    });

    it('đăng nhập thành công → 200 + ghi audit auth.login.success', async () => {
      const res = await request(app.getHttpServer()).post('/api/auth/login').send({ email, password });
      expect(res.status).toBe(200);

      const row = await latestAudit('auth.login.success', userId);
      expect(row).toBeDefined();
      expect(row.actor_id).toBe(userId);
      expect(row.result).toBe('success');
      assertNoSecret(row, [password, res.body.data.access_token, res.body.data.refresh_token]);
    });

    it('sai mật khẩu → 401 + ghi audit auth.login.failure (reason=invalid_password)', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email, password: 'wrong-password-here' });
      expect(res.status).toBe(401);

      const row = await latestAudit('auth.login.failure', userId);
      expect(row).toBeDefined();
      expect(row.actor_id).toBeNull();
      expect(row.result).toBe('failure');
      expect(row.context).toMatchObject({ reason: 'invalid_password' });
      assertNoSecret(row, ['wrong-password-here']);
    });

    // Rule 2: response bên ngoài cho "email không tồn tại" PHẢI giống HỆT "sai mật khẩu".
    it('email KHÔNG tồn tại → CÙNG response 401 như sai mật khẩu, ghi audit reason=user_not_found, entity_id=NULL', async () => {
      const unknownEmail = `e2e_h3_unknown_${Date.now()}_${Math.random().toString(36).slice(2)}@phuquochub.test`;

      const resUnknown = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: unknownEmail, password: 'anything123' });
      const resBadPassword = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email, password: 'another-wrong-pw' });

      expect(resUnknown.status).toBe(401);
      expect(resUnknown.status).toBe(resBadPassword.status);
      expect(resUnknown.body.error.code).toBe(resBadPassword.body.error.code);
      expect(resUnknown.body.error.message).toBe(resBadPassword.body.error.message);

      const row = await latestAuditByEmail('auth.login.failure', unknownEmail.toLowerCase());
      expect(row).toBeDefined();
      expect(row.entity_id).toBeNull();
      expect(row.actor_id).toBeNull();
      expect(row.context).toMatchObject({ reason: 'user_not_found' });
    });
  });

  // ============================== auth.refresh.success / .failure ==============================
  describe('refresh (HTTP thật, không bị auth-throttle)', () => {
    it('refresh thành công → 200 + ghi audit auth.refresh.success (entityId = user)', async () => {
      const user = await mkUser('refresh_ok');
      const issued = await tokens.issueTokens({ id: user.userId, email: user.email } as Parameters<
        typeof tokens.issueTokens
      >[0]);

      const res = await request(app.getHttpServer())
        .post('/api/auth/refresh')
        .send({ refresh_token: issued.refreshToken });
      expect(res.status).toBe(200);

      const row = await latestAudit('auth.refresh.success', user.userId);
      expect(row).toBeDefined();
      expect(row.actor_id).toBe(user.userId);
      expect(row.result).toBe('success');
      assertNoSecret(row, [issued.refreshToken, issued.accessToken, res.body.data.access_token, res.body.data.refresh_token]);
    });

    // H-5 (2026-08-07): dùng lại MỘT refresh token ĐÃ tiêu thụ giờ được TokenService phân loại
    // CHÍNH XÁC là tái dùng (reuse), không còn rơi vào `auth.refresh.failure`(reason=revoked) chung
    // chung nữa — ghi `auth.refresh.reuse_detected` riêng (xem `auth-refresh-reuse.e2e-spec.ts` cho
    // bộ kiểm chứng đầy đủ về family revoke/H-1/concurrency). Response HTTP bên ngoài (401 + message)
    // KHÔNG đổi — chỉ audit trail chi tiết hơn.
    it('refresh token đã dùng (tái sử dụng) → 401 + ghi audit auth.refresh.reuse_detected (reason=reused, entityId = user)', async () => {
      const user = await mkUser('refresh_revoked');
      const issued = await tokens.issueTokens({ id: user.userId, email: user.email } as Parameters<
        typeof tokens.issueTokens
      >[0]);
      // Dùng một lần cho "hết" (rotate thật qua HTTP) rồi dùng LẠI CHÍNH refresh token cũ đó.
      const first = await request(app.getHttpServer())
        .post('/api/auth/refresh')
        .send({ refresh_token: issued.refreshToken });
      expect(first.status).toBe(200);

      const second = await request(app.getHttpServer())
        .post('/api/auth/refresh')
        .send({ refresh_token: issued.refreshToken });
      expect(second.status).toBe(401);

      const row = await latestAudit('auth.refresh.reuse_detected', user.userId);
      expect(row).toBeDefined();
      expect(row.result).toBe('failure');
      expect(row.context).toMatchObject({ reason: 'reused' });
      assertNoSecret(row, [issued.refreshToken]);
    });

    it('refresh token hỏng/không giải mã được → 401 + ghi audit auth.refresh.failure (reason=invalid_token, entityId=NULL)', async () => {
      const garbage = 'not-a-real-jwt-at-all';
      const res = await request(app.getHttpServer())
        .post('/api/auth/refresh')
        .send({ refresh_token: garbage });
      expect(res.status).toBe(401);

      const rows = await latestAudit('auth.refresh.failure', null);
      const row = rows.find((r: { context: { reason: string } }) => r.context?.reason === 'invalid_token');
      expect(row).toBeDefined();
      expect(row.entity_id).toBeNull();
      expect(row.actor_id).toBeNull();
      assertNoSecret(row, [garbage]);
    });
  });

  // ============================== auth.logout / auth.logout_all ==============================
  describe('logout / logout-all (HTTP thật, không bị auth-throttle)', () => {
    it('POST /auth/logout → 200 + ghi audit auth.logout (entityId/actorId = principal đã xác thực)', async () => {
      const user = await mkUser('logout');
      const issued = await tokens.issueTokens({ id: user.userId, email: user.email } as Parameters<
        typeof tokens.issueTokens
      >[0]);
      const accessToken = await signAccess(user.userId, user.email);

      const res = await request(app.getHttpServer())
        .post('/api/auth/logout')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ refresh_token: issued.refreshToken });
      expect(res.status).toBe(200);

      const row = await latestAudit('auth.logout', user.userId);
      expect(row).toBeDefined();
      expect(row.actor_id).toBe(user.userId);
      expect(row.result).toBe('success');
      assertNoSecret(row, [issued.refreshToken, accessToken]);
    });

    it('POST /auth/logout-all → 200 + ghi audit auth.logout_all (entityId/actorId = principal)', async () => {
      const user = await mkUser('logout_all');
      const accessToken = await signAccess(user.userId, user.email);
      await tokens.issueTokens({ id: user.userId, email: user.email } as Parameters<typeof tokens.issueTokens>[0]);

      const res = await request(app.getHttpServer())
        .post('/api/auth/logout-all')
        .set('Authorization', `Bearer ${accessToken}`);
      expect(res.status).toBe(200);

      const row = await latestAudit('auth.logout_all', user.userId);
      expect(row).toBeDefined();
      expect(row.actor_id).toBe(user.userId);
      expect(row.result).toBe('success');
      assertNoSecret(row, [accessToken]);
    });
  });

  // ============================== rule 6: audit không đổi hành vi response (chứng minh SỐNG) ==============================
  it('ghi audit LỖI THẬT (spy trên AuditService sống) KHÔNG làm hỏng một đăng nhập THÀNH CÔNG qua HTTP', async () => {
    const email = `e2e_h3_http_auditfail_${Date.now()}@phuquochub.test`;
    await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ email, password, display_name: 'Audit Fail Live' });

    const spy = jest.spyOn(auditService, 'record').mockRejectedValueOnce(new Error('simulated audit_logs outage'));
    try {
      const res = await request(app.getHttpServer()).post('/api/auth/login').send({ email, password });
      // Response THÀNH CÔNG không đổi dù bước ghi audit thất bại thật sự (rule 6).
      expect(res.status).toBe(200);
      expect(res.body.data.access_token).toBeDefined();
    } finally {
      spy.mockRestore();
    }
  });

  it('ghi audit LỖI THẬT (spy trên AuditService sống) KHÔNG thay thế 401 gốc của một đăng nhập THẤT BẠI', async () => {
    const email = `e2e_h3_http_auditfail2_${Date.now()}@phuquochub.test`;
    await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ email, password, display_name: 'Audit Fail Live 2' });

    const spy = jest.spyOn(auditService, 'record').mockRejectedValueOnce(new Error('simulated audit_logs outage'));
    try {
      const res = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email, password: 'definitely-wrong' });
      // Status KHÔNG bị thay bằng 500 dù ghi audit thất bại thật sự (rule 5/6).
      expect(res.status).toBe(401);
    } finally {
      spy.mockRestore();
    }
  });
});
