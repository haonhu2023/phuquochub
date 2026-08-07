import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { TransformInterceptor } from '../src/common/interceptors/transform.interceptor';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { RedisService } from '../src/core/redis/redis.service';
import { TokenService } from '../src/modules/auth/token.service';

// H-5 (Production Readiness Audit, 2026-08-07) — phát hiện TÁI DÙNG refresh token đã tiêu thụ +
// thu hồi theo family, kiểm chứng trên Redis + Postgres THẬT qua HTTP thật. Cần
// `docker compose up -d postgres redis` + migration đã chạy.
//
// KHÔNG dùng `POST /auth/register`/`/auth/login` để dựng fixture (bị `@Throttle` giới hạn thật) —
// cùng khuôn đã có ở `auth-token-revocation.e2e-spec.ts`/`auth-audit.e2e-spec.ts`: INSERT user bằng
// SQL rồi cấp token bằng chính `TokenService` mà app dùng (chỉ mục Redis được ghi y như luồng thật).
// `/auth/refresh` KHÔNG nằm dưới auth-throttle riêng đủ hẹp để va giới hạn trong suite này.
describe('H-5 Refresh token reuse detection & family revocation (live Postgres + Redis)', () => {
  let app: INestApplication;
  let ds: DataSource;
  let redis: RedisService;
  let tokens: TokenService;
  let config: ConfigService;

  const userIds: string[] = [];

  /** Chờ tới đầu giây kế tiếp — H-1's `authrev:{userId}` có độ phân giải 1 giây (xem ADR-016). */
  function nextSecond(): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, 1050 - (Date.now() % 1000)));
  }

  async function mkUser(label: string) {
    const email = `e2e_h5_${label}_${Date.now()}_${Math.random().toString(36).slice(2)}@phuquochub.test`;
    const rows: Array<{ id: string }> = await ds.query(
      `INSERT INTO users (email, display_name, password_hash, is_active)
       VALUES ($1, $2, $3, true) RETURNING id`,
      [email, `H5 ${label}`, 'not-a-real-hash'],
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

  function getMe(accessToken: string) {
    return request(app.getHttpServer())
      .get('/api/users/me')
      .set('Authorization', `Bearer ${accessToken}`);
  }

  function refresh(refreshToken: string) {
    return request(app.getHttpServer()).post('/api/auth/refresh').send({ refresh_token: refreshToken });
  }

  async function latestAudit(event: string, actorId: string) {
    const rows = await ds.query(
      `SELECT * FROM audit_logs WHERE event = $1 AND actor_id = $2 ORDER BY created_at DESC LIMIT 1`,
      [event, actorId],
    );
    return rows[0];
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
    tokens = app.get(TokenService);
    config = app.get(ConfigService);
  }, 60_000);

  // Teardown hang fix (2026-08-07, kế thừa từ H-1/H-3/H-4): dọn dẹp PHẢI nằm trong `try` — lỗi giữa
  // chừng KHÔNG được phép chặn `app.close()` (finally luôn chạy), và KHÔNG nuốt lỗi dọn dẹp bằng
  // `.catch()` — để một lần chạy hỏng thất bại RÕ RÀNG thay vì Jest treo âm thầm.
  afterAll(async () => {
    try {
      if (redis && userIds.length) {
        const client = redis.getClient();
        for (const id of userIds) {
          const familyIds = await client.smembers(`refresh:user:families:${id}`);
          const keysToDelete = [
            `authrev:${id}`,
            `refresh:user:${id}`,
            `refresh:user:families:${id}`,
            ...familyIds.map((fam) => `refresh:family:${fam}:revoked`),
          ];
          await client.del(...keysToDelete);
        }
      }
      if (ds?.isInitialized && userIds.length) {
        await ds.query(`DELETE FROM user_roles WHERE user_id = ANY($1)`, [userIds]);
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

  // Kịch bản 10 bước bắt buộc (Phase 7): login (mint) -> refresh OK -> replay token CŨ -> 401 ->
  // dùng descendant MỚI NHẤT -> chứng minh nó CŨNG bị thu hồi -> chứng minh access token cũ bị H-1
  // thu hồi -> xác nhận audit -> user KHÁC không bị ảnh hưởng -> xác nhận dọn dẹp/residue Redis.
  it('kịch bản đầy đủ: tái dùng refresh token đã tiêu thụ -> thu hồi CẢ family lẫn access token', async () => {
    // (1) "login": cấp bộ token gốc qua TokenService (gia đình MỚI được sinh).
    const user = await mkUser('scenario');
    const dbUser = { id: user.userId, email: user.email } as Parameters<typeof tokens.issueTokens>[0];
    const original = await tokens.issueTokens(dbUser);
    expect((await getMe(original.accessToken)).status).toBe(200);

    // H-1's `authrev:{userId}` có độ phân giải 1 GIÂY: một access token cấp CÙNG GIÂY với lệnh thu
    // hồi sẽ KHÔNG bị thu hồi (giới hạn nội tại, có chủ đích — xem ADR-016/AuthRevocationService).
    // Chờ qua ranh giới giây TRƯỚC KHI kích hoạt thu hồi (bước 3 dưới) — không phải thủ thuật làm
    // test xanh, mà là điều kiện CẦN để phép so sánh `iat < revokedAtSec` có ý nghĩa xác định.
    await nextSecond();

    // (2) refresh THÀNH CÔNG — chuỗi xoay vòng bình thường không bị cơ chế mới làm hỏng.
    const first = await refresh(original.refreshToken);
    expect(first.status).toBe(200);
    const gen2 = { access_token: first.body.data.access_token, refresh_token: first.body.data.refresh_token };
    expect((await getMe(gen2.access_token)).status).toBe(200);

    await nextSecond(); // cùng lý do — gen2.access_token cũng phải cấp TRƯỚC ranh giới giây thu hồi.

    // (3)+(4) REPLAY refresh token GỐC (đã tiêu thụ ở bước 2) -> 401 (tái dùng bị phát hiện). Chính
    // TẠI ĐÂY `AuthService.refresh()` gọi `authRevocation.revokeAllForUser()` (H-1) — mốc thu hồi
    // được ghi ở giây HIỆN TẠI, sau cả hai `nextSecond()` ở trên.
    const replay = await refresh(original.refreshToken);
    expect(replay.status).toBe(401);
    expect(replay.body.success).toBe(false);

    // (5)+(6) descendant MỚI NHẤT (gen2, hợp lệ và CHƯA từng dùng) giờ CŨNG bị chặn — chứng minh
    // toàn bộ FAMILY bị thu hồi, không chỉ riêng jti bị phát lại.
    const gen2Refresh = await refresh(gen2.refresh_token);
    expect(gen2Refresh.status).toBe(401);

    // (7) access token CŨ (gốc lẫn gen2) bị thu hồi qua H-1 — cả hai được cấp TRƯỚC mốc thu hồi (đã
    // đảm bảo bằng hai `nextSecond()` ở trên) nên đây là một so sánh XÁC ĐỊNH, không phải may rủi.
    expect((await getMe(original.accessToken)).status).toBe(401);
    expect((await getMe(gen2.access_token)).status).toBe(401);

    // (8) audit: đúng MỘT `auth.refresh.reuse_detected`, actor/entity = user, family_id có mặt,
    // KHÔNG rò rỉ token/secret nào trong context.
    const reuseAudit = await latestAudit('auth.refresh.reuse_detected', user.userId);
    expect(reuseAudit).toBeDefined();
    expect(reuseAudit.entity_id).toBe(user.userId);
    expect(reuseAudit.result).toBe('failure');
    expect(reuseAudit.context.family_id).toEqual(expect.any(String));
    expect(JSON.stringify(reuseAudit)).not.toContain(original.refreshToken);
    expect(JSON.stringify(reuseAudit)).not.toContain(gen2.refresh_token);
    expect(JSON.stringify(reuseAudit)).not.toContain(original.accessToken);

    // (9) user KHÁC hoàn toàn không bị ảnh hưởng (thu hồi đúng phạm vi MỘT user/family).
    const bystander = await mkUser('bystander');
    const bystanderTokens = await tokens.issueTokens({
      id: bystander.userId,
      email: bystander.email,
    } as Parameters<typeof tokens.issueTokens>[0]);
    expect((await getMe(bystanderTokens.accessToken)).status).toBe(200);
    const bystanderRefresh = await refresh(bystanderTokens.refreshToken);
    expect(bystanderRefresh.status).toBe(200);

    // (10) dọn dẹp/residue: sau khi family bị thu hồi, khoá family-revoked THẬT SỰ tồn tại trên
    // Redis với TTL bị chặn (bounded — không phình vô hạn), và chỉ mục ACTIVE jti của user gốc
    // không còn giữ bất kỳ jti nào (cả hai generation đều đã bị rút khỏi chỉ mục active khi tiêu
    // thụ, dù bị reject).
    const client = redis.getClient();
    const familyIds = await client.smembers(`refresh:user:families:${user.userId}`);
    expect(familyIds.length).toBeGreaterThan(0);
    for (const fam of familyIds) {
      const ttl = await client.ttl(`refresh:family:${fam}:revoked`);
      expect(ttl).toBeGreaterThan(0);
      const refreshTtl = config.get<number>('jwt.refreshTtl') ?? 1209600;
      expect(ttl).toBeLessThanOrEqual(refreshTtl);
    }
    expect(await client.smembers(`refresh:user:${user.userId}`)).toEqual([]);
  });

  it('CONCURRENCY: hai refresh đồng thời CÙNG một refresh token — đúng MỘT xoay vòng sống sót, gia đình bị coi là compromise', async () => {
    const user = await mkUser('concurrent');
    const dbUser = { id: user.userId, email: user.email } as Parameters<typeof tokens.issueTokens>[0];
    const issued = await tokens.issueTokens(dbUser);
    // Đảm bảo mốc thu hồi H-1 (sẽ được đặt TRONG lúc xử lý race bên dưới) rơi vào giây SAU giây cấp
    // `issued.accessToken` — cùng lý do độ phân giải 1 giây đã giải thích ở kịch bản chính phía trên.
    await nextSecond();

    const [resA, resB] = await Promise.all([refresh(issued.refreshToken), refresh(issued.refreshToken)]);

    // Lua EVAL atomic (xem token.service.ts) đảm bảo Redis chạy toàn bộ script tiêu thụ như MỘT đơn
    // vị không thể chia cắt — không có khoảng hở cho CẢ HAI request cùng thấy "active". Kết quả PHẢI
    // luôn LÀ đúng một 200 + một 401, không có tổ hợp nào khác (không 200+200, không 401+401).
    const statuses = [resA.status, resB.status].sort();
    expect(statuses).toEqual([200, 401]);

    const winner = resA.status === 200 ? resA : resB;
    const winnerRefreshToken: string = winner.body.data.refresh_token;

    // Chính sách xử lý race ĐÃ CHỌN (nêu thẳng, có chủ đích): Redis không thể phân biệt "client B
    // gọi lại do double-click/retry mạng" khỏi "kẻ tấn công đang đua với chủ sở hữu hợp pháp" — cả
    // hai đều biểu hiện y hệt nhau (hai request đồng thời cùng một refresh token). Vì vậy NHÁNH THUA
    // được xử lý CHÍNH XÁC như một lần tái dùng thật: family bị thu hồi NGAY (bên trong script, atomic),
    // bất kể nhánh thắng có phải là request hợp pháp hay không. Đây là lựa chọn an toàn-là-mặc-định
    // (revoke-over-allow), cùng triết lý với các nhà cung cấp refresh-token-rotation khác — được coi
    // là false positive CHẤP NHẬN ĐƯỢC, không phải lỗi.
    //
    // Chứng minh "no two valid descendants survive" KHÔNG phụ thuộc độ phân giải giây của H-1: dùng
    // LẠI refresh token của CHÍNH bên thắng — bị chặn NGAY vì family đã chết, dù token đó chưa từng
    // được dùng lần hai theo nghĩa thông thường (chứng minh đơn vị bị thu hồi là FAMILY, không phải
    // từng token riêng lẻ).
    const replayWinner = await refresh(winnerRefreshToken);
    expect(replayWinner.status).toBe(401);

    // H-1: access token GỐC (cấp TRƯỚC race, một giây trước mốc thu hồi nhờ `nextSecond()` ở trên)
    // bị thu hồi — so sánh XÁC ĐỊNH, không phụ thuộc thời điểm chính xác của race.
    expect((await getMe(issued.accessToken)).status).toBe(401);
    // GHI NHẬN TRUNG THỰC một giới hạn kế thừa từ H-1 (KHÔNG kiểm ở đây, vì không thể làm xác định):
    // access token của NHÁNH THẮNG được cấp ngay TRONG lúc race — cùng khoảnh khắc (rất có thể cùng
    // GIÂY) với lúc nhánh THUA đặt mốc thu hồi H-1 ở phía server. Độ phân giải 1 giây của H-1
    // (ADR-016, có chủ đích — token cấp CÙNG giây với lệnh thu hồi KHÔNG bị thu hồi) khiến kết quả
    // của phép so sánh NÀY phụ thuộc đồng hồ thật, không xác định được bằng test — không phải lỗi
    // của H-5, mà là giới hạn ĐÃ CÓ từ H-1 lộ ra rõ hơn trong đúng kịch bản đua này. Vòng đời của
    // family/refresh-token (đã chứng minh XÁC ĐỊNH bằng `replayWinner` ở trên) mới là cơ chế đóng
    // vòng lặp một cách chắc chắn, bất kể độ chi tiết đồng hồ.

    // Đúng MỘT sự kiện reuse_detected cho gia đình này — nhánh THUA đi qua đường reuse (kích hoạt
    // audit), nhánh THẮNG đi qua auth.refresh.success bình thường (KHÔNG audit reuse trùng lặp).
    const reuseEvents = await ds.query(
      `SELECT * FROM audit_logs WHERE event = 'auth.refresh.reuse_detected' AND actor_id = $1`,
      [user.userId],
    );
    expect(reuseEvents).toHaveLength(1);
  });
});
