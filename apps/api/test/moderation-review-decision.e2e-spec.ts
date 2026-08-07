import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { TransformInterceptor } from '../src/common/interceptors/transform.interceptor';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';

// M4 (Review Decision Workflow, ADR-018 T2 + INV-4). CẦN Postgres + Redis thật + migration
// InitModeration/SeedModerationPermissions đã chạy. Review/case/place đều DISPOSABLE — chèn thẳng
// qua `ds.query` (không có endpoint tạo case cho review target, và tạo review trực tiếp qua SQL
// cho phép kiểm soát chính xác rating_avg/rating_count kỳ vọng, tách biệt khỏi các review do các
// e2e suite khác tạo trên place seed chung) — XOÁ SẠCH ở afterAll.
describe('Moderation Review Decision Workflow (e2e)', () => {
  let app: INestApplication;
  let ds: DataSource;
  let memberToken: string;
  let moderatorToken: string;
  let mediaOnlyModeratorToken: string;
  let authorUserId: string;
  let authorToken: string;
  let placeId: string;
  let categoryId: string;

  const reviewIds: string[] = [];
  const caseIds: string[] = [];
  const grantedUserRoleIds: string[] = [];
  let mediaOnlyRoleId: string | null = null;

  const memberEmail = `e2e_revdec_member_${Date.now()}@phuquochub.test`;
  const moderatorEmail = `e2e_revdec_moderator_${Date.now()}@phuquochub.test`;
  const mediaOnlyEmail = `e2e_revdec_mediaonly_${Date.now()}@phuquochub.test`;
  const authorEmail = `e2e_revdec_author_${Date.now()}@phuquochub.test`;
  const password = 'password123';

  let reviewerFixtureCounter = 0;
  const reviewerUserIds: string[] = [];

  // uq_reviews_place_user (place_id, user_id) cho phép ĐÚNG một review mỗi người dùng mỗi place —
  // suite này chèn NHIỀU review trên CÙNG một place dùng riêng, nên mỗi review (trừ khi cố tình
  // muốn test INV-12 tự kiểm duyệt bằng `authorUserId`) cần một reviewer RIÊNG. Chèn thẳng vào
  // `users` (không qua /api/auth/register) — không cần token, không bị giới hạn rate limit đăng
  // ký, và các dòng này không bao giờ đăng nhập nên không cần password_hash thật.
  async function createDisposableReviewer(): Promise<string> {
    reviewerFixtureCounter += 1;
    const rows: Array<{ id: string }> = await ds.query(
      `INSERT INTO users (email, display_name) VALUES ($1, $2) RETURNING id`,
      [`e2e_revdec_reviewer_${Date.now()}_${reviewerFixtureCounter}@phuquochub.test`, 'E2E RevDec Reviewer'],
    );
    reviewerUserIds.push(rows[0].id);
    return rows[0].id;
  }

  async function insertReview(status: string, rating: number, userId?: string): Promise<string> {
    const reviewerId = userId ?? (await createDisposableReviewer());
    const rows: Array<{ id: string }> = await ds.query(
      `INSERT INTO reviews (place_id, user_id, rating, content, status)
       VALUES ($1, $2, $3, 'e2e review-decision fixture', $4)
       RETURNING id`,
      [placeId, reviewerId, rating, status],
    );
    reviewIds.push(rows[0].id);
    return rows[0].id;
  }

  async function insertOpenCase(reviewId: string): Promise<string> {
    const rows: Array<{ id: string }> = await ds.query(
      `INSERT INTO moderation_cases (target_type, target_id, status, source, severity, priority)
       VALUES ('review', $1, 'open', 'report', 'normal', 10)
       RETURNING id`,
      [reviewId],
    );
    caseIds.push(rows[0].id);
    return rows[0].id;
  }

  async function fetchReview(id: string): Promise<{ status: string } | undefined> {
    const rows = await ds.query(`SELECT status FROM reviews WHERE id = $1`, [id]);
    return rows[0];
  }

  async function fetchPlaceRating(): Promise<{ rating_avg: string | null; rating_count: number }> {
    const rows = await ds.query(`SELECT rating_avg, rating_count FROM places WHERE id = $1`, [placeId]);
    return rows[0];
  }

  async function fetchCase(id: string): Promise<{ status: string } | undefined> {
    const rows = await ds.query(`SELECT status FROM moderation_cases WHERE id = $1`, [id]);
    return rows[0];
  }

  // Suite này chèn RẤT NHIỀU review lên `placeId` (place dùng chung) qua nhiều test — đủ cho các
  // test chỉ cần "trước/sau không đổi" hoặc "status đổi đúng chuyển tiếp". Nhưng bất kỳ test nào
  // cần khẳng định GIÁ TRỊ CHÍNH XÁC của rating_avg/rating_count PHẢI dùng một place RIÊNG: nếu
  // dùng chung, recalculateRating() sẽ tính lại từ TOÀN BỘ review published của place đó — kể cả
  // những review được test TRƯỚC đó để lại (một test decide() thất bại ở 422 để nguyên review
  // published; sang test sau, review đó vẫn được đếm) — một `UPDATE places SET rating_avg=...`
  // giả định trước khi gọi decide() KHÔNG khớp với những gì recalculateRating() thật sự tính lại.
  async function createDisposablePlace(): Promise<string> {
    const rows: Array<{ id: string }> = await ds.query(
      `INSERT INTO places (name, slug, category_id, location, status)
       VALUES ('E2E RevDec Rating Place', $1, $2, ST_SetSRID(ST_MakePoint(103.9, 10.2), 4326)::geography, 'published')
       RETURNING id`,
      [`e2e-revdec-rating-${Date.now()}-${Math.random().toString(36).slice(2)}`, categoryId],
    );
    return rows[0].id;
  }

  async function insertReviewForPlace(targetPlaceId: string, status: string, rating: number): Promise<string> {
    const reviewerId = await createDisposableReviewer();
    const rows: Array<{ id: string }> = await ds.query(
      `INSERT INTO reviews (place_id, user_id, rating, content, status)
       VALUES ($1, $2, $3, 'e2e review-decision rating fixture', $4)
       RETURNING id`,
      [targetPlaceId, reviewerId, rating, status],
    );
    return rows[0].id;
  }

  async function cleanupDisposablePlace(targetPlaceId: string, ownReviewIds: string[], ownCaseIds: string[]): Promise<void> {
    if (ownCaseIds.length) await ds.query(`DELETE FROM moderation_cases WHERE id = ANY($1)`, [ownCaseIds]);
    await ds.query(`DELETE FROM audit_logs WHERE entity_type = 'review' AND entity_id = ANY($1)`, [
      ownReviewIds.length ? ownReviewIds : ['00000000-0000-0000-0000-000000000000'],
    ]);
    if (ownReviewIds.length) await ds.query(`DELETE FROM reviews WHERE id = ANY($1)`, [ownReviewIds]);
    await ds.query(`DELETE FROM places WHERE id = $1`, [targetPlaceId]);
  }

  async function decide(token: string, caseId: string, body: Record<string, unknown>) {
    return request(app.getHttpServer())
      .post(`/api/moderation/cases/${caseId}/decide`)
      .set('Authorization', `Bearer ${token}`)
      .send(body);
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
      .send({ email: memberEmail, password, display_name: 'E2E RevDec Member' });
    memberToken = reg1.body.data.access_token;

    const reg2 = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ email: moderatorEmail, password, display_name: 'E2E RevDec Moderator' });
    moderatorToken = reg2.body.data.access_token;
    const moderatorUserId = reg2.body.data.user.id;

    const reg3 = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ email: mediaOnlyEmail, password, display_name: 'E2E RevDec MediaOnly' });
    mediaOnlyModeratorToken = reg3.body.data.access_token;
    const mediaOnlyUserId = reg3.body.data.user.id;

    const reg4 = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ email: authorEmail, password, display_name: 'E2E RevDec Author' });
    authorToken = reg4.body.data.access_token;
    authorUserId = reg4.body.data.user.id;
    void authorToken;

    // moderator: role có sẵn (moderator) -> CẢ Media.Moderate LẪN Review.Moderate (SeedModerationPermissions).
    const granted1: Array<{ id: string }> = await ds.query(
      `INSERT INTO user_roles (user_id, role_id) SELECT $1, r.id FROM roles r WHERE r.code = 'moderator' RETURNING id`,
      [moderatorUserId],
    );
    grantedUserRoleIds.push(...granted1.map((r) => r.id));

    // mediaOnlyModerator: role TẠM THỜI, CHỈ Media.Moderate (không có Review.Moderate) — dựng để
    // chứng minh permission KHÔNG dùng lẫn (ADR-018 D10, "Media.Moderate không được xác thực một
    // quyết định review, và ngược lại"). Không có precedent tạo role tuỳ biến trong repo trước đây
    // — is_system=false đánh dấu rõ đây là role chỉ dùng cho test, dọn sạch ở afterAll.
    const roleRows: Array<{ id: string }> = await ds.query(
      `INSERT INTO roles (code, name, is_system, is_assignable)
       VALUES ('e2e_media_only_moderator', 'E2E Media-only moderator (test fixture)', false, true)
       RETURNING id`,
    );
    mediaOnlyRoleId = roleRows[0].id;
    await ds.query(
      `INSERT INTO role_permissions (role_id, permission_id)
       SELECT $1, p.id FROM permissions p WHERE p.code = 'Media.Moderate'`,
      [mediaOnlyRoleId],
    );
    const granted2: Array<{ id: string }> = await ds.query(
      `INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2) RETURNING id`,
      [mediaOnlyUserId, mediaOnlyRoleId],
    );
    grantedUserRoleIds.push(...granted2.map((r) => r.id));

    // Place DÙNG RIÊNG cho suite này (không dùng place seed chung) — để rating_avg/rating_count
    // hoàn toàn kiểm soát được, không lẫn với review do các e2e suite khác tạo song song.
    const [{ id: catId }] = await ds.query(`SELECT id FROM categories LIMIT 1`);
    categoryId = catId;
    const placeRows: Array<{ id: string }> = await ds.query(
      `INSERT INTO places (name, slug, category_id, location, status)
       VALUES ('E2E RevDec Place', $1, $2, ST_SetSRID(ST_MakePoint(103.9, 10.2), 4326)::geography, 'published')
       RETURNING id`,
      [`e2e-revdec-place-${Date.now()}`, categoryId],
    );
    placeId = placeRows[0].id;
  }, 30_000);

  // Teardown hang fix (2026-08-07): dọn dẹp trong `try` — nếu một bước ném lỗi, `finally` vẫn đảm
  // bảo `app.close()` chạy (không thì Nest/TypeORM giữ handle mở, Jest treo sau khi in kết quả).
  // KHÔNG nuốt lỗi bằng `.catch()`: lỗi dọn dẹp vẫn nổi lên sau `finally`.
  afterAll(async () => {
    try {
      if (ds?.isInitialized) {
        if (caseIds.length) await ds.query(`DELETE FROM moderation_cases WHERE id = ANY($1)`, [caseIds]);
        await ds.query(`DELETE FROM audit_logs WHERE event = 'moderation.decided' AND entity_type = 'review' AND entity_id = ANY($1)`, [
          reviewIds.length ? reviewIds : ['00000000-0000-0000-0000-000000000000'],
        ]);
        if (reviewIds.length) await ds.query(`DELETE FROM reviews WHERE id = ANY($1)`, [reviewIds]);
        if (placeId) await ds.query(`DELETE FROM places WHERE id = $1`, [placeId]);
        if (reviewerUserIds.length) await ds.query(`DELETE FROM users WHERE id = ANY($1)`, [reviewerUserIds]);
        for (const id of grantedUserRoleIds) await ds.query(`DELETE FROM user_roles WHERE id = $1`, [id]);
        if (mediaOnlyRoleId) {
          await ds.query(`DELETE FROM role_permissions WHERE role_id = $1`, [mediaOnlyRoleId]);
          await ds.query(`DELETE FROM roles WHERE id = $1`, [mediaOnlyRoleId]);
        }
      }
    } finally {
      if (app) await app.close();
    }
  });

  describe('Authorization', () => {
    it('không token -> 401', async () => {
      const reviewId = await insertReview('published', 5);
      const caseId = await insertOpenCase(reviewId);
      const res = await request(app.getHttpServer())
        .post(`/api/moderation/cases/${caseId}/decide`)
        .send({ decision: 'hide', reason: 'x' });
      expect(res.status).toBe(401);
    });

    it('member (không có Review.Moderate lẫn Media.Moderate) -> 403', async () => {
      const reviewId = await insertReview('published', 5);
      const caseId = await insertOpenCase(reviewId);
      const res = await decide(memberToken, caseId, { decision: 'hide', reason: 'x' });
      expect(res.status).toBe(403);
    });

    it('moderator CÓ Media.Moderate nhưng KHÔNG có Review.Moderate -> 403 khi quyết định review (permission không dùng lẫn, ADR-018 D10)', async () => {
      const reviewId = await insertReview('published', 5);
      const caseId = await insertOpenCase(reviewId);
      const res = await decide(mediaOnlyModeratorToken, caseId, { decision: 'hide', reason: 'x' });
      expect(res.status).toBe(403);
      const row = await fetchReview(reviewId);
      expect(row?.status).toBe('published'); // KHÔNG bị đổi
    });

    it('moderator có Review.Moderate -> 200', async () => {
      const reviewId = await insertReview('published', 5);
      const caseId = await insertOpenCase(reviewId);
      const res = await decide(moderatorToken, caseId, { decision: 'hide', reason: 'vi phạm' });
      expect(res.status).toBe(200);
    });
  });

  describe('published -> hidden (hide) + tính lại rating', () => {
    it('hide MỘT trong hai review published -> hidden, case resolved, rating_avg/rating_count giảm đúng, audit ghi lại', async () => {
      const ratingPlaceId = await createDisposablePlace();
      const r1 = await insertReviewForPlace(ratingPlaceId, 'published', 5);
      const r2 = await insertReviewForPlace(ratingPlaceId, 'published', 3);
      await ds.query(`UPDATE places SET rating_avg = 4.0, rating_count = 2 WHERE id = $1`, [ratingPlaceId]);

      const caseRows: Array<{ id: string }> = await ds.query(
        `INSERT INTO moderation_cases (target_type, target_id, status, source, severity, priority)
         VALUES ('review', $1, 'open', 'report', 'normal', 10) RETURNING id`,
        [r1],
      );
      const caseId = caseRows[0].id;
      const res = await decide(moderatorToken, caseId, { decision: 'hide', reason: 'vi phạm chính sách' });
      expect(res.status).toBe(200);

      const [row] = await ds.query(`SELECT status FROM reviews WHERE id = $1`, [r1]);
      expect(row.status).toBe('hidden');
      const [caseRow] = await ds.query(`SELECT status FROM moderation_cases WHERE id = $1`, [caseId]);
      expect(caseRow.status).toBe('resolved');

      const [rating] = await ds.query(`SELECT rating_avg, rating_count FROM places WHERE id = $1`, [ratingPlaceId]);
      expect(rating.rating_count).toBe(1); // chỉ còn r2 (rating=3) đóng góp
      expect(Number(rating.rating_avg)).toBeCloseTo(3.0, 1);

      const audits: Array<{ event: string }> = await ds.query(
        `SELECT event FROM audit_logs WHERE entity_type = 'review' AND entity_id = $1 ORDER BY id ASC`,
        [r1],
      );
      expect(audits.length).toBeGreaterThanOrEqual(1);
      expect(audits[0].event).toBe('moderation.decided');

      await cleanupDisposablePlace(ratingPlaceId, [r1, r2], [caseId]);
    });

    it('hide KHÔNG kèm reason -> 422, KHÔNG đổi status, KHÔNG đổi rating', async () => {
      const r1 = await insertReview('published', 4);
      const caseId = await insertOpenCase(r1);
      const before = await fetchPlaceRating();

      const res = await decide(moderatorToken, caseId, { decision: 'hide' });
      expect(res.status).toBe(422);

      const row = await fetchReview(r1);
      expect(row?.status).toBe('published');
      const after = await fetchPlaceRating();
      expect(after).toEqual(before);
    });

    it('hide review DUY NHẤT còn published của place -> rating_count=0, rating_avg=NULL (empty aggregate đúng)', async () => {
      // Place riêng cho test này để đảm bảo ĐÚNG một review published tại thời điểm hide.
      const soloPlaceId = await createDisposablePlace();
      const soloReviewId = await insertReviewForPlace(soloPlaceId, 'published', 5);
      await ds.query(`UPDATE places SET rating_avg = 5.0, rating_count = 1 WHERE id = $1`, [soloPlaceId]);
      const caseRows: Array<{ id: string }> = await ds.query(
        `INSERT INTO moderation_cases (target_type, target_id, status, source, severity, priority)
         VALUES ('review', $1, 'open', 'report', 'normal', 10) RETURNING id`,
        [soloReviewId],
      );
      const soloCaseId = caseRows[0].id;

      const res = await decide(moderatorToken, soloCaseId, { decision: 'hide', reason: 'vi phạm' });
      expect(res.status).toBe(200);

      const [placeRow] = await ds.query(`SELECT rating_avg, rating_count FROM places WHERE id = $1`, [soloPlaceId]);
      expect(placeRow.rating_count).toBe(0);
      expect(placeRow.rating_avg).toBeNull();

      await cleanupDisposablePlace(soloPlaceId, [soloReviewId], [soloCaseId]);
    });
  });

  describe('hidden -> published (restore) + khôi phục rating', () => {
    it('restore review vừa hide -> published trở lại, rating_avg/rating_count khôi phục CHÍNH XÁC', async () => {
      const ratingPlaceId = await createDisposablePlace();
      const r1 = await insertReviewForPlace(ratingPlaceId, 'hidden', 5);
      const r2 = await insertReviewForPlace(ratingPlaceId, 'published', 3);
      await ds.query(`UPDATE places SET rating_avg = 3.0, rating_count = 1 WHERE id = $1`, [ratingPlaceId]);

      const caseRows: Array<{ id: string }> = await ds.query(
        `INSERT INTO moderation_cases (target_type, target_id, status, source, severity, priority)
         VALUES ('review', $1, 'open', 'report', 'normal', 10) RETURNING id`,
        [r1],
      );
      const caseId = caseRows[0].id;
      const res = await decide(moderatorToken, caseId, { decision: 'restore' });
      expect(res.status).toBe(200);

      const [row] = await ds.query(`SELECT status FROM reviews WHERE id = $1`, [r1]);
      expect(row.status).toBe('published');

      const [rating] = await ds.query(`SELECT rating_avg, rating_count FROM places WHERE id = $1`, [ratingPlaceId]);
      expect(rating.rating_count).toBe(2);
      expect(Number(rating.rating_avg)).toBeCloseTo(4.0, 1); // (5+3)/2

      await cleanupDisposablePlace(ratingPlaceId, [r1, r2], [caseId]);
    });

    it('restore kèm target_status=pending -> 422 (review chỉ có MỘT đích restore hợp lệ: published)', async () => {
      const r1 = await insertReview('hidden', 5);
      const caseId = await insertOpenCase(r1);
      const res = await decide(moderatorToken, caseId, { decision: 'restore', target_status: 'pending' });
      expect(res.status).toBe(422);
      const row = await fetchReview(r1);
      expect(row?.status).toBe('hidden');
    });
  });

  describe('pending -> published (approve, đường lịch sử)', () => {
    it('approve review pending (chèn tay, mô phỏng dòng cũ) -> published, rating cộng thêm đúng', async () => {
      const ratingPlaceId = await createDisposablePlace();
      const r1 = await insertReviewForPlace(ratingPlaceId, 'published', 4);
      const r2 = await insertReviewForPlace(ratingPlaceId, 'pending', 2); // KHÔNG đóng góp rating khi còn pending
      await ds.query(`UPDATE places SET rating_avg = 4.0, rating_count = 1 WHERE id = $1`, [ratingPlaceId]);

      const caseRows: Array<{ id: string }> = await ds.query(
        `INSERT INTO moderation_cases (target_type, target_id, status, source, severity, priority)
         VALUES ('review', $1, 'open', 'report', 'normal', 10) RETURNING id`,
        [r2],
      );
      const caseId = caseRows[0].id;
      const res = await decide(moderatorToken, caseId, { decision: 'approve' });
      expect(res.status).toBe(200);

      const [row] = await ds.query(`SELECT status FROM reviews WHERE id = $1`, [r2]);
      expect(row.status).toBe('published');

      const [rating] = await ds.query(`SELECT rating_avg, rating_count FROM places WHERE id = $1`, [ratingPlaceId]);
      expect(rating.rating_count).toBe(2);
      expect(Number(rating.rating_avg)).toBeCloseTo(3.0, 1); // (4+2)/2

      await cleanupDisposablePlace(ratingPlaceId, [r1, r2], [caseId]);
    });
  });

  describe('Chuyển trạng thái không hợp lệ', () => {
    it('published + approve -> 422 (INV-13 tương đương phía review — approve chỉ từ pending), KHÔNG đổi status/rating', async () => {
      const r1 = await insertReview('published', 5);
      const caseId = await insertOpenCase(r1);
      const before = await fetchPlaceRating();

      const res = await decide(moderatorToken, caseId, { decision: 'approve' });
      expect(res.status).toBe(422);

      const row = await fetchReview(r1);
      expect(row?.status).toBe('published');
      const after = await fetchPlaceRating();
      expect(after).toEqual(before);
    });

    it('decision=reject trên review -> 422 tường minh (review không có trạng thái rejected)', async () => {
      const r1 = await insertReview('published', 5);
      const caseId = await insertOpenCase(r1);
      const res = await decide(moderatorToken, caseId, { decision: 'reject', reason: 'x' });
      expect(res.status).toBe(422);
    });
  });

  describe('Case không tồn tại / đã xử lý', () => {
    it('case_id không tồn tại -> 404', async () => {
      const res = await decide(moderatorToken, '00000000-0000-4000-8000-000000000000', { decision: 'hide', reason: 'x' });
      expect(res.status).toBe(404);
    });

    it('case đã resolved -> 409 khi quyết định lần hai, KHÔNG mutation nào thêm', async () => {
      const r1 = await insertReview('published', 5);
      const caseId = await insertOpenCase(r1);
      const first = await decide(moderatorToken, caseId, { decision: 'hide', reason: 'x' });
      expect(first.status).toBe(200);

      const before = await fetchReview(r1);
      const second = await decide(moderatorToken, caseId, { decision: 'restore' });
      expect(second.status).toBe(409);
      const after = await fetchReview(r1);
      expect(after).toEqual(before); // KHÔNG đổi thêm
    });
  });

  describe('INV-12: không tự kiểm duyệt', () => {
    it('moderator là chính tác giả review -> 403', async () => {
      // Cấp Review.Moderate cho CHÍNH author để kiểm tra self-moderation, không phải thiếu quyền.
      const grantRows: Array<{ id: string }> = await ds.query(
        `INSERT INTO user_roles (user_id, role_id) SELECT $1, r.id FROM roles r WHERE r.code = 'moderator' RETURNING id`,
        [authorUserId],
      );
      grantedUserRoleIds.push(...grantRows.map((r) => r.id));

      const r1 = await insertReview('published', 5, authorUserId);
      const caseId = await insertOpenCase(r1);
      const res = await decide(authorToken, caseId, { decision: 'hide', reason: 'x' });
      expect(res.status).toBe(403);
    });
  });

  describe('dismiss', () => {
    it('decision=dismiss -> 200, case dismissed, review KHÔNG đổi status, rating KHÔNG đổi', async () => {
      const r1 = await insertReview('published', 5);
      const caseId = await insertOpenCase(r1);
      const before = await fetchPlaceRating();

      const res = await decide(moderatorToken, caseId, { decision: 'dismiss', reason: 'report vô căn cứ' });
      expect(res.status).toBe(200);

      const row = await fetchReview(r1);
      expect(row?.status).toBe('published');
      const caseRow = await fetchCase(caseId);
      expect(caseRow?.status).toBe('dismissed');
      const after = await fetchPlaceRating();
      expect(after).toEqual(before);
    });
  });

  describe('media decision workflow không hồi quy', () => {
    it('media-only moderator VẪN quyết định được media bình thường (M3 không bị ảnh hưởng bởi M4)', async () => {
      const mediaRows: Array<{ id: string }> = await ds.query(
        `INSERT INTO media (type, provider, status, uploaded_by, object_key, bucket, content_type, size_bytes, checksum_sha256)
         VALUES ('image', 'upload', 'pending', $1, $2, 'phuquochub-test', 'image/jpeg', 100, $3)
         RETURNING id`,
        [authorUserId, `media/e2e-revdec-${Date.now()}.jpg`, 'c'.repeat(64)],
      );
      const mediaId = mediaRows[0].id;
      const caseRows: Array<{ id: string }> = await ds.query(
        `INSERT INTO moderation_cases (target_type, target_id, status, source, severity, priority)
         VALUES ('media', $1, 'open', 'new_content', 'normal', 10) RETURNING id`,
        [mediaId],
      );
      const caseId = caseRows[0].id;

      const res = await decide(mediaOnlyModeratorToken, caseId, { decision: 'approve' });
      expect(res.status).toBe(200);

      const mediaRow = await ds.query(`SELECT status FROM media WHERE id = $1`, [mediaId]);
      expect(mediaRow[0].status).toBe('published');

      await ds.query(`DELETE FROM moderation_cases WHERE id = $1`, [caseId]);
      await ds.query(`DELETE FROM audit_logs WHERE entity_type = 'media' AND entity_id = $1`, [mediaId]);
      await ds.query(`DELETE FROM media WHERE id = $1`, [mediaId]);
    });
  });
});
