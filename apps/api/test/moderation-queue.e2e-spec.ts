import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { TransformInterceptor } from '../src/common/interceptors/transform.interceptor';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';

// M2 (Moderation Queue Read API, ADR-018/moderation-design.md §9). CẦN Postgres + Redis thật +
// migration InitModeration/SeedModerationPermissions đã chạy. Toàn bộ dữ liệu moderation_cases/
// reports/user_roles dùng ở đây là DISPOSABLE — chèn thẳng qua `ds.query` (không có endpoint tạo
// case/report nào tồn tại ở M2; đó là M3/M5) và XOÁ SẠCH ở afterAll.
describe('Moderation Queue Read API (e2e)', () => {
  let app: INestApplication;
  let ds: DataSource;
  let memberToken: string;
  let moderatorToken: string;
  let moderatorUserId: string;

  const caseIds: string[] = [];
  const reportIds: string[] = [];
  let grantedUserRoleId: string | null = null;

  const memberEmail = `e2e_modq_member_${Date.now()}@phuquochub.test`;
  const moderatorEmail = `e2e_modq_moderator_${Date.now()}@phuquochub.test`;
  const password = 'password123';

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    app.useGlobalInterceptors(new TransformInterceptor());
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();

    ds = app.get<DataSource>(getDataSourceToken());

    const reg1 = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ email: memberEmail, password, display_name: 'E2E ModQ Member' });
    memberToken = reg1.body.data.access_token;

    const reg2 = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ email: moderatorEmail, password, display_name: 'E2E ModQ Moderator' });
    moderatorToken = reg2.body.data.access_token;
    moderatorUserId = reg2.body.data.user.id;

    // Cấp role `moderator` trực tiếp (không endpoint gán role phù hợp cho e2e nhanh gọn — cùng
    // tinh thần "safe test SQL" của Phase 6). scope_type mặc định 'global' (đủ cho Any, O6).
    const granted: Array<{ id: string }> = await ds.query(
      `INSERT INTO user_roles (user_id, role_id)
       SELECT $1, r.id FROM roles r WHERE r.code = 'moderator'
       RETURNING id`,
      [moderatorUserId],
    );
    grantedUserRoleId = granted[0]?.id ?? null;

    // Fixture: nhiều status/target_type/severity/source/assigned khác nhau — đủ để test mọi filter
    // + kết hợp filter + sắp xếp. target_id là uuid giả (target preview found=false có chủ đích).
    const rows: Array<{ id: string }> = await ds.query(
      `INSERT INTO moderation_cases (target_type, target_id, status, source, severity, priority, assigned_to)
       VALUES
         ('media', $1, 'open', 'new_content', 'low', 0, NULL),
         ('media', $2, 'open', 'report', 'high', 35, NULL),
         ('review', $3, 'claimed', 'ai_flag', 'critical', 60, $4),
         ('review', $5, 'resolved', 'manual', 'normal', 10, NULL)
       RETURNING id`,
      [
        '00000000-0000-4000-8000-000000000001',
        '00000000-0000-4000-8000-000000000002',
        '00000000-0000-4000-8000-000000000003',
        moderatorUserId,
        '00000000-0000-4000-8000-000000000004',
      ],
    );
    caseIds.push(...rows.map((r) => r.id));

    // Một report gắn với case thứ 2 (media/report/high) — test reports[] trên detail endpoint.
    const rep: Array<{ id: string }> = await ds.query(
      `INSERT INTO reports (case_id, target_type, target_id, reporter_id, reason, description)
       VALUES ($1, 'media', $2, $3, 'spam', 'quảng cáo spam')
       RETURNING id`,
      [caseIds[1], `00000000-0000-4000-8000-000000000002`, moderatorUserId],
    );
    reportIds.push(...rep.map((r) => r.id));
  }, 30_000);

  // Teardown hang fix (2026-08-07): dọn dẹp trong `try` — nếu một bước ném lỗi, `finally` vẫn đảm
  // bảo `app.close()` chạy (không thì Nest/TypeORM giữ handle mở, Jest treo sau khi in kết quả).
  // KHÔNG nuốt lỗi bằng `.catch()`: lỗi dọn dẹp vẫn nổi lên sau `finally`.
  afterAll(async () => {
    try {
      if (ds?.isInitialized) {
        if (reportIds.length) await ds.query(`DELETE FROM reports WHERE id = ANY($1)`, [reportIds]);
        if (caseIds.length) await ds.query(`DELETE FROM moderation_cases WHERE id = ANY($1)`, [caseIds]);
        if (grantedUserRoleId) await ds.query(`DELETE FROM user_roles WHERE id = $1`, [grantedUserRoleId]);
      }
    } finally {
      if (app) await app.close();
    }
  });

  describe('Authorization', () => {
    it('không token -> GET /api/moderation/cases = 401', async () => {
      const res = await request(app.getHttpServer()).get('/api/moderation/cases');
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('member (không có Moderation.Queue.View) -> 403', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/moderation/cases')
        .set('Authorization', `Bearer ${memberToken}`);
      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('member -> GET /api/moderation/cases/:id cũng 403 (cưỡng chế trên cả hai route)', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/moderation/cases/${caseIds[0]}`)
        .set('Authorization', `Bearer ${memberToken}`);
      expect(res.status).toBe(403);
    });

    it('moderator -> GET /api/moderation/cases = 200', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/moderation/cases')
        .set('Authorization', `Bearer ${moderatorToken}`);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('moderator -> GET /api/moderation/cases/:id = 200', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/moderation/cases/${caseIds[0]}`)
        .set('Authorization', `Bearer ${moderatorToken}`);
      expect(res.status).toBe(200);
      expect(res.body.data.id).toBe(caseIds[0]);
    });
  });

  describe('GET /api/moderation/cases — filters, sort, pagination', () => {
    it('không status -> mặc định chỉ open/claimed (loại resolved)', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/moderation/cases')
        .set('Authorization', `Bearer ${moderatorToken}`);
      const ids: string[] = res.body.data.map((c: { id: string }) => c.id);
      expect(ids).not.toContain(caseIds[3]); // resolved
    });

    it('status=resolved -> chỉ trả case resolved (xem lịch sử)', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/moderation/cases?status=resolved')
        .set('Authorization', `Bearer ${moderatorToken}`);
      const ids: string[] = res.body.data.map((c: { id: string }) => c.id);
      expect(ids).toContain(caseIds[3]);
      expect(ids).not.toContain(caseIds[0]);
    });

    it('kết hợp filter target_type=review & severity=critical -> chỉ khớp đúng case thứ 3', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/moderation/cases?target_type=review&severity=critical')
        .set('Authorization', `Bearer ${moderatorToken}`);
      const ids: string[] = res.body.data.map((c: { id: string }) => c.id);
      expect(ids).toContain(caseIds[2]);
      expect(ids).not.toContain(caseIds[0]);
      expect(ids).not.toContain(caseIds[1]);
    });

    it('assigned_to lọc đúng case đã giao cho moderator', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/moderation/cases?assigned_to=${moderatorUserId}`)
        .set('Authorization', `Bearer ${moderatorToken}`);
      const ids: string[] = res.body.data.map((c: { id: string }) => c.id);
      expect(ids).toEqual([caseIds[2]]);
    });

    it('sắp xếp priority DESC (case severity=high/critical lên trước case severity=low)', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/moderation/cases?target_type=media')
        .set('Authorization', `Bearer ${moderatorToken}`);
      const ours = res.body.data.filter((c: { id: string }) => caseIds.slice(0, 2).includes(c.id));
      expect(ours[0].id).toBe(caseIds[1]); // priority 35 (high)
      expect(ours[1].id).toBe(caseIds[0]); // priority 0 (low)
    });

    it('phong bì phân trang đúng shape (data/meta.page/pageSize/total/totalPages)', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/moderation/cases?limit=1&page=1')
        .set('Authorization', `Bearer ${moderatorToken}`);
      expect(res.body.data.length).toBeLessThanOrEqual(1);
      expect(res.body.meta).toEqual(
        expect.objectContaining({ page: 1, pageSize: 1, total: expect.any(Number), totalPages: expect.any(Number) }),
      );
    });

    it('status không hợp lệ -> 400 (không phát minh giá trị enum)', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/moderation/cases?status=archived')
        .set('Authorization', `Bearer ${moderatorToken}`);
      expect(res.status).toBe(400);
    });
  });

  describe('GET /api/moderation/cases/:id — detail', () => {
    it('case không tồn tại -> 404', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/moderation/cases/00000000-0000-4000-8000-0000000000ff')
        .set('Authorization', `Bearer ${moderatorToken}`);
      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });

    it('id không phải UUID -> 400', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/moderation/cases/not-a-uuid')
        .set('Authorization', `Bearer ${moderatorToken}`);
      expect(res.status).toBe(400);
    });

    it('trả về reports[] gắn với case (reporter_id có mặt — moderator-only view)', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/moderation/cases/${caseIds[1]}`)
        .set('Authorization', `Bearer ${moderatorToken}`);
      expect(res.body.data.reports).toHaveLength(1);
      expect(res.body.data.reports[0].reporter_id).toBe(moderatorUserId);
      expect(res.body.data.reports[0].reason).toBe('spam');
    });

    it('KHÔNG lộ tên/email người báo cáo (chỉ reporter_id, không join users)', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/moderation/cases/${caseIds[1]}`)
        .set('Authorization', `Bearer ${moderatorToken}`);
      const report = res.body.data.reports[0];
      expect(report).not.toHaveProperty('reporter_email');
      expect(report).not.toHaveProperty('reporter_name');
      expect(report).not.toHaveProperty('reporter_display_name');
      expect(JSON.stringify(res.body)).not.toContain(moderatorEmail);
    });

    it('target_id giả (không tồn tại thật) -> target_preview.found = false, KHÔNG 500', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/moderation/cases/${caseIds[0]}`)
        .set('Authorization', `Bearer ${moderatorToken}`);
      expect(res.status).toBe(200);
      expect(res.body.data.target_preview.found).toBe(false);
    });

    it('KHÔNG lộ ai_score/ai_labels (ngoài phạm vi AI của M2)', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/moderation/cases/${caseIds[0]}`)
        .set('Authorization', `Bearer ${moderatorToken}`);
      expect(res.body.data).not.toHaveProperty('ai_score');
      expect(res.body.data).not.toHaveProperty('ai_labels');
    });
  });

  describe('Không có mutation nào từ đường đọc', () => {
    it('GET list + GET detail nhiều lần không đổi status/updated_at của case', async () => {
      const before: Array<{ status: string; updated_at: Date }> = await ds.query(
        `SELECT status, updated_at FROM moderation_cases WHERE id = $1`,
        [caseIds[0]],
      );

      await request(app.getHttpServer())
        .get('/api/moderation/cases')
        .set('Authorization', `Bearer ${moderatorToken}`);
      await request(app.getHttpServer())
        .get(`/api/moderation/cases/${caseIds[0]}`)
        .set('Authorization', `Bearer ${moderatorToken}`);
      await request(app.getHttpServer())
        .get(`/api/moderation/cases/${caseIds[0]}`)
        .set('Authorization', `Bearer ${moderatorToken}`);

      const after: Array<{ status: string; updated_at: Date }> = await ds.query(
        `SELECT status, updated_at FROM moderation_cases WHERE id = $1`,
        [caseIds[0]],
      );
      expect(after[0].status).toBe(before[0].status);
      expect(new Date(after[0].updated_at).getTime()).toBe(new Date(before[0].updated_at).getTime());
    });

    it('số dòng reports không đổi sau nhiều lần đọc', async () => {
      const before: Array<{ count: string }> = await ds.query(`SELECT count(*)::int AS count FROM reports`);
      await request(app.getHttpServer())
        .get(`/api/moderation/cases/${caseIds[1]}`)
        .set('Authorization', `Bearer ${moderatorToken}`);
      const after: Array<{ count: string }> = await ds.query(`SELECT count(*)::int AS count FROM reports`);
      expect(after[0].count).toBe(before[0].count);
    });
  });
});
