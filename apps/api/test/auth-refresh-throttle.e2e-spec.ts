import { ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { TransformInterceptor } from '../src/common/interceptors/transform.interceptor';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { TokenService } from '../src/modules/auth/token.service';

// H-4 (Production Readiness Audit, 2026-08-07) — `/auth/refresh` giờ dùng CHUNG bucket
// `AUTH_THROTTLE` với `login`/`register` (mặc định 10 req/60s, `RATE_LIMIT_AUTH_TTL`/
// `RATE_LIMIT_AUTH_LIMIT` — KHÔNG set trong môi trường test, nên mặc định 10/60s áp dụng, ĐÚNG giả
// định mà `security-hardening.e2e-spec.ts`'s login-throttle test đã dùng từ trước).
//
// KEY THROTTLE THẬT (xác nhận từ mã nguồn @nestjs/throttler 6.5.0, `generateKey()`):
// `ClassName-HandlerName-ThrottlerName` băm cùng tracker (mặc định `req.ip`) — nghĩa là MỖI route
// (`login`/`register`/`refresh`) có bucket ĐỘC LẬP dù dùng chung object cấu hình `AUTH_THROTTLE`
// (chỉ là giá trị ttl/limit dùng lại, KHÔNG phải chung một bucket đếm). Route KHÔNG có `@Throttle`
// (`logout`/`logout-all`) rơi vào giới hạn TOÀN CỤC 100 req/60s như trước — KHÔNG đổi.
//
// MỖI describe DƯỚI ĐÂY tự dựng MỘT app instance RIÊNG: `ThrottlerModule.forRootAsync` gắn
// storage in-memory vào container DI của app đó (`RateLimitModule`'s own comment: "in-memory,
// một instance") — hai app instance khác nhau có storage HOÀN TOÀN tách biệt, nên bộ đếm của route
// `refresh` không bị RÒ RỈ giữa các nhóm test khác nhau trong CÙNG file (nếu dùng chung MỘT app
// instance, thứ tự chạy `it()` sẽ ảnh hưởng lẫn nhau vì bucket persist theo (route, IP) suốt vòng
// đời app instance đó).
describe('H-4 Refresh throttle (live Postgres + Redis)', () => {
  const userIds: string[] = [];

  /** User thật trong DB — cùng khuôn `mkUser` đã dùng ở `auth-token-revocation.e2e-spec.ts` (H-1)/
   *  `auth-audit.e2e-spec.ts` (H-3): INSERT trực tiếp, KHÔNG qua `/auth/register` (route đó CŨNG bị
   *  auth-throttle, sẽ đụng chính bucket đang được test ở nhóm khác nếu tái dùng route đó ở đây). */
  async function mkUser(ds: DataSource, label: string) {
    const email = `e2e_h4_${label}_${Date.now()}_${Math.random().toString(36).slice(2)}@phuquochub.test`;
    const rows: Array<{ id: string }> = await ds.query(
      `INSERT INTO users (email, display_name, password_hash, is_active)
       VALUES ($1, $2, $3, true) RETURNING id`,
      [email, `H4 ${label}`, 'not-a-real-hash'],
    );
    userIds.push(rows[0].id);
    const [{ id: roleId }] = await ds.query(`SELECT id FROM roles WHERE code = 'member'`);
    await ds.query(
      `INSERT INTO user_roles (user_id, role_id, scope_type, business_id) VALUES ($1,$2,'global',NULL)`,
      [rows[0].id, roleId],
    );
    return { userId: rows[0].id as string, email: email as string };
  }

  /** Dựng một app instance MỚI (bucket throttle riêng — xem chú thích đầu file). Kiểu
   *  `NestExpressApplication` xuyên suốt (kể cả nơi không cần `.set('trust proxy', ...)`) để MỌI
   *  describe block dùng CHUNG một hàm dựng app — giống hệt kiểu `main.ts` thật dùng. Teardown hang
   *  fix (2026-08-07) đã áp dụng ở mọi `afterAll` bên dưới: dọn dẹp trong `try`, `app.close()` luôn
   *  chạy trong `finally`, lỗi dọn dẹp vẫn nổi lên rõ ràng. */
  async function bootApp(): Promise<NestExpressApplication> {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    const app = moduleRef.createNestApplication<NestExpressApplication>();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    app.useGlobalInterceptors(new TransformInterceptor());
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();
    return app;
  }

  async function cleanupUsers(ds: DataSource): Promise<void> {
    if (ds?.isInitialized && userIds.length) {
      await ds.query(`DELETE FROM audit_logs WHERE actor_id = ANY($1) OR entity_id = ANY($1)`, [userIds]);
      await ds.query(`DELETE FROM user_roles WHERE user_id = ANY($1)`, [userIds]);
      await ds.query(`DELETE FROM users WHERE id = ANY($1)`, [userIds]);
    }
  }

  // ============================================================================================
  describe('dưới giới hạn — refresh vẫn hoạt động bình thường + audit + không phá vỡ hành vi H-1', () => {
    let app: NestExpressApplication;
    let ds: DataSource;
    let tokens: TokenService;

    beforeAll(async () => {
      app = await bootApp();
      ds = app.get<DataSource>(getDataSourceToken());
      tokens = app.get(TokenService);
    }, 60_000);

    afterAll(async () => {
      try {
        await cleanupUsers(ds);
      } finally {
        if (app) await app.close();
      }
    });

    it('dưới giới hạn (5/10) → 200 xuyên suốt CHUỖI xoay vòng, mỗi lần thành công ghi auth.refresh.success', async () => {
      const user = await mkUser(ds, 'under_limit');
      let refreshToken = (
        await tokens.issueTokens({ id: user.userId, email: user.email } as Parameters<
          typeof tokens.issueTokens
        >[0])
      ).refreshToken;

      const CALLS = 5; // < limit mặc định (10) — chừa dư cho request thứ 6 (revoked, test dưới).
      for (let i = 0; i < CALLS; i += 1) {
        const res = await request(app.getHttpServer())
          .post('/api/auth/refresh')
          .send({ refresh_token: refreshToken });
        expect(res.status).toBe(200);
        expect(res.body.data.access_token).toBeDefined();
        refreshToken = res.body.data.refresh_token; // chuỗi xoay vòng thật — mỗi vòng dùng token MỚI.
      }

      const successRows = await ds.query(
        `SELECT count(*)::int AS n FROM audit_logs WHERE event = 'auth.refresh.success' AND entity_id = $1`,
        [user.userId],
      );
      expect(successRows[0].n).toBe(CALLS);
    });

    it('token đã bị thu hồi (dùng lại token cũ) → 401 y hệt hành vi H-1, KHÔNG bị 429 nhầm dù route đã có throttle riêng', async () => {
      const user = await mkUser(ds, 'revoked_still_h1');
      const issued = await tokens.issueTokens({ id: user.userId, email: user.email } as Parameters<
        typeof tokens.issueTokens
      >[0]);

      const first = await request(app.getHttpServer())
        .post('/api/auth/refresh')
        .send({ refresh_token: issued.refreshToken });
      expect(first.status).toBe(200);

      // Dùng LẠI CHÍNH token cũ (đã bị rotate/xoá) — hành vi H-1: 401 "đã bị thu hồi hoặc không hợp lệ".
      const reused = await request(app.getHttpServer())
        .post('/api/auth/refresh')
        .send({ refresh_token: issued.refreshToken });
      expect(reused.status).toBe(401);
      expect(reused.body.error.message).toBe('Refresh token đã bị thu hồi hoặc không hợp lệ');

      // H-3 vẫn ghi audit.refresh.failure(reason=revoked) như trước — throttle KHÔNG đụng gì ở đây.
      const rows = await ds.query(
        `SELECT context FROM audit_logs WHERE event = 'auth.refresh.failure' AND entity_id = $1 ORDER BY created_at DESC LIMIT 1`,
        [user.userId],
      );
      expect(rows[0].context).toMatchObject({ reason: 'revoked' });
    });
  });

  // ============================================================================================
  describe('vượt giới hạn — 429 + KHÔNG audit request bị chặn', () => {
    let app: NestExpressApplication;
    let ds: DataSource;
    const LIMIT = 10; // RATE_LIMIT_AUTH_LIMIT mặc định — KHÔNG set trong môi trường test (đã xác
    // nhận `process.env.RATE_LIMIT_AUTH_LIMIT` rỗng), cùng giả định `security-hardening.e2e-spec.ts`.

    beforeAll(async () => {
      app = await bootApp();
      ds = app.get<DataSource>(getDataSourceToken());
    }, 60_000);

    afterAll(async () => {
      try {
        await cleanupUsers(ds);
      } finally {
        if (app) await app.close();
      }
    });

    it(
      `${LIMIT} request đầu (token rác) → 401 xuyên suốt (vẫn chạm handler); request thứ ${LIMIT + 1} → 429 (bị chặn ở guard, KHÔNG chạm handler); 0 dòng audit.refresh.success/failure MỚI cho request bị chặn`,
      async () => {
        const before = await ds.query(
          `SELECT
             (SELECT count(*)::int FROM audit_logs WHERE event = 'auth.refresh.failure' AND context->>'reason' = 'invalid_token' AND entity_id IS NULL) AS failure_n,
             (SELECT count(*)::int FROM audit_logs WHERE event = 'auth.refresh.success') AS success_n`,
        );

        for (let i = 0; i < LIMIT; i += 1) {
          const res = await request(app.getHttpServer())
            .post('/api/auth/refresh')
            .send({ refresh_token: 'not-a-real-jwt-h4-throttle-test' });
          expect(res.status).toBe(401);
        }

        const blocked = await request(app.getHttpServer())
          .post('/api/auth/refresh')
          .send({ refresh_token: 'not-a-real-jwt-h4-throttle-test' });
        // Rule 3: dùng NGUYÊN định dạng throttle response hiện có — KHÔNG phát minh cái mới. Cùng
        // hình dạng response mà `security-hardening.e2e-spec.ts` đã khẳng định cho `/auth/login`.
        expect(blocked.status).toBe(429);
        expect(blocked.body.success).toBe(false);

        const after = await ds.query(
          `SELECT
             (SELECT count(*)::int FROM audit_logs WHERE event = 'auth.refresh.failure' AND context->>'reason' = 'invalid_token' AND entity_id IS NULL) AS failure_n,
             (SELECT count(*)::int FROM audit_logs WHERE event = 'auth.refresh.success') AS success_n`,
        );

        // Đúng LIMIT dòng auth.refresh.failure mới (10 request CHẠM handler) — request thứ 11 bị
        // ThrottlerGuard chặn TRƯỚC handler (Nest: guard luôn chạy trước khi vào thân route), nên
        // KHÔNG BAO GIỜ tới được `AuthService.refresh()` -> KHÔNG ghi audit nào cho request đó.
        expect(after[0].failure_n - before[0].failure_n).toBe(LIMIT);
        // Và chắc chắn KHÔNG có dòng auth.refresh.success nào phát sinh — request bị throttle
        // TUYỆT ĐỐI không được báo cáo thành công.
        expect(after[0].success_n - before[0].success_n).toBe(0);
      },
      20_000,
    );
  });

  // ============================================================================================
  describe('cửa sổ giới hạn tự đặt lại', () => {
    let app: NestExpressApplication;
    let ds: DataSource;
    const LIMIT = 10;
    const TTL_SECONDS = 60; // RATE_LIMIT_AUTH_TTL mặc định, không override trong môi trường test.

    beforeAll(async () => {
      app = await bootApp();
      ds = app.get<DataSource>(getDataSourceToken());
    }, 60_000);

    afterAll(async () => {
      try {
        await cleanupUsers(ds);
      } finally {
        if (app) await app.close();
      }
    });

    it(
      'sau khi bị 429, CHỜ HẾT cửa sổ (TTL thật, không mock đồng hồ) -> refresh lại được (không còn 429)',
      async () => {
        for (let i = 0; i < LIMIT; i += 1) {
          await request(app.getHttpServer())
            .post('/api/auth/refresh')
            .send({ refresh_token: 'not-a-real-jwt-h4-window-test' });
        }
        const blocked = await request(app.getHttpServer())
          .post('/api/auth/refresh')
          .send({ refresh_token: 'not-a-real-jwt-h4-window-test' });
        expect(blocked.status).toBe(429);

        // Chờ QUA hẳn cửa sổ TTL thật (không mock timer — đây là hành vi SỐNG của
        // ThrottlerStorage in-memory) + đệm 1s để tránh biên đua giữa lúc đặt bộ đếm và lúc hết hạn.
        await new Promise((resolve) => setTimeout(resolve, (TTL_SECONDS + 1) * 1000));

        const afterWindow = await request(app.getHttpServer())
          .post('/api/auth/refresh')
          .send({ refresh_token: 'not-a-real-jwt-h4-window-test' });
        // KHÔNG còn bị 429 — cửa sổ đã tự đặt lại; token rác vẫn 401 (route hoạt động bình thường
        // trở lại, chỉ KHÔNG còn bị throttle chặn).
        expect(afterWindow.status).not.toBe(429);
        expect(afterWindow.status).toBe(401);
      },
      (TTL_SECONDS + 15) * 1000,
    );
  });

  // ============================================================================================
  describe('client khác (IP khác) không bị ảnh hưởng', () => {
    let app: NestExpressApplication;
    let ds: DataSource;
    const LIMIT = 10;

    beforeAll(async () => {
      app = await bootApp();
      // Mô phỏng ĐÚNG cấu hình production thật đứng sau Caddy (main.ts: `TRUST_PROXY_HOPS>0` ->
      // `app.set('trust proxy', N)`) để `X-Forwarded-For` được tin cậy — KHÔNG có cách nào khác
      // để tạo hai "client" với `req.ip` khác nhau qua supertest trên cùng một socket loopback.
      app.set('trust proxy', 1);
      ds = app.get<DataSource>(getDataSourceToken());
    }, 60_000);

    afterAll(async () => {
      try {
        await cleanupUsers(ds);
      } finally {
        if (app) await app.close();
      }
    });

    it(
      `client A bị 429 sau ${LIMIT} request -> client B (X-Forwarded-For khác) VẪN dùng refresh bình thường`,
      async () => {
        const clientAIp = '203.0.113.10';
        const clientBIp = '203.0.113.20';

        for (let i = 0; i < LIMIT; i += 1) {
          const res = await request(app.getHttpServer())
            .post('/api/auth/refresh')
            .set('X-Forwarded-For', clientAIp)
            .send({ refresh_token: 'not-a-real-jwt-h4-client-a' });
          expect(res.status).toBe(401);
        }
        const blockedA = await request(app.getHttpServer())
          .post('/api/auth/refresh')
          .set('X-Forwarded-For', clientAIp)
          .send({ refresh_token: 'not-a-real-jwt-h4-client-a' });
        expect(blockedA.status).toBe(429);

        // Client B — IP khác hoàn toàn — bucket ĐỘC LẬP (khoá throttle băm gồm tracker=req.ip).
        const clientB = await request(app.getHttpServer())
          .post('/api/auth/refresh')
          .set('X-Forwarded-For', clientBIp)
          .send({ refresh_token: 'not-a-real-jwt-h4-client-b' });
        expect(clientB.status).not.toBe(429);
        expect(clientB.status).toBe(401);
      },
      20_000,
    );
  });
});
