import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { TransformInterceptor } from '../src/common/interceptors/transform.interceptor';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';

// M3 (Media Decision Workflow, ADR-018 T2). CẦN Postgres + Redis thật + migration InitModeration/
// SeedModerationPermissions đã chạy. Media/case/report dùng ở đây đều DISPOSABLE — chèn thẳng qua
// `ds.query` (không có endpoint tạo case ngoài decide() ở M3) và XOÁ SẠCH ở afterAll.
describe('Moderation Media Decision Workflow (e2e)', () => {
  let app: INestApplication;
  let ds: DataSource;
  let memberToken: string;
  let moderatorToken: string;
  let moderatorUserId: string;
  let uploaderUserId: string;
  let uploaderToken: string;

  const mediaIds: string[] = [];
  const caseIds: string[] = [];
  let grantedUserRoleId: string | null = null;

  const memberEmail = `e2e_moddec_member_${Date.now()}@phuquochub.test`;
  const moderatorEmail = `e2e_moddec_moderator_${Date.now()}@phuquochub.test`;
  const uploaderEmail = `e2e_moddec_uploader_${Date.now()}@phuquochub.test`;
  const password = 'password123';

  let mediaFixtureCounter = 0;

  // uq idx_media_uploader_checksum(uploaded_by, checksum_sha256) đòi checksum KHÁC NHAU cho mỗi
  // fixture của CÙNG một uploader — không thể tái dùng một chuỗi cố định như file media.e2e-spec.ts
  // (chỉ tạo 1-2 dòng mỗi test riêng biệt); file này tạo NHIỀU dòng cho CÙNG uploaderUserId.
  function uniqueChecksum(): string {
    mediaFixtureCounter += 1;
    return mediaFixtureCounter.toString().padStart(64, '0');
  }

  async function insertMedia(status: string): Promise<string> {
    const rows: Array<{ id: string }> = await ds.query(
      `INSERT INTO media (type, provider, status, uploaded_by, object_key, bucket, content_type, size_bytes, checksum_sha256)
       VALUES ('image', 'upload', $1, $2, $3, 'phuquochub-test', 'image/jpeg', 100, $4)
       RETURNING id`,
      [status, uploaderUserId, `media/e2e-moddec-${Date.now()}-${Math.random()}.jpg`, uniqueChecksum()],
    );
    mediaIds.push(rows[0].id);
    return rows[0].id;
  }

  async function insertOpenCase(mediaId: string): Promise<string> {
    const rows: Array<{ id: string }> = await ds.query(
      `INSERT INTO moderation_cases (target_type, target_id, status, source, severity, priority)
       VALUES ('media', $1, 'open', 'new_content', 'normal', 10)
       RETURNING id`,
      [mediaId],
    );
    caseIds.push(rows[0].id);
    return rows[0].id;
  }

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
      .send({ email: memberEmail, password, display_name: 'E2E ModDec Member' });
    memberToken = reg1.body.data.access_token;

    const reg2 = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ email: moderatorEmail, password, display_name: 'E2E ModDec Moderator' });
    moderatorToken = reg2.body.data.access_token;
    moderatorUserId = reg2.body.data.user.id;

    const reg3 = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ email: uploaderEmail, password, display_name: 'E2E ModDec Uploader' });
    uploaderToken = reg3.body.data.access_token;
    uploaderUserId = reg3.body.data.user.id;
    void uploaderToken; // giữ lại cho tính đối xứng dù chưa test presign thật ở file này

    const granted: Array<{ id: string }> = await ds.query(
      `INSERT INTO user_roles (user_id, role_id)
       SELECT $1, r.id FROM roles r WHERE r.code = 'moderator'
       RETURNING id`,
      [moderatorUserId],
    );
    grantedUserRoleId = granted[0]?.id ?? null;
  }, 30_000);

  // Teardown hang fix (2026-08-07): dọn dẹp trong `try` — nếu một bước ném lỗi, `finally` vẫn đảm
  // bảo `app.close()` chạy (không thì Nest/TypeORM giữ handle mở, Jest treo sau khi in kết quả).
  // KHÔNG nuốt lỗi bằng `.catch()`: lỗi dọn dẹp vẫn nổi lên sau `finally`.
  afterAll(async () => {
    try {
      if (ds?.isInitialized) {
        if (caseIds.length) await ds.query(`DELETE FROM moderation_cases WHERE id = ANY($1)`, [caseIds]);
        if (mediaIds.length) await ds.query(`DELETE FROM media WHERE id = ANY($1)`, [mediaIds]);
        if (grantedUserRoleId) await ds.query(`DELETE FROM user_roles WHERE id = $1`, [grantedUserRoleId]);
        await ds.query(`DELETE FROM audit_logs WHERE event = 'moderation.decided' AND entity_id = ANY($1)`, [
          mediaIds.length ? mediaIds : ['00000000-0000-0000-0000-000000000000'],
        ]);
      }
    } finally {
      if (app) await app.close();
    }
  });

  describe('Authorization', () => {
    it('không token -> 401', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/moderation/cases/00000000-0000-4000-8000-000000000000/decide')
        .send({ decision: 'approve' });
      expect(res.status).toBe(401);
    });

    it('member (không có Media.Moderate) -> 403', async () => {
      const mediaId = await insertMedia('pending');
      const caseId = await insertOpenCase(mediaId);

      const res = await request(app.getHttpServer())
        .post(`/api/moderation/cases/${caseId}/decide`)
        .set('Authorization', `Bearer ${memberToken}`)
        .send({ decision: 'approve' });

      expect(res.status).toBe(403);
    });
  });

  describe('pending -> published (approve)', () => {
    it('moderator approve -> 200, media published, case resolved, audit ghi lại', async () => {
      const mediaId = await insertMedia('pending');
      const caseId = await insertOpenCase(mediaId);

      const res = await request(app.getHttpServer())
        .post(`/api/moderation/cases/${caseId}/decide`)
        .set('Authorization', `Bearer ${moderatorToken}`)
        .send({ decision: 'approve' });

      expect(res.status).toBe(200);

      const [media]: Array<{ status: string }> = await ds.query('SELECT status FROM media WHERE id = $1', [mediaId]);
      expect(media.status).toBe('published');

      const [caseRow]: Array<{ status: string; decision: string; resolved_by: string }> = await ds.query(
        'SELECT status, decision, resolved_by FROM moderation_cases WHERE id = $1',
        [caseId],
      );
      expect(caseRow.status).toBe('resolved');
      expect(caseRow.decision).toBe('approve');
      expect(caseRow.resolved_by).toBe(moderatorUserId);

      const auditRows: Array<{ event: string }> = await ds.query(
        `SELECT event FROM audit_logs WHERE event = 'moderation.decided' AND entity_id = $1`,
        [mediaId],
      );
      expect(auditRows.length).toBeGreaterThanOrEqual(1);
    });

    // Controlled Media Rejection Reason (2026-08-12) — approve không đòi hỏi reason_code (khác
    // reject), và KHÔNG được âm thầm chấp nhận reason_code nếu ai đó gửi kèm nhầm.
    it('approve kèm reason_code -> 422 (reason_code chỉ áp dụng cho reject)', async () => {
      const mediaId = await insertMedia('pending');
      const caseId = await insertOpenCase(mediaId);

      const res = await request(app.getHttpServer())
        .post(`/api/moderation/cases/${caseId}/decide`)
        .set('Authorization', `Bearer ${moderatorToken}`)
        .send({ decision: 'approve', reason_code: 'low_quality' });

      expect(res.status).toBe(422);
      const [media]: Array<{ status: string }> = await ds.query('SELECT status FROM media WHERE id = $1', [mediaId]);
      expect(media.status).toBe('pending');
    });
  });

  describe('pending -> rejected (reject)', () => {
    it('thiếu reason -> 400 (DTO) hoặc 422 (business rule) — không đổi status', async () => {
      const mediaId = await insertMedia('pending');
      const caseId = await insertOpenCase(mediaId);

      const res = await request(app.getHttpServer())
        .post(`/api/moderation/cases/${caseId}/decide`)
        .set('Authorization', `Bearer ${moderatorToken}`)
        .send({ decision: 'reject' });

      expect(res.status).toBe(422);
      const [media]: Array<{ status: string }> = await ds.query('SELECT status FROM media WHERE id = $1', [mediaId]);
      expect(media.status).toBe('pending');
    });

    it('kèm reason -> 200, media rejected', async () => {
      const mediaId = await insertMedia('pending');
      const caseId = await insertOpenCase(mediaId);

      const res = await request(app.getHttpServer())
        .post(`/api/moderation/cases/${caseId}/decide`)
        .set('Authorization', `Bearer ${moderatorToken}`)
        .send({ decision: 'reject', reason: 'nội dung không liên quan', reason_code: 'unrelated_to_place' });

      expect(res.status).toBe(200);
      const [media]: Array<{ status: string }> = await ds.query('SELECT status FROM media WHERE id = $1', [mediaId]);
      expect(media.status).toBe('rejected');
    });

    // Controlled Media Rejection Reason (2026-08-12) — reject bắt buộc reason_code, tách khỏi
    // kiểm tra reason (INV-11) ở test phía trên.
    it('kèm reason nhưng THIẾU reason_code -> 422, KHÔNG đổi status', async () => {
      const mediaId = await insertMedia('pending');
      const caseId = await insertOpenCase(mediaId);

      const res = await request(app.getHttpServer())
        .post(`/api/moderation/cases/${caseId}/decide`)
        .set('Authorization', `Bearer ${moderatorToken}`)
        .send({ decision: 'reject', reason: 'nội dung không liên quan' });

      expect(res.status).toBe(422);
      const [media]: Array<{ status: string }> = await ds.query('SELECT status FROM media WHERE id = $1', [mediaId]);
      expect(media.status).toBe('pending');
    });

    it('reason_code không thuộc media_moderation_reason_code -> 400 (DTO validation)', async () => {
      const mediaId = await insertMedia('pending');
      const caseId = await insertOpenCase(mediaId);

      const res = await request(app.getHttpServer())
        .post(`/api/moderation/cases/${caseId}/decide`)
        .set('Authorization', `Bearer ${moderatorToken}`)
        .send({ decision: 'reject', reason: 'x', reason_code: 'not_a_real_code' });

      expect(res.status).toBe(400);
      const [media]: Array<{ status: string }> = await ds.query('SELECT status FROM media WHERE id = $1', [mediaId]);
      expect(media.status).toBe('pending');
    });
  });

  describe('published -> hidden (hide)', () => {
    it('moderator hide kèm reason -> 200, media hidden (KHÔNG cần reason_code)', async () => {
      const mediaId = await insertMedia('published');
      const caseId = await insertOpenCase(mediaId);

      const res = await request(app.getHttpServer())
        .post(`/api/moderation/cases/${caseId}/decide`)
        .set('Authorization', `Bearer ${moderatorToken}`)
        .send({ decision: 'hide', reason: 'vi phạm chính sách' });

      expect(res.status).toBe(200);
      const [media]: Array<{ status: string }> = await ds.query('SELECT status FROM media WHERE id = $1', [mediaId]);
      expect(media.status).toBe('hidden');
    });

    // Controlled Media Rejection Reason (2026-08-12) — reason_code CHỈ có nghĩa với reject; gửi
    // kèm hide (dù hide cũng gỡ nội dung khỏi công khai) bị từ chối tường minh, không âm thầm bỏ qua.
    it('hide kèm reason_code -> 422 (reason_code chỉ áp dụng cho reject)', async () => {
      const mediaId = await insertMedia('published');
      const caseId = await insertOpenCase(mediaId);

      const res = await request(app.getHttpServer())
        .post(`/api/moderation/cases/${caseId}/decide`)
        .set('Authorization', `Bearer ${moderatorToken}`)
        .send({ decision: 'hide', reason: 'vi phạm chính sách', reason_code: 'low_quality' });

      expect(res.status).toBe(422);
      const [media]: Array<{ status: string }> = await ds.query('SELECT status FROM media WHERE id = $1', [mediaId]);
      expect(media.status).toBe('published');
    });
  });

  describe('hidden -> restore', () => {
    it('KHÔNG kèm target_status -> 422 (INV-10, không đoán)', async () => {
      const mediaId = await insertMedia('hidden');
      const caseId = await insertOpenCase(mediaId);

      const res = await request(app.getHttpServer())
        .post(`/api/moderation/cases/${caseId}/decide`)
        .set('Authorization', `Bearer ${moderatorToken}`)
        .send({ decision: 'restore' });

      expect(res.status).toBe(422);
    });

    it('kèm target_status=published -> 200, media published trở lại', async () => {
      const mediaId = await insertMedia('hidden');
      const caseId = await insertOpenCase(mediaId);

      const res = await request(app.getHttpServer())
        .post(`/api/moderation/cases/${caseId}/decide`)
        .set('Authorization', `Bearer ${moderatorToken}`)
        .send({ decision: 'restore', target_status: 'published' });

      expect(res.status).toBe(200);
      const [media]: Array<{ status: string }> = await ds.query('SELECT status FROM media WHERE id = $1', [mediaId]);
      expect(media.status).toBe('published');
    });
  });

  describe('Chuyển trạng thái không hợp lệ', () => {
    it('published + reject -> 422 (INV-13), KHÔNG đổi status', async () => {
      const mediaId = await insertMedia('published');
      const caseId = await insertOpenCase(mediaId);

      // reason + reason_code ĐẦY ĐỦ ở đây để 422 chắc chắn đến từ FSM (INV-13), không bị nhầm với
      // 422 "thiếu reason_code" (một quy tắc khác, đã có test riêng ở trên).
      const res = await request(app.getHttpServer())
        .post(`/api/moderation/cases/${caseId}/decide`)
        .set('Authorization', `Bearer ${moderatorToken}`)
        .send({ decision: 'reject', reason: 'lý do', reason_code: 'other' });

      expect(res.status).toBe(422);
      const [media]: Array<{ status: string }> = await ds.query('SELECT status FROM media WHERE id = $1', [mediaId]);
      expect(media.status).toBe('published');
    });
  });

  describe('Case không tồn tại / đã xử lý', () => {
    it('case_id không tồn tại -> 404', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/moderation/cases/00000000-0000-4000-8000-0000000000ff/decide')
        .set('Authorization', `Bearer ${moderatorToken}`)
        .send({ decision: 'approve' });
      expect(res.status).toBe(404);
    });

    it('case đã resolved -> 409 khi quyết định lần hai', async () => {
      const mediaId = await insertMedia('pending');
      const caseId = await insertOpenCase(mediaId);

      const first = await request(app.getHttpServer())
        .post(`/api/moderation/cases/${caseId}/decide`)
        .set('Authorization', `Bearer ${moderatorToken}`)
        .send({ decision: 'approve' });
      expect(first.status).toBe(200);

      const second = await request(app.getHttpServer())
        .post(`/api/moderation/cases/${caseId}/decide`)
        .set('Authorization', `Bearer ${moderatorToken}`)
        .send({ decision: 'approve' });
      expect(second.status).toBe(409);
    });
  });

  describe('INV-12: không tự kiểm duyệt', () => {
    it('moderator là chính người upload media -> 403', async () => {
      const rows: Array<{ id: string }> = await ds.query(
        `INSERT INTO media (type, provider, status, uploaded_by, object_key, bucket, content_type, size_bytes, checksum_sha256)
         VALUES ('image', 'upload', 'pending', $1, $2, 'phuquochub-test', 'image/jpeg', 100, repeat('a', 64))
         RETURNING id`,
        [moderatorUserId, `media/e2e-moddec-self-${Date.now()}.jpg`],
      );
      const selfMediaId = rows[0].id;
      mediaIds.push(selfMediaId);
      const caseId = await insertOpenCase(selfMediaId);

      const res = await request(app.getHttpServer())
        .post(`/api/moderation/cases/${caseId}/decide`)
        .set('Authorization', `Bearer ${moderatorToken}`)
        .send({ decision: 'approve' });

      expect(res.status).toBe(403);
      const [media]: Array<{ status: string }> = await ds.query('SELECT status FROM media WHERE id = $1', [
        selfMediaId,
      ]);
      expect(media.status).toBe('pending');
    });
  });

  describe('dismiss', () => {
    it('decision=dismiss -> 200, case dismissed, media KHÔNG đổi status', async () => {
      const mediaId = await insertMedia('pending');
      const caseId = await insertOpenCase(mediaId);

      const res = await request(app.getHttpServer())
        .post(`/api/moderation/cases/${caseId}/decide`)
        .set('Authorization', `Bearer ${moderatorToken}`)
        .send({ decision: 'dismiss', reason: 'report vô căn cứ' });

      expect(res.status).toBe(200);
      const [media]: Array<{ status: string }> = await ds.query('SELECT status FROM media WHERE id = $1', [mediaId]);
      expect(media.status).toBe('pending');
      const [caseRow]: Array<{ status: string }> = await ds.query(
        'SELECT status FROM moderation_cases WHERE id = $1',
        [caseId],
      );
      expect(caseRow.status).toBe('dismissed');
    });
  });
});
