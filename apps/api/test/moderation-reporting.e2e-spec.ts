import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { TransformInterceptor } from '../src/common/interceptors/transform.interceptor';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';

// M5 (User Reporting, ADR-018 T3). CẦN Postgres thật + migration InitModeration/
// SeedModerationPermissions đã chạy. Review/media/case/report/place đều DISPOSABLE — chèn thẳng
// qua `ds.query` (không có endpoint tạo review/media published tối giản khác phù hợp cho mục đích
// này) và XOÁ SẠCH ở afterAll. `member` (role mặc định của mọi user đăng ký) đã có `Report.Create`
// từ M1 (SeedRbac) — không cần cấp quyền riêng cho test này.
//
// Reporter là một NHÓM CỐ ĐỊNH đăng ký MỘT LẦN ở beforeAll (không phải mỗi test tự đăng ký thêm) —
// POST /api/auth/register bị giới hạn 10 request/phút. "Tác giả" của review/media bị báo cáo KHÔNG
// BAO GIỜ cần đăng nhập nên được chèn thẳng qua SQL (cùng tiền lệ createDisposableReviewer() của
// moderation-review-decision.e2e-spec.ts, M4).
//
// QUAN TRỌNG: `POST /reviews/{id}/report` và `POST /media/{id}/report` MỖI route tự giới hạn
// 5 request/phút (moderation-design.md §8.2, throttle theo route+IP — mọi request trong file này
// cùng IP nên CHUNG một ngân sách cho mỗi route bất kể test nào gọi). Mỗi describe dưới đây được
// thiết kế để KHÔNG VƯỢT 5 lệnh gọi THỰC vào từng route trong TOÀN BỘ file — cùng nguyên tắc đã
// ghi ở media.e2e-spec.ts cho presign() (10/phút): "giữ số lần gọi trong suite dưới ngưỡng throttle"
// — KHÔNG bypass/nới lỏng throttle chỉ để test chạy qua.
describe('Moderation Reporting Workflow (e2e)', () => {
  let app: INestApplication;
  let ds: DataSource;
  let placeId: string;
  let categoryId: string;
  let reporterTokens: string[] = [];

  const reviewIds: string[] = [];
  const mediaIds: string[] = [];
  const caseIds: string[] = [];
  const authorUserIds: string[] = [];

  let authorFixtureCounter = 0;

  async function createDisposableAuthor(): Promise<string> {
    authorFixtureCounter += 1;
    const rows: Array<{ id: string }> = await ds.query(
      `INSERT INTO users (email, display_name) VALUES ($1, 'E2E Reporting Author') RETURNING id`,
      [`e2e_reporting_author_${Date.now()}_${authorFixtureCounter}@phuquochub.test`],
    );
    authorUserIds.push(rows[0].id);
    return rows[0].id;
  }

  async function insertReview(status: string): Promise<string> {
    const authorId = await createDisposableAuthor();
    const rows: Array<{ id: string }> = await ds.query(
      `INSERT INTO reviews (place_id, user_id, rating, content, status)
       VALUES ($1, $2, 5, 'e2e reporting fixture', $3) RETURNING id`,
      [placeId, authorId, status],
    );
    reviewIds.push(rows[0].id);
    return rows[0].id;
  }

  async function insertMedia(status: string): Promise<string> {
    const authorId = await createDisposableAuthor();
    const rows: Array<{ id: string }> = await ds.query(
      `INSERT INTO media (type, provider, status, uploaded_by, object_key, bucket, content_type, size_bytes, checksum_sha256)
       VALUES ('image', 'upload', $1, $2, $3, 'phuquochub-test', 'image/jpeg', 100, $4)
       RETURNING id`,
      [
        status,
        authorId,
        `media/e2e-reporting-${Date.now()}-${Math.random()}.jpg`,
        Math.random().toString().padStart(64, '0').slice(0, 64),
      ],
    );
    mediaIds.push(rows[0].id);
    return rows[0].id;
  }

  function reportReview(token: string, reviewId: string, body: Record<string, unknown>) {
    return request(app.getHttpServer())
      .post(`/api/reviews/${reviewId}/report`)
      .set('Authorization', `Bearer ${token}`)
      .send(body);
  }

  function reportMedia(token: string, mediaId: string, body: Record<string, unknown>) {
    return request(app.getHttpServer())
      .post(`/api/media/${mediaId}/report`)
      .set('Authorization', `Bearer ${token}`)
      .send(body);
  }

  async function fetchCaseForTarget(targetType: string, targetId: string) {
    return ds.query(
      `SELECT id, status, source, severity, priority, report_count FROM moderation_cases
       WHERE target_type = $1 AND target_id = $2`,
      [targetType, targetId],
    );
  }

  async function fetchAuditRows(entityType: string, entityId: string): Promise<Array<{ event: string }>> {
    return ds.query(`SELECT event FROM audit_logs WHERE entity_type = $1 AND entity_id = $2 AND event = 'report.created'`, [
      entityType,
      entityId,
    ]);
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

    const [{ id: catId }] = await ds.query(`SELECT id FROM categories LIMIT 1`);
    categoryId = catId;
    const placeRows: Array<{ id: string }> = await ds.query(
      `INSERT INTO places (name, slug, category_id, location, status)
       VALUES ('E2E Reporting Place', $1, $2, ST_SetSRID(ST_MakePoint(103.9, 10.2), 4326)::geography, 'published')
       RETURNING id`,
      [`e2e-reporting-place-${Date.now()}`, categoryId],
    );
    placeId = placeRows[0].id;

    // Nhóm reporter CỐ ĐỊNH, đăng ký MỘT LẦN — xem giải thích ở đầu file.
    const registrations = await Promise.all(
      Array.from({ length: 4 }, (_, i) =>
        request(app.getHttpServer())
          .post('/api/auth/register')
          .send({
            email: `e2e_reporting_pool_${Date.now()}_${i}@phuquochub.test`,
            password: 'password123',
            display_name: `E2E Reporting Pool ${i}`,
          }),
      ),
    );
    reporterTokens = registrations.map((r) => r.body.data.access_token as string);
  }, 30_000);

  afterAll(async () => {
    if (ds?.isInitialized) {
      if (caseIds.length) await ds.query(`DELETE FROM moderation_cases WHERE id = ANY($1)`, [caseIds]);
      await ds.query(`DELETE FROM audit_logs WHERE event = 'report.created'`);
      if (reviewIds.length) await ds.query(`DELETE FROM reviews WHERE id = ANY($1)`, [reviewIds]);
      if (mediaIds.length) await ds.query(`DELETE FROM media WHERE id = ANY($1)`, [mediaIds]);
      if (placeId) await ds.query(`DELETE FROM places WHERE id = $1`, [placeId]);
      if (authorUserIds.length) await ds.query(`DELETE FROM users WHERE id = ANY($1)`, [authorUserIds]);
      // Reporter pool accounts (via /api/auth/register) deliberately NOT deleted — this repo's
      // existing e2e convention never deletes registered accounts (see
      // moderation-review-decision.e2e-spec.ts).
    }
    if (app) await app.close();
  });

  // Toàn bộ T3 (case mới -> tái sử dụng -> escalation -> chống trùng) trong MỘT test, đúng 5 lệnh
  // gọi tới POST /reviews/{id}/report — hết đúng ngân sách 5/phút của route này trong CẢ FILE.
  it('review: case mới -> tái sử dụng (report_count tăng) -> escalation (severity=high ở report thứ 3) -> chống report trùng (409, không mutation thêm)', async () => {
    const reviewId = await insertReview('published');

    // Lệnh gọi 1/5: report đầu tiên -> case MỚI.
    const res1 = await reportReview(reporterTokens[0], reviewId, { reason: 'spam', description: 'quảng cáo trá hình' });
    expect(res1.status).toBe(201);

    let cases = await fetchCaseForTarget('review', reviewId);
    expect(cases).toHaveLength(1);
    caseIds.push(cases[0].id);
    expect(cases[0].status).toBe('open');
    expect(cases[0].source).toBe('report');
    expect(cases[0].severity).toBe('normal');
    expect(Number(cases[0].priority)).toBe(10);
    expect(cases[0].report_count).toBe(1);

    const reportRows: Array<{ reason: string; description: string | null }> = await ds.query(
      `SELECT reason, description FROM reports WHERE case_id = $1`,
      [cases[0].id],
    );
    expect(reportRows).toHaveLength(1);
    expect(reportRows[0].reason).toBe('spam');
    expect(reportRows[0].description).toBe('quảng cáo trá hình');

    const audits = await fetchAuditRows('review', reviewId);
    expect(audits.length).toBeGreaterThanOrEqual(1);

    // Lệnh gọi 2/5: reporter KHÁC báo cáo CÙNG review -> tái sử dụng case (INV-3, không tạo thêm).
    const res2 = await reportReview(reporterTokens[1], reviewId, { reason: 'irrelevant' });
    expect(res2.status).toBe(201);

    cases = await fetchCaseForTarget('review', reviewId);
    expect(cases).toHaveLength(1); // vẫn đúng 1 case
    expect(cases[0].report_count).toBe(2);
    expect(cases[0].severity).toBe('normal'); // chưa tới ngưỡng 3

    // Lệnh gọi 3/5: reporter thứ 3 -> report_count=3 -> severity nâng lên high (ngưỡng O3).
    const res3 = await reportReview(reporterTokens[2], reviewId, { reason: 'spam' });
    expect(res3.status).toBe(201);

    cases = await fetchCaseForTarget('review', reviewId);
    expect(cases).toHaveLength(1);
    expect(cases[0].report_count).toBe(3);
    expect(cases[0].severity).toBe('high');
    expect(Number(cases[0].priority)).toBe(40); // base(high)=30 + min(5*max(3-1,0),25)=10

    // Lệnh gọi 4/5: reporter ĐẦU TIÊN báo cáo LẠI CÙNG review -> 409, KHÔNG mutation thêm.
    const res4 = await reportReview(reporterTokens[0], reviewId, { reason: 'other' });
    expect(res4.status).toBe(409);

    cases = await fetchCaseForTarget('review', reviewId);
    expect(cases[0].report_count).toBe(3); // KHÔNG tăng thêm
    const reportsForCase: Array<{ id: string }> = await ds.query(`SELECT id FROM reports WHERE case_id = $1`, [
      cases[0].id,
    ]);
    expect(reportsForCase).toHaveLength(3); // vẫn đúng 3 report, không có report thứ 4

    // Lệnh gọi 5/5: target không tồn tại -> 404, dùng nốt ngân sách route này để kiểm tra luôn.
    const res5 = await reportReview(reporterTokens[3], '00000000-0000-4000-8000-000000000000', { reason: 'spam' });
    expect(res5.status).toBe(404);
  });

  // Auth/happy-path/404×2/DTO validation cho MEDIA — route riêng, ngân sách 5/phút RIÊNG (không
  // chung với reviews ở trên). Không lặp lại phần T3 (case/report_count/severity) đã kiểm chứng
  // đầy đủ ở review — chỉ xác nhận cùng cơ chế hoạt động cho target_type=media.
  it('media: không token -> 401; published -> 201 (case mới); không tồn tại -> 404; chưa published -> 404; reason sai -> 400', async () => {
    const mediaIdPublished = await insertMedia('published');
    const mediaIdPending = await insertMedia('pending');

    // Lệnh gọi 1/5: không token.
    const res1 = await request(app.getHttpServer()).post(`/api/media/${mediaIdPublished}/report`).send({ reason: 'spam' });
    expect(res1.status).toBe(401);

    // Lệnh gọi 2/5: published -> 201, case mới.
    const res2 = await reportMedia(reporterTokens[0], mediaIdPublished, { reason: 'offensive' });
    expect(res2.status).toBe(201);
    const cases = await fetchCaseForTarget('media', mediaIdPublished);
    expect(cases).toHaveLength(1);
    caseIds.push(cases[0].id);
    expect(cases[0].source).toBe('report');
    expect(cases[0].report_count).toBe(1);

    // Lệnh gọi 3/5: target không tồn tại -> 404.
    const res3 = await reportMedia(reporterTokens[1], '00000000-0000-4000-8000-000000000000', { reason: 'spam' });
    expect(res3.status).toBe(404);

    // Lệnh gọi 4/5: target tồn tại nhưng chưa published -> 404 (không rò rỉ trạng thái kiểm duyệt).
    const res4 = await reportMedia(reporterTokens[1], mediaIdPending, { reason: 'spam' });
    expect(res4.status).toBe(404);

    // Lệnh gọi 5/5: reason không thuộc enum -> 400 (ValidationPipe mặc định, KHÔNG có
    // exceptionFactory riêng -> BadRequestException, khớp tiền lệ M2 "invalid-enum -> 400" dù
    // moderation-design.md §9.2 liệt kê 422 — xác nhận qua chạy thật, không đoán).
    const res5 = await reportMedia(reporterTokens[2], mediaIdPublished, { reason: 'not_a_valid_reason' });
    expect(res5.status).toBe(400);
  });
});
