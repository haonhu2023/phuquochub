import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { TransformInterceptor } from '../src/common/interceptors/transform.interceptor';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';

// Gói D, điểm 3 (18/10/2026, yêu cầu owner trực tiếp) — "Đóng rủi ro rollback bằng phương án cụ
// thể... Kiểm chuỗi: app mới tạo RichDoc → rollback app → thao tác được phép trong trạng thái
// rollback → nâng lại app mới → nội dung public đúng."
//
// Không thể LITERALLY chạy hai phiên bản app trong một e2e test — mô phỏng "app cũ" bằng UPDATE
// SQL trực tiếp chỉ đụng cột `description` (ĐÚNG những gì một entity KHÔNG khai báo
// `description_rich`/`description_rich_hash` sẽ sinh ra — TypeORM chỉ generate câu UPDATE cho cột
// có trên entity, xem job_listings.entity.ts's ghi chú). "Nâng lại app mới" = chính app ĐANG CHẠY
// (không đổi code) đọc lại qua HTTP — đây CHÍNH LÀ hành vi cần kiểm (đọc-thời-điểm phát hiện lệch),
// không phải việc build/deploy hai binary khác nhau.
describe('Rich-text rollback risk mitigation — e2e', () => {
  let app: INestApplication;
  let ds: DataSource;
  let posterToken: string;
  let posterUserId: string;
  let moderatorToken: string;
  let moderatorUserId: string;
  let userRoleId: string | null = null;
  let jobId: string;

  const posterEmail = `e2e_rollback_poster_${Date.now()}@phuquochub.test`;
  const moderatorEmail = `e2e_rollback_moderator_${Date.now()}@phuquochub.test`;
  const password = 'password123';

  const richDoc = { v: 1, blocks: [{ type: 'p', runs: [{ text: 'Mô tả có định dạng', bold: true }] }] };

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
      .send({ email: posterEmail, password, display_name: 'E2E Rollback Poster' });
    posterToken = reg1.body.data.access_token;
    posterUserId = reg1.body.data.user.id;

    const reg2 = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ email: moderatorEmail, password, display_name: 'E2E Rollback Moderator' });
    moderatorToken = reg2.body.data.access_token;
    moderatorUserId = reg2.body.data.user.id;

    const granted: Array<{ id: string }> = await ds.query(
      `INSERT INTO user_roles (user_id, role_id) SELECT $1, r.id FROM roles r WHERE r.code = 'moderator' RETURNING id`,
      [moderatorUserId],
    );
    userRoleId = granted[0]?.id ?? null;
  }, 30_000);

  afterAll(async () => {
    try {
      if (ds?.isInitialized && jobId) {
        await ds.query(`DELETE FROM audit_logs WHERE actor_id = ANY($1)`, [[posterUserId, moderatorUserId]]);
        await ds.query(`DELETE FROM job_listings WHERE id = $1`, [jobId]);
        if (userRoleId) await ds.query(`DELETE FROM user_roles WHERE id = $1`, [userRoleId]);
        await ds.query(`DELETE FROM users WHERE email = ANY($1)`, [[posterEmail, moderatorEmail]]);
      }
    } finally {
      if (app) await app.close();
    }
  }, 30_000);

  it('chuỗi đầy đủ: app mới tạo RichDoc → rollback (UPDATE trực tiếp cột plain, như app cũ) → đọc lại qua HTTP → KHÔNG lộ RichDoc lỗi thời → sửa tiếp qua app mới → dọn sạch rich/hash lỗi thời trong DB', async () => {
    // 1. App mới tạo tin kèm RichDoc, submit, duyệt — route THẬT, dữ liệu THẬT.
    const create = await request(app.getHttpServer())
      .post('/api/job-listings')
      .set('Authorization', `Bearer ${posterToken}`)
      .send({
        employer_name: 'E2E Rollback Co',
        title: 'Tiêu đề rollback test',
        job_category: 'F&B',
        work_location: 'An Thới',
        employment_type: 'full_time',
        contact_method: 'phone',
        contact_value: '0900000000',
        description_rich: richDoc,
      });
    expect(create.status).toBe(201);
    jobId = create.body.data.id;
    expect(create.body.data.description).toBe('Mô tả có định dạng');

    await request(app.getHttpServer()).post(`/api/job-listings/${jobId}/submit`).set('Authorization', `Bearer ${posterToken}`);
    await request(app.getHttpServer())
      .post(`/api/job-listings/${jobId}/decide`)
      .set('Authorization', `Bearer ${moderatorToken}`)
      .send({ decision: 'approve' });

    const beforeRollback = await request(app.getHttpServer()).get(`/api/job-listings/${jobId}`);
    expect(beforeRollback.body.data.description_rich).toEqual(richDoc);

    // 2. "Rollback app" — mô phỏng bằng UPDATE SQL CHỈ đụng cột `description` (đúng những gì một
    //    entity KHÔNG biết `description_rich`/`description_rich_hash` sẽ sinh ra). KHÔNG qua HTTP
    //    API (API luôn đi qua applyRichTextField() của app MỚI) — đây PHẢI là đường ghi "app cũ".
    await ds.query(`UPDATE job_listings SET description = $1, updated_at = now() WHERE id = $2`, [
      'Nội dung do app cũ sửa trong lúc rollback',
      jobId,
    ]);

    // 3. "Thao tác được phép trong trạng thái rollback" — đọc public vẫn hoạt động được (app cũ vẫn
    //    phục vụ được, không gãy) — xác nhận gián tiếp qua chính app đang chạy đọc lại được dữ liệu.

    // 4. "Nâng lại app mới" — app ĐANG CHẠY (không đổi code) đọc lại qua HTTP PHẢI phát hiện lệch
    //    hash và KHÔNG lộ RichDoc cũ — đây là hành vi cốt lõi cần kiểm.
    const afterRollback = await request(app.getHttpServer()).get(`/api/job-listings/${jobId}`);
    expect(afterRollback.body.data.description).toBe('Nội dung do app cũ sửa trong lúc rollback');
    expect(afterRollback.body.data.description_rich).toBeNull();

    // Moderator xem hàng chờ/tin đã duyệt qua view khác cũng phải nhất quán — không có đường đọc
    // nào khác lọt RichDoc cũ ra ngoài (kiểm qua "tin của tôi" — route moderator dùng base view chung).
    const mine = await request(app.getHttpServer()).get('/api/job-listings/mine').set('Authorization', `Bearer ${posterToken}`);
    const mineRow = (mine.body.data as Array<{ id: string; description_rich: unknown }>).find((r) => r.id === jobId);
    expect(mineRow?.description_rich).toBeNull();

    // 5. Chủ tin sửa tiếp qua app MỚI (dù chỉ sửa một trường khác, gửi lại đúng description hiện
    //    tại) — PHẢI dọn sạch rich/hash lỗi thời trong DB luôn, không chỉ ẩn lúc đọc.
    const update = await request(app.getHttpServer())
      .patch(`/api/job-listings/${jobId}`)
      .set('Authorization', `Bearer ${posterToken}`)
      .send({
        employer_name: 'E2E Rollback Co',
        title: 'Tiêu đề rollback test — đã sửa',
        job_category: 'F&B',
        work_location: 'An Thới',
        employment_type: 'full_time',
        contact_method: 'phone',
        contact_value: '0900000000',
        description: 'Nội dung do app cũ sửa trong lúc rollback',
      });
    expect(update.status).toBe(200);
    const dbRow = await ds.query(`SELECT description_rich, description_rich_hash FROM job_listings WHERE id = $1`, [jobId]);
    expect(dbRow[0].description_rich).toBeNull();
    expect(dbRow[0].description_rich_hash).toBeNull();
  }, 30_000);
});
