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
import { RedisService } from '../src/core/redis/redis.service';
import { AuthRevocationService } from '../src/core/auth-revocation/auth-revocation.service';
import { TokenService } from '../src/modules/auth/token.service';

// H-1 (Production Readiness Audit, 2026-08-06) — thu hồi access token, kiểm chứng trên Redis +
// Postgres THẬT qua HTTP thật. Cần `docker compose up -d postgres redis` + migration đã chạy.
//
// KHÔNG dùng `POST /auth/register`/`/auth/login` để dựng fixture: hai route đó bị `@Throttle` giới
// hạn 10 req/60s THẬT, và suite này cần ~15 user — sẽ ăn 429 giữa suite. Dùng đúng khuôn đã có ở
// `authz-scoped-pep-rollout.e2e-spec.ts`/`business-claims.e2e-spec.ts`: INSERT user bằng SQL rồi cấp
// token bằng chính `TokenService` mà app dùng (nên chỉ mục refresh trên Redis được ghi y như luồng
// thật). Chỉ những route CẦN kiểm chứng qua HTTP (`/auth/logout-all`, `/auth/refresh`, các route đã
// xác thực) mới gọi thật — cả hai đều KHÔNG nằm dưới auth-throttle.
//
// ĐỘ PHÂN GIẢI 1 GIÂY: `iat` của JWT tính theo giây nên mốc thu hồi cũng theo giây, và token cấp
// CÙNG GIÂY với lệnh thu hồi sẽ KHÔNG bị thu hồi (giới hạn nội tại, ghi rõ trong
// AuthRevocationService). Vì vậy các test chờ qua ranh giới giây trước khi thu hồi — đó là đặc tính
// của cơ chế, không phải thủ thuật làm test xanh.
describe('H-1 Access token revocation (live Postgres + Redis)', () => {
  let app: INestApplication;
  let ds: DataSource;
  let redis: RedisService;
  let revocation: AuthRevocationService;
  let tokens: TokenService;
  let jwt: JwtService;
  let config: ConfigService;

  const userIds: string[] = [];

  /** Chờ tới đầu giây kế tiếp — xem ghi chú độ phân giải 1 giây ở đầu file. */
  function nextSecond(): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, 1050 - (Date.now() % 1000)));
  }

  /** User thật trong DB + access token thật (không qua route bị throttle). */
  async function mkUser(label: string, roleCode = 'member') {
    const email = `e2e_h1_${label}_${Date.now()}_${Math.random().toString(36).slice(2)}@phuquochub.test`;
    const rows: Array<{ id: string }> = await ds.query(
      `INSERT INTO users (email, display_name, password_hash, is_active)
       VALUES ($1, $2, $3, true) RETURNING id`,
      [email, `H1 ${label}`, 'not-a-real-hash'],
    );
    const userId = rows[0].id;
    userIds.push(userId);
    const [{ id: roleId }] = await ds.query(`SELECT id FROM roles WHERE code = $1`, [roleCode]);
    await ds.query(
      `INSERT INTO user_roles (user_id, role_id, scope_type, business_id) VALUES ($1,$2,'global',NULL)`,
      [userId, roleId],
    );
    return { userId, email, accessToken: await signAccess(userId, email) };
  }

  /** Cấp access token y hệt TokenService (cùng payload, cùng secret) — `iat` do jsonwebtoken tự thêm. */
  async function signAccess(userId: string, email: string): Promise<string> {
    return jwt.signAsync(
      { sub: userId, email, type: 'access' },
      {
        secret: config.get<string>('jwt.accessSecret'),
        expiresIn: config.get<number>('jwt.accessTtl') ?? 900,
      },
    );
  }

  function getMe(accessToken: string) {
    return request(app.getHttpServer())
      .get('/api/users/me')
      .set('Authorization', `Bearer ${accessToken}`);
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
    redis = app.get(RedisService);
    revocation = app.get(AuthRevocationService);
    tokens = app.get(TokenService);
    jwt = app.get(JwtService);
    config = app.get(ConfigService);
  }, 60_000);

  // Teardown hang fix (2026-08-07): dọn dẹp fixture PHẢI nằm trong `try` — nếu bất kỳ bước nào ném
  // lỗi (đã xảy ra THẬT: một cast `::text` sai kiểu từng làm afterAll ném lỗi giữa chừng), `finally`
  // vẫn đảm bảo `app.close()` LUÔN chạy. Thiếu nó, Nest/TypeORM/ioredis giữ handle mở và Jest treo
  // sau khi in kết quả (process không bao giờ thoát) — KHÔNG nuốt lỗi bằng `.catch()`: lỗi dọn dẹp
  // vẫn nổi lên sau `finally`, khiến lần chạy thất bại RÕ RÀNG thay vì treo âm thầm.
  afterAll(async () => {
    try {
      if (redis) {
        for (const id of userIds) {
          await redis.getClient().del(`authrev:${id}`, `refresh:user:${id}`);
        }
      }
      if (ds?.isInitialized && userIds.length) {
        await ds.query(`DELETE FROM user_roles WHERE user_id = ANY($1)`, [userIds]);
        // `audit_logs.actor_id`/`entity_id` đều là uuid (không cast ::text — sẽ lỗi "text = uuid").
        // Các test gán/thu hồi vai trò ghi audit `role.assigned`/`role.revoked` với entity_id = user
        // đích; audit_logs.actor_id là FK NO ACTION nên phải xoá TRƯỚC `users`.
        await ds.query(`DELETE FROM audit_logs WHERE actor_id = ANY($1) OR entity_id = ANY($1)`, [
          userIds,
        ]);
        await ds.query(`DELETE FROM users WHERE id = ANY($1)`, [userIds]);
      }
    } finally {
      if (app) {
        await app.close();
      }
    }
  });

  it('token đang hoạt động -> 200 (đường bình thường không bị cơ chế mới làm hỏng)', async () => {
    const user = await mkUser('active');
    const res = await getMe(user.accessToken);
    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(user.userId);
  });

  it('mốc thu hồi vô hiệu hoá token CŨ ngay lập tức -> 401', async () => {
    const user = await mkUser('revoke');
    expect((await getMe(user.accessToken)).status).toBe(200);

    await nextSecond();
    await revocation.revokeAllForUser(user.userId);

    const res = await getMe(user.accessToken);
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  it('token cấp SAU mốc thu hồi vẫn hợp lệ (đăng nhập lại phải dùng được ngay)', async () => {
    const user = await mkUser('reissue');
    await nextSecond();
    await revocation.revokeAllForUser(user.userId);
    expect((await getMe(user.accessToken)).status).toBe(401);

    await nextSecond();
    const fresh = await signAccess(user.userId, user.email);
    expect((await getMe(fresh)).status).toBe(200);
  });

  it('token của user KHÁC không bị ảnh hưởng (thu hồi đúng phạm vi một user)', async () => {
    const victim = await mkUser('scope_a');
    const bystander = await mkUser('scope_b');

    await nextSecond();
    await revocation.revokeAllForUser(victim.userId);

    expect((await getMe(victim.accessToken)).status).toBe(401);
    expect((await getMe(bystander.accessToken)).status).toBe(200);
  });

  it('GÁN vai trò -> token cũ của user ĐÍCH bị vô hiệu hoá (không giữ quyền cũ tới hết TTL)', async () => {
    const target = await mkUser('role_assign');
    const admin = await mkUser('role_assign_admin', 'administrator');

    expect((await getMe(target.accessToken)).status).toBe(200);
    const [{ id: roleId }] = await ds.query(`SELECT id FROM roles WHERE code = 'local_guide'`);

    await nextSecond();
    const assign = await request(app.getHttpServer())
      .post(`/api/users/${target.userId}/roles`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({ role_id: roleId });
    expect(assign.status).toBe(201);

    // Đây CHÍNH là lỗi H-1 gốc: trước thay đổi này token cũ còn dùng được tới 15 phút sau khi quyền đổi.
    expect((await getMe(target.accessToken)).status).toBe(401);
    expect(await redis.getClient().get(`authrev:${target.userId}`)).not.toBeNull();
    // Token của admin (người thao tác) KHÔNG bị thu hồi — chỉ user đích bị.
    expect((await getMe(admin.accessToken)).status).toBe(200);
  });

  it('THU HỒI vai trò -> token cũ của user ĐÍCH bị vô hiệu hoá', async () => {
    const target = await mkUser('role_revoke');
    const admin = await mkUser('role_revoke_admin', 'administrator');
    const [{ id: memberRoleId }] = await ds.query(`SELECT id FROM roles WHERE code = 'member'`);

    expect((await getMe(target.accessToken)).status).toBe(200);

    await nextSecond();
    const res = await request(app.getHttpServer())
      .delete(`/api/users/${target.userId}/roles/${memberRoleId}`)
      .set('Authorization', `Bearer ${admin.accessToken}`);
    expect(res.status).toBe(200);

    expect((await getMe(target.accessToken)).status).toBe(401);
  });

  it('logout-all -> vô hiệu hoá access token VÀ mọi refresh token của user đó', async () => {
    const user = await mkUser('logout_all');
    const dbUser = { id: user.userId, email: user.email } as Parameters<
      typeof tokens.issueTokens
    >[0];

    // Ba "thiết bị": ba bộ token thật, cấp qua chính TokenService (ghi cả chỉ mục refresh).
    const devices = [
      await tokens.issueTokens(dbUser),
      await tokens.issueTokens(dbUser),
      await tokens.issueTokens(dbUser),
    ];
    expect(await redis.getClient().smembers(`refresh:user:${user.userId}`)).toHaveLength(3);
    expect((await getMe(devices[0].accessToken)).status).toBe(200);

    await nextSecond();
    const logoutAll = await request(app.getHttpServer())
      .post('/api/auth/logout-all')
      .set('Authorization', `Bearer ${devices[2].accessToken}`);
    expect(logoutAll.status).toBe(200);

    // 1) MỌI access token chết, kể cả token vừa dùng để gọi logout-all.
    for (const d of devices) {
      expect((await getMe(d.accessToken)).status).toBe(401);
    }
    // 2) MỌI refresh token chết -> không thiết bị nào đúc được access token mới.
    for (const d of devices) {
      const res = await request(app.getHttpServer())
        .post('/api/auth/refresh')
        .send({ refresh_token: d.refreshToken });
      expect(res.status).toBe(401);
    }
    // 3) Chỉ mục theo user đã dọn sạch.
    expect(await redis.getClient().smembers(`refresh:user:${user.userId}`)).toHaveLength(0);
  });

  it('logout-all yêu cầu xác thực (401 khi thiếu token) và chỉ tác động chính principal', async () => {
    const other = await mkUser('logout_all_other');
    expect((await request(app.getHttpServer()).post('/api/auth/logout-all')).status).toBe(401);
    // principal lấy từ JWT, không từ body -> không thể đăng xuất hộ người khác.
    expect((await getMe(other.accessToken)).status).toBe(200);
  });

  it('mô phỏng vô hiệu hoá tài khoản: is_active=false (SQL) + gọi primitive -> token cũ 401', async () => {
    const user = await mkUser('deactivated');
    expect((await getMe(user.accessToken)).status).toBe(200);

    // Owner Decision D1-A: repo CHƯA có endpoint deactivate/ban (permission `User.Ban` đã seed nhưng
    // không có enforcement point). Test này chứng minh CƠ CHẾ mà luồng deactivate tương lai PHẢI
    // dùng: gọi `revokeAllForUser()`.
    await nextSecond();
    await ds.query(`UPDATE users SET is_active = false WHERE id = $1`, [user.userId]);
    await revocation.revokeAllForUser(user.userId);

    expect((await getMe(user.accessToken)).status).toBe(401);
  });

  it('GIỚI HẠN ĐÃ BIẾT: is_active=false chỉ bằng SQL (không gọi primitive) KHÔNG vô hiệu hoá token ngay', async () => {
    const user = await mkUser('sql_only');
    const issued = await tokens.issueTokens({ id: user.userId, email: user.email } as Parameters<
      typeof tokens.issueTokens
    >[0]);
    await ds.query(`UPDATE users SET is_active = false WHERE id = $1`, [user.userId]);

    // KHÔNG phải hành vi "mong muốn" mà là ghi nhận TRUNG THỰC hành vi hiện tại (Owner yêu cầu
    // document thẳng): guard chỉ đọc mốc thu hồi trên Redis, KHÔNG truy vấn DB mỗi request (đúng yêu
    // cầu "no unnecessary DB lookup"). Vô hiệu hoá NGOÀI luồng ứng dụng vì vậy không được cưỡng chế
    // tức thì — token sống tới hết TTL.
    expect((await getMe(issued.accessToken)).status).toBe(200);

    // Nhưng đường xoay refresh CHẶN được ngay, vì `rotate()` có kiểm `isActive`.
    const refreshed = await request(app.getHttpServer())
      .post('/api/auth/refresh')
      .send({ refresh_token: issued.refreshToken });
    expect(refreshed.status).toBe(401);
  });

  it('route @Public() KHÔNG phụ thuộc trạng thái thu hồi (kênh công khai không chạm Redis)', async () => {
    const user = await mkUser('public_route');
    await nextSecond();
    await revocation.revokeAllForUser(user.userId);
    expect((await getMe(user.accessToken)).status).toBe(401);

    // GET /api/users/:id là @Public() — vẫn 200 dù principal đó đã bị thu hồi.
    expect((await request(app.getHttpServer()).get(`/api/users/${user.userId}`)).status).toBe(200);
    expect((await request(app.getHttpServer()).get('/api/health')).status).toBe(200);
  });

  it('khoá mốc thu hồi có TTL = jwt.accessTtl (tự tiêu, không phình vô hạn)', async () => {
    const user = await mkUser('ttl');
    await revocation.revokeAllForUser(user.userId);

    const ttl = await redis.getClient().ttl(`authrev:${user.userId}`);
    const accessTtl = config.get<number>('jwt.accessTtl') ?? 900;
    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(accessTtl);
  });

  it('Redis lỗi khi kiểm tra thu hồi -> FAIL CLOSED 401 (không quay về chỉ tin chữ ký)', async () => {
    const user = await mkUser('fail_closed');
    expect((await getMe(user.accessToken)).status).toBe(200);

    // Mô phỏng sự cố hạ tầng ở ĐÚNG chỗ guard đọc; các khoá khác vẫn hoạt động bình thường.
    const client = redis.getClient();
    const original = client.get.bind(client);
    const spy = jest
      .spyOn(client, 'get')
      .mockImplementation(async (...args: Parameters<typeof original>) => {
        if (typeof args[0] === 'string' && args[0].startsWith('authrev:')) {
          throw new Error('simulated redis outage');
        }
        return original(...args);
      });

    try {
      // Chữ ký token vẫn hợp lệ — nhưng không xác minh được trạng thái thu hồi thì TỪ CHỐI.
      expect((await getMe(user.accessToken)).status).toBe(401);
    } finally {
      spy.mockRestore();
    }

    // Redis phục hồi -> token hợp lệ dùng lại bình thường (fail-closed không "dính" trạng thái).
    expect((await getMe(user.accessToken)).status).toBe(200);
  });
});
