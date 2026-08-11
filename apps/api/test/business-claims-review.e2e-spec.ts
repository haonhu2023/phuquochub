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

// Hàng đợi DUYỆT claim (GET /business-claims, GET /business-claims/{id}, POST /{id}/decide) —
// đường `Business.Verify`. File RIÊNG khỏi business-claims.e2e-spec.ts vì file đó đã dùng ĐÚNG hết
// ngân sách `@Throttle 10/60s` của POST /business-claims (đếm tường minh ở đầu file đó); cùng lý do
// business-claims-mine.e2e-spec.ts đã tách ra trước đây.
//
// Ở ĐÂY claim được seed THẲNG bằng SQL (không gọi submit) — file này kiểm chứng phía DUYỆT, không
// phải phía gửi, nên không tiêu tốn ngân sách submit nào.
//
// Trọng tâm: (1) ba endpoint đều đóng đúng với anonymous/non-moderator; (2) hàng đợi trả TÊN cơ sở/
// người yêu cầu đọc-được (không có route tra place theo UUID nên thiếu enrichment này thì màn hình
// duyệt vô dụng); (3) `evidence` CHỈ lộ ở detail, KHÔNG lộ ở hàng đợi; (4) email người yêu cầu
// KHÔNG lộ ở bất kỳ đâu; (5) approve thật sự cấp quyền quản lý (owner journey được mở khoá).
describe('Business Claim Review queue (live Postgres)', () => {
  let app: INestApplication;
  let ds: DataSource;
  let jwt: JwtService;
  let config: ConfigService;
  let categoryId: string;

  const userIds: string[] = [];
  const placeIds: string[] = [];
  const sourceIds: string[] = [];

  async function createUser(label: string, displayName?: string) {
    const email = `e2e_claimrev_${label}_${Date.now()}_${Math.random().toString(36).slice(2)}@phuquochub.test`;
    const rows: Array<{ id: string }> = await ds.query(
      `INSERT INTO users (email, display_name) VALUES ($1, $2) RETURNING id`,
      [email, displayName ?? `Claim Review E2E ${label}`],
    );
    const userId = rows[0].id;
    userIds.push(userId);
    const accessTtl = config.get<number>('jwt.accessTtl') ?? 900;
    const accessToken = await jwt.signAsync(
      { sub: userId, email, type: 'access' },
      { secret: config.get<string>('jwt.accessSecret'), expiresIn: accessTtl },
    );
    return { accessToken, userId, email };
  }

  async function assignRole(userId: string, roleCode: string): Promise<void> {
    const [{ id: roleId }] = await ds.query(`SELECT id FROM roles WHERE code = $1`, [roleCode]);
    await ds.query(
      `INSERT INTO user_roles (user_id, role_id, scope_type, business_id) VALUES ($1, $2, 'global', NULL)`,
      [userId, roleId],
    );
  }

  async function createMember(label: string) {
    const u = await createUser(label);
    await assignRole(u.userId, 'member');
    return u;
  }

  async function createModerator(label: string) {
    const u = await createUser(label);
    await assignRole(u.userId, 'moderator');
    return u;
  }

  async function mkPlace(label: string, name?: string): Promise<string> {
    const rows: Array<{ id: string }> = await ds.query(
      `INSERT INTO places (name, slug, category_id, location, status)
       VALUES ($1, $2, $3, ST_SetSRID(ST_MakePoint(103.9, 10.2), 4326)::geography, 'published')
       RETURNING id`,
      [
        name ?? `E2E Claim Review ${label}`,
        `e2e-claimrev-${label}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        categoryId,
      ],
    );
    placeIds.push(rows[0].id);
    return rows[0].id;
  }

  /** Claim `pending` seed THẲNG bằng SQL — không đi qua POST (giữ nguyên ngân sách throttle submit). */
  async function seedClaim(
    placeId: string,
    requesterId: string,
    evidence: Array<Record<string, string>> = [{ type: 'business_license', reference: 'GP-E2E-1' }],
  ): Promise<string> {
    const rows: Array<{ id: string }> = await ds.query(
      `INSERT INTO business_claims (place_id, requester_id, evidence, status)
       VALUES ($1, $2, $3, 'pending') RETURNING id`,
      [placeId, requesterId, JSON.stringify(evidence)],
    );
    return rows[0].id;
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
    jwt = app.get(JwtService);
    config = app.get(ConfigService);

    const [{ id }] = await ds.query(`SELECT id FROM categories LIMIT 1`);
    categoryId = id;
  }, 60_000);

  // Cùng thứ tự dọn dẹp đã kiểm chứng ở business-claims.e2e-spec.ts (user_roles -> places ->
  // sources -> audit_logs -> users), trong `try` để `finally { app.close() }` luôn chạy.
  afterAll(async () => {
    try {
      if (ds?.isInitialized) {
        if (userIds.length || placeIds.length) {
          await ds.query(
            `DELETE FROM wiki_revisions WHERE editor_id = ANY($1) OR (entity_type = 'place' AND entity_id = ANY($2))`,
            [userIds, placeIds],
          );
        }
        if (userIds.length) await ds.query(`DELETE FROM user_roles WHERE user_id = ANY($1)`, [userIds]);
        // places CASCADE -> business_claims/business_members/verifications/verification_events.
        if (placeIds.length) await ds.query(`DELETE FROM places WHERE id = ANY($1)`, [placeIds]);
        if (sourceIds.length) await ds.query(`DELETE FROM sources WHERE id = ANY($1)`, [sourceIds]);
        if (userIds.length) {
          await ds.query(`DELETE FROM audit_logs WHERE actor_id = ANY($1) AND event LIKE 'business.claim_%'`, [
            userIds,
          ]);
          await ds.query(`DELETE FROM users WHERE id = ANY($1)`, [userIds]);
        }
      }
    } finally {
      if (app) await app.close();
    }
  }, 30_000);

  describe('Xác thực & phân quyền (Business.Verify)', () => {
    it('anonymous -> 401 trên cả list, detail và decide', async () => {
      const placeId = await mkPlace('anon');
      const requester = await createMember('anon_req');
      const claimId = await seedClaim(placeId, requester.userId);

      const list = await request(app.getHttpServer()).get('/api/business-claims');
      expect(list.status).toBe(401);

      const detail = await request(app.getHttpServer()).get(`/api/business-claims/${claimId}`);
      expect(detail.status).toBe(401);

      const decide = await request(app.getHttpServer())
        .post(`/api/business-claims/${claimId}/decide`)
        .send({ decision: 'approve' });
      expect(decide.status).toBe(401);
    });

    it('member thường (không Business.Verify) -> 403 trên cả list, detail và decide', async () => {
      const placeId = await mkPlace('member403');
      const requester = await createMember('member403_req');
      const claimId = await seedClaim(placeId, requester.userId);
      const member = await createMember('member403_actor');

      const list = await request(app.getHttpServer())
        .get('/api/business-claims')
        .set('Authorization', `Bearer ${member.accessToken}`);
      expect(list.status).toBe(403);

      const detail = await request(app.getHttpServer())
        .get(`/api/business-claims/${claimId}`)
        .set('Authorization', `Bearer ${member.accessToken}`);
      expect(detail.status).toBe(403);

      const decide = await request(app.getHttpServer())
        .post(`/api/business-claims/${claimId}/decide`)
        .set('Authorization', `Bearer ${member.accessToken}`)
        .send({ decision: 'approve' });
      expect(decide.status).toBe(403);

      // Claim KHÔNG bị đụng tới.
      const [row] = await ds.query(`SELECT status FROM business_claims WHERE id = $1`, [claimId]);
      expect(row.status).toBe('pending');
    });

    // Chính requester KHÔNG được tự duyệt claim của mình, kể cả khi họ có Business.Verify.
    it('moderator tự duyệt claim CỦA CHÍNH MÌNH -> 403, claim vẫn pending', async () => {
      const placeId = await mkPlace('selfverify');
      const moderator = await createModerator('selfverify_mod');
      const claimId = await seedClaim(placeId, moderator.userId);

      const res = await request(app.getHttpServer())
        .post(`/api/business-claims/${claimId}/decide`)
        .set('Authorization', `Bearer ${moderator.accessToken}`)
        .send({ decision: 'approve' });
      expect(res.status).toBe(403);

      const [row] = await ds.query(`SELECT status FROM business_claims WHERE id = $1`, [claimId]);
      expect(row.status).toBe('pending');
    });
  });

  describe('GET /business-claims (hàng đợi)', () => {
    it('trả tên cơ sở + tên người yêu cầu đọc-được, KHÔNG evidence, KHÔNG email', async () => {
      const placeName = `E2E Queue Place ${Date.now()}`;
      const placeId = await mkPlace('queue', placeName);
      const requester = await createUser('queue_req', 'Nguyễn Thị Hàng Đợi');
      const claimId = await seedClaim(placeId, requester.userId);
      const moderator = await createModerator('queue_mod');

      const res = await request(app.getHttpServer())
        .get(`/api/business-claims?place_id=${placeId}`)
        .set('Authorization', `Bearer ${moderator.accessToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
      const item = res.body.data[0];
      expect(item).toMatchObject({
        id: claimId,
        place_id: placeId,
        place_name: placeName,
        requester_id: requester.userId,
        requester_display_name: 'Nguyễn Thị Hàng Đợi',
        status: 'pending',
      });
      expect(item.place_slug).toEqual(expect.any(String));

      // Bằng chứng riêng tư KHÔNG lộ ở hàng đợi; email người yêu cầu không lộ ở bất kỳ đâu.
      expect(item).not.toHaveProperty('evidence');
      expect(JSON.stringify(res.body)).not.toContain(requester.email);
      expect(JSON.stringify(res.body)).not.toContain('GP-E2E-1');

      // Envelope phân trang thật.
      expect(res.body.meta).toMatchObject({ page: 1, total: 1, totalPages: 1 });
    });

    it('lọc theo status: claim pending KHÔNG xuất hiện khi lọc approved', async () => {
      const placeId = await mkPlace('filter');
      const requester = await createMember('filter_req');
      const claimId = await seedClaim(placeId, requester.userId);
      const moderator = await createModerator('filter_mod');

      const approved = await request(app.getHttpServer())
        .get(`/api/business-claims?place_id=${placeId}&status=approved`)
        .set('Authorization', `Bearer ${moderator.accessToken}`);
      expect(approved.status).toBe(200);
      expect(approved.body.data).toEqual([]);

      const pending = await request(app.getHttpServer())
        .get(`/api/business-claims?place_id=${placeId}&status=pending`)
        .set('Authorization', `Bearer ${moderator.accessToken}`);
      expect(pending.body.data.map((c: { id: string }) => c.id)).toEqual([claimId]);
    });

    it('status không thuộc enum -> 400 (không im lặng bỏ qua bộ lọc)', async () => {
      const moderator = await createModerator('badfilter_mod');
      const res = await request(app.getHttpServer())
        .get('/api/business-claims?status=not-a-status')
        .set('Authorization', `Bearer ${moderator.accessToken}`);
      expect(res.status).toBe(400);
    });
  });

  describe('GET /business-claims/{id} (chi tiết)', () => {
    it('moderator -> 200 kèm evidence VÀ tên cơ sở/người yêu cầu, KHÔNG email', async () => {
      const placeName = `E2E Detail Place ${Date.now()}`;
      const placeId = await mkPlace('detail', placeName);
      const requester = await createUser('detail_req', 'Lê Văn Chi Tiết');
      const claimId = await seedClaim(placeId, requester.userId, [
        { type: 'business_license', reference: 'GP-DETAIL-9', note: 'bản sao' },
      ]);
      const moderator = await createModerator('detail_mod');

      const res = await request(app.getHttpServer())
        .get(`/api/business-claims/${claimId}`)
        .set('Authorization', `Bearer ${moderator.accessToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({
        id: claimId,
        place_name: placeName,
        requester_display_name: 'Lê Văn Chi Tiết',
        status: 'pending',
      });
      expect(res.body.data.evidence).toEqual([
        { type: 'business_license', reference: 'GP-DETAIL-9', note: 'bản sao' },
      ]);
      expect(JSON.stringify(res.body)).not.toContain(requester.email);
    });

    it('claim không tồn tại -> 404', async () => {
      const moderator = await createModerator('detail404_mod');
      const res = await request(app.getHttpServer())
        .get('/api/business-claims/00000000-0000-4000-8000-000000000000')
        .set('Authorization', `Bearer ${moderator.accessToken}`);
      expect(res.status).toBe(404);
    });
  });

  describe('POST /business-claims/{id}/decide', () => {
    it('reject KHÔNG kèm reason_code -> 422, claim vẫn pending', async () => {
      const placeId = await mkPlace('rejectnoreason');
      const requester = await createMember('rejectnoreason_req');
      const claimId = await seedClaim(placeId, requester.userId);
      const moderator = await createModerator('rejectnoreason_mod');

      const res = await request(app.getHttpServer())
        .post(`/api/business-claims/${claimId}/decide`)
        .set('Authorization', `Bearer ${moderator.accessToken}`)
        .send({ decision: 'reject' });
      expect(res.status).toBe(422);

      const [row] = await ds.query(`SELECT status FROM business_claims WHERE id = $1`, [claimId]);
      expect(row.status).toBe('pending');
    });

    it('reject kèm reason_code -> 200, ghi đúng reviewer/reason, KHÔNG cấp quyền nào', async () => {
      const placeId = await mkPlace('reject');
      const requester = await createMember('reject_req');
      const claimId = await seedClaim(placeId, requester.userId);
      const moderator = await createModerator('reject_mod');

      const res = await request(app.getHttpServer())
        .post(`/api/business-claims/${claimId}/decide`)
        .set('Authorization', `Bearer ${moderator.accessToken}`)
        .send({ decision: 'reject', reason_code: 'insufficient_evidence' });
      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('rejected');

      const [row] = await ds.query(
        `SELECT status, reviewer_id, reason_code, decided_at FROM business_claims WHERE id = $1`,
        [claimId],
      );
      expect(row.status).toBe('rejected');
      expect(row.reviewer_id).toBe(moderator.userId);
      expect(row.reason_code).toBe('insufficient_evidence');
      expect(row.decided_at).not.toBeNull();

      const members = await ds.query(`SELECT 1 FROM business_members WHERE place_id = $1`, [placeId]);
      expect(members).toHaveLength(0);
    });

    // Đây là điều kiện MỞ KHOÁ toàn bộ hành trình chủ cơ sở: approve phải thật sự cấp quyền quản lý.
    it('approve -> 200, cấp owner THẬT (business_members + user_roles) và chủ mới sửa được cơ sở', async () => {
      const placeId = await mkPlace('approve');
      const requester = await createMember('approve_req');
      const claimId = await seedClaim(placeId, requester.userId);
      const moderator = await createModerator('approve_mod');

      // Trước khi duyệt: người yêu cầu KHÔNG sửa được cơ sở.
      const before = await request(app.getHttpServer())
        .patch(`/api/places/${placeId}`)
        .set('Authorization', `Bearer ${requester.accessToken}`)
        .send({ name: 'KHÔNG ĐƯỢC ÁP DỤNG' });
      expect(before.status).toBe(403);

      const res = await request(app.getHttpServer())
        .post(`/api/business-claims/${claimId}/decide`)
        .set('Authorization', `Bearer ${moderator.accessToken}`)
        .send({ decision: 'approve' });
      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('approved');

      const members = await ds.query(
        `SELECT role, revoked_at FROM business_members WHERE place_id = $1 AND user_id = $2`,
        [placeId, requester.userId],
      );
      expect(members).toHaveLength(1);
      expect(members[0].role).toBe('owner');
      expect(members[0].revoked_at).toBeNull();

      const grants = await ds.query(
        `SELECT ur.scope_type, ur.business_id FROM user_roles ur JOIN roles r ON r.id = ur.role_id
          WHERE ur.user_id = $1 AND r.code = 'business_owner' AND ur.revoked_at IS NULL`,
        [requester.userId],
      );
      expect(grants).toHaveLength(1);
      expect(grants[0].scope_type).toBe('managed');
      expect(grants[0].business_id).toBe(placeId);

      // Sau khi duyệt: chủ mới sửa được ĐÚNG cơ sở của mình — hành trình chủ cơ sở đã mở khoá.
      const after = await request(app.getHttpServer())
        .patch(`/api/places/${placeId}`)
        .set('Authorization', `Bearer ${requester.accessToken}`)
        .send({ name: 'Đã được chủ cơ sở cập nhật' });
      expect(after.status).toBe(200);

      // Track source do approve sinh ra để afterAll dọn sạch (sources KHÔNG cascade từ places).
      const srcRows = await ds.query(
        `SELECT source_id FROM verifications WHERE place_id = $1 AND source_id IS NOT NULL`,
        [placeId],
      );
      for (const r of srcRows) sourceIds.push(r.source_id);
    });

    it('quyết định lần hai trên claim đã xử lý -> 422 (FSM), trạng thái KHÔNG đổi', async () => {
      const placeId = await mkPlace('twice');
      const requester = await createMember('twice_req');
      const claimId = await seedClaim(placeId, requester.userId);
      const moderator = await createModerator('twice_mod');

      const first = await request(app.getHttpServer())
        .post(`/api/business-claims/${claimId}/decide`)
        .set('Authorization', `Bearer ${moderator.accessToken}`)
        .send({ decision: 'reject', reason_code: 'duplicate' });
      expect(first.status).toBe(200);

      const second = await request(app.getHttpServer())
        .post(`/api/business-claims/${claimId}/decide`)
        .set('Authorization', `Bearer ${moderator.accessToken}`)
        .send({ decision: 'approve' });
      expect(second.status).toBe(422);

      const [row] = await ds.query(`SELECT status FROM business_claims WHERE id = $1`, [claimId]);
      expect(row.status).toBe('rejected');
    });

    it('decision không thuộc enum -> 400', async () => {
      const placeId = await mkPlace('baddecision');
      const requester = await createMember('baddecision_req');
      const claimId = await seedClaim(placeId, requester.userId);
      const moderator = await createModerator('baddecision_mod');

      const res = await request(app.getHttpServer())
        .post(`/api/business-claims/${claimId}/decide`)
        .set('Authorization', `Bearer ${moderator.accessToken}`)
        .send({ decision: 'dispute' }); // dispute là kết quả TỰ ĐỘNG, không phải lựa chọn hợp lệ
      expect(res.status).toBe(400);
    });
  });
});
