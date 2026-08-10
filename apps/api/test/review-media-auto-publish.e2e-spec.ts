import { ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { createHash } from 'crypto';
import { AppModule } from '../src/app.module';
import { TransformInterceptor } from '../src/common/interceptors/transform.interceptor';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';

// M3 (Auto-publish-on-review-attach, ADR-018 T1/D3/D4). CẦN Postgres + Redis + MinIO thật (real
// upload round trip, cùng tiền lệ media.e2e-spec.ts) + ≥1 place published trong seed.
//
// Production review-media read path (2026-08-09): GET /places/{id}/reviews nay CÓ trả về media
// (reviews.mapper.ts's ReviewResponse.media, xem describe('GET /places/{id}/reviews — media' bên
// dưới) — trước đây route công khai này không phát media nào dù M3 đã auto-publish nó, đây là
// khoảng hở đã đóng. Các test publish phía trên vẫn xác nhận qua truy vấn DB trực tiếp
// (media.status/review_id) vì chúng chỉ quan tâm hành vi PUBLISH, không phải đường ĐỌC.
//
// Presign throttle isolation (2026-08-10): POST /media/presign có `@Throttle({limit:10,ttl:60_000})`
// riêng (media.controller.ts) — khoá throttle THẬT là sha256(ClassName-HandlerName-ThrottlerName-tracker),
// tracker mặc định = `req.ip` (stock `ThrottlerGuard.getTracker`, KHÔNG override theo user/token — xem
// cùng phát hiện đã ghi ở auth-refresh-throttle.e2e-spec.ts cho route /auth/refresh). File này gọi
// TOÀN BỘ request qua MỘT app instance (không tách app theo describe như file H-4), nên nếu không can
// thiệp, mọi lệnh presign trong suốt file (13 lệnh, trải ~9 test) sẽ CÙNG một bucket theo IP loopback và
// vượt hạn mức 10/60s ở test cuối — ĐÂY LÀ NGUYÊN NHÂN 429 thực tế, không phải lỗi publish/review.
// Không được nới hạn mức thật (SẼ làm yếu rate limiting production) — thay vào đó mô phỏng NHIỀU client
// khác nhau bằng `X-Forwarded-For` + `trust proxy` (CHÍNH kỹ thuật auth-refresh-throttle.e2e-spec.ts đã
// dùng và đã xác nhận khớp với cách khoá throttle thật được tính) để mỗi "actor" trong file có bucket
// throttle RIÊNG, không bao giờ chạm 10 lệnh presign trong cùng một actor.
let clientIpSeq = 0;
function nextClientIp(): string {
  clientIpSeq += 1;
  // TEST-NET-3 (RFC 5737, 203.0.113.0/24) — cùng dải đã dùng ở auth-refresh-throttle.e2e-spec.ts's
  // "client khác (IP khác)" test cho mục đích y hệt (mô phỏng client khác qua X-Forwarded-For).
  return `203.0.113.${(clientIpSeq % 240) + 10}`;
}

describe('Review creation auto-publishes attached media (e2e)', () => {
  let app: NestExpressApplication;
  let ds: DataSource;
  let accessToken: string;
  let placeId: string | null = null;
  const email = `e2e_revpub_${Date.now()}@phuquochub.test`;
  const password = 'password123';
  const CONTENT_TYPE = 'image/jpeg';

  const reviewIds: string[] = [];
  const mediaIds: string[] = [];

  // Hook timeout 60s (2026-08-10, không phải 30s như trước): `@nestjs/typeorm` mặc định
  // retryAttempts=9/retryDelay=3000ms khi kết nối Postgres lần đầu thất bại (typeorm.utils.js's
  // handleRetry) — riêng phần delay giữa các lần retry đã có thể tới ~27s, gần sát trần 30s cũ, nên
  // một lần Postgres/Docker chậm khởi động (WSL2/Docker Desktop) là đủ để hook timeout TRƯỚC KHI
  // `compile()` tự phục hồi — và vì Jest KHÔNG hủy được promise `compile()` đang chạy dở khi hook hết
  // giờ, `app` gán trễ ở background SAU khi `afterAll` đã chạy xong (thấy `app` vẫn undefined nên bỏ
  // qua `app.close()`) -> rò rỉ kết nối DB/Redis/HTTP thật + lỗi "import after teardown". Cùng ngưỡng
  // 60s mà auth-refresh-throttle.e2e-spec.ts (nguồn của kỹ thuật trust-proxy/X-Forwarded-For phía
  // trên) và các file bootstrap AppModule khác đã dùng cho chính bước `compile()` này.
  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    app.useGlobalInterceptors(new TransformInterceptor());
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();
    // Mô phỏng đúng cấu hình production thật đứng sau Caddy (main.ts: TRUST_PROXY_HOPS>0 ->
    // app.set('trust proxy', N)) để X-Forwarded-For được tin cậy khi tính req.ip — xem chú thích đầu
    // file + auth-refresh-throttle.e2e-spec.ts's "client khác (IP khác)" describe cho tiền lệ.
    app.set('trust proxy', 1);

    ds = app.get<DataSource>(getDataSourceToken());

    const rows: Array<{ id: string }> = await ds.query(
      `SELECT id FROM places WHERE deleted_at IS NULL AND status = 'published' ORDER BY id ASC LIMIT 1`,
    );
    placeId = rows[0]?.id ?? null;

    const reg = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ email, password, display_name: 'E2E Review Publish User' });
    accessToken = reg.body.data.access_token;
  }, 60_000);

  // Teardown hang fix (2026-08-07): dọn dẹp trong `try` — nếu một bước ném lỗi, `finally` vẫn đảm
  // bảo `app.close()` chạy (không thì Nest/TypeORM giữ handle mở, Jest treo sau khi in kết quả).
  // KHÔNG nuốt lỗi bằng `.catch()`: lỗi dọn dẹp vẫn nổi lên sau `finally`.
  afterAll(async () => {
    try {
      if (ds?.isInitialized) {
        if (reviewIds.length) await ds.query(`DELETE FROM reviews WHERE id = ANY($1)`, [reviewIds]);
        if (mediaIds.length) await ds.query(`DELETE FROM media WHERE id = ANY($1)`, [mediaIds]);
      }
    } finally {
      if (app) await app.close();
    }
  });

  function sha256(buf: Buffer): string {
    return createHash('sha256').update(buf).digest('hex');
  }

  function fakeJpegBytes(seed: string): Buffer {
    return Buffer.from(`fake-jpeg-bytes-${seed}-${Date.now()}-${Math.random()}`);
  }

  function presign(token: string, body: Record<string, unknown>, clientIp: string) {
    return request(app.getHttpServer())
      .post('/api/media/presign')
      .set('Authorization', `Bearer ${token}`)
      .set('X-Forwarded-For', clientIp)
      .send(body);
  }

  function register(token: string, body: Record<string, unknown>) {
    return request(app.getHttpServer()).post('/api/media').set('Authorization', `Bearer ${token}`).send(body);
  }

  function putToPresignedUrl(uploadUrl: string, content: Buffer, contentType: string): Promise<Response> {
    return fetch(uploadUrl, { method: 'PUT', headers: { 'Content-Type': contentType }, body: content as BodyInit });
  }

  async function uploadAsToken(token: string, seed: string, clientIp: string = nextClientIp()): Promise<string> {
    const content = fakeJpegBytes(seed);
    const checksum = sha256(content);
    const presignRes = await presign(
      token,
      {
        content_type: CONTENT_TYPE,
        size: content.length,
        checksum_sha256: checksum,
      },
      clientIp,
    );
    expect(presignRes.status).toBe(201);
    const { key, upload_url: uploadUrl } = presignRes.body.data;

    const putRes = await putToPresignedUrl(uploadUrl, content, CONTENT_TYPE);
    expect(putRes.status).toBe(200);

    const registerRes = await register(token, { key });
    expect(registerRes.status).toBe(201);
    expect(registerRes.body.data.status).toBe('pending'); // chưa gắn review nào — vẫn pending (O2)

    const mediaId = registerRes.body.data.id;
    mediaIds.push(mediaId);
    return mediaId;
  }

  function uploadOrphanMedia(seed: string): Promise<string> {
    return uploadAsToken(accessToken, seed);
  }

  it('review với 1 ảnh hợp lệ -> 201, media chuyển published + gắn review_id, audit ghi lại', async () => {
    if (!placeId) return; // không có place published nào trong seed hiện tại

    const mediaId = await uploadOrphanMedia('single-valid');

    const res = await request(app.getHttpServer())
      .post(`/api/places/${placeId}/reviews`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ rating: 5, content: 'Rất đẹp', media_ids: [mediaId] });

    expect(res.status).toBe(201);

    const [media]: Array<{ status: string; review_id: string | null }> = await ds.query(
      'SELECT status, review_id FROM media WHERE id = $1',
      [mediaId],
    );
    expect(media.status).toBe('published');
    expect(media.review_id).toBeTruthy();
    reviewIds.push(media.review_id as string);

    const auditRows: Array<{ event: string }> = await ds.query(
      `SELECT event FROM audit_logs WHERE event = 'media.auto_published' AND entity_id = $1`,
      [mediaId],
    );
    expect(auditRows.length).toBeGreaterThanOrEqual(1);
    const reviewAudit: Array<{ event: string }> = await ds.query(
      `SELECT event FROM audit_logs WHERE event = 'review.created' AND entity_id = $1`,
      [media.review_id],
    );
    expect(reviewAudit.length).toBeGreaterThanOrEqual(1);
  });

  it('review với NHIỀU ảnh hợp lệ -> tất cả cùng published + cùng review_id (nguyên tử, không một phần)', async () => {
    if (!placeId) return;

    // Đăng ký khác place để tránh vi phạm UNIQUE(place_id,user_id) của review đầu tiên (nếu cùng
    // place) — dùng chính placeId lần nữa CHỈ hợp lệ nếu user chưa review nó; test trước đã review
    // rồi nên phải dùng tài khoản khác cho test này.
    const otherEmail = `e2e_revpub_multi_${Date.now()}@phuquochub.test`;
    const reg = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ email: otherEmail, password, display_name: 'E2E Review Publish Multi' });
    const otherToken = reg.body.data.access_token;

    // Ảnh phải do CHÍNH người review upload (đk 2, D3) — upload lại bằng token mới.
    async function uploadAs(token: string, seed: string): Promise<string> {
      const content = fakeJpegBytes(seed);
      const checksum = sha256(content);
      const presignRes = await presign(
        token,
        { content_type: CONTENT_TYPE, size: content.length, checksum_sha256: checksum },
        nextClientIp(),
      );
      const { key, upload_url: uploadUrl } = presignRes.body.data;
      await putToPresignedUrl(uploadUrl, content, CONTENT_TYPE);
      const registerRes = await register(token, { key });
      mediaIds.push(registerRes.body.data.id);
      return registerRes.body.data.id;
    }
    const m1 = await uploadAs(otherToken, 'multi-a');
    const m2 = await uploadAs(otherToken, 'multi-b');

    const res = await request(app.getHttpServer())
      .post(`/api/places/${placeId}/reviews`)
      .set('Authorization', `Bearer ${otherToken}`)
      .send({ rating: 4, media_ids: [m1, m2] });

    expect(res.status).toBe(201);

    const rows: Array<{ id: string; status: string; review_id: string }> = await ds.query(
      'SELECT id, status, review_id FROM media WHERE id = ANY($1)',
      [[m1, m2]],
    );
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.status === 'published')).toBe(true);
    expect(new Set(rows.map((r) => r.review_id)).size).toBe(1); // cùng một review_id
    reviewIds.push(rows[0].review_id);
  });

  it('MỘT media_id không hợp lệ trong nhiều media_ids -> 422, KHÔNG review nào được tạo, TẤT CẢ media giữ pending', async () => {
    if (!placeId) return;

    const otherEmail = `e2e_revpub_rollback_${Date.now()}@phuquochub.test`;
    const reg = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ email: otherEmail, password, display_name: 'E2E Review Publish Rollback' });
    const otherToken = reg.body.data.access_token;

    const content = fakeJpegBytes('rollback-valid');
    const checksum = sha256(content);
    const presignRes = await presign(
      otherToken,
      { content_type: CONTENT_TYPE, size: content.length, checksum_sha256: checksum },
      nextClientIp(),
    );
    const { key, upload_url: uploadUrl } = presignRes.body.data;
    await putToPresignedUrl(uploadUrl, content, CONTENT_TYPE);
    const registerRes = await register(otherToken, { key });
    const validMediaId = registerRes.body.data.id;
    mediaIds.push(validMediaId);

    const fakeMediaId = '00000000-0000-4000-8000-000000000000'; // không tồn tại

    const reviewCountBefore: Array<{ count: string }> = await ds.query(
      `SELECT count(*)::int AS count FROM reviews WHERE place_id = $1`,
      [placeId],
    );

    const res = await request(app.getHttpServer())
      .post(`/api/places/${placeId}/reviews`)
      .set('Authorization', `Bearer ${otherToken}`)
      .send({ rating: 3, media_ids: [validMediaId, fakeMediaId] });

    expect(res.status).toBe(422);

    const reviewCountAfter: Array<{ count: string }> = await ds.query(
      `SELECT count(*)::int AS count FROM reviews WHERE place_id = $1`,
      [placeId],
    );
    expect(reviewCountAfter[0].count).toBe(reviewCountBefore[0].count); // KHÔNG review nào được tạo

    const [media]: Array<{ status: string; review_id: string | null }> = await ds.query(
      'SELECT status, review_id FROM media WHERE id = $1',
      [validMediaId],
    );
    expect(media.status).toBe('pending'); // vẫn pending, KHÔNG bị publish một phần
    expect(media.review_id).toBeNull(); // vẫn mồ côi
  });

  it('review KHÔNG media_ids vẫn hoạt động bình thường (không đổi hành vi hiện có)', async () => {
    if (!placeId) return;

    const otherEmail = `e2e_revpub_nomedia_${Date.now()}@phuquochub.test`;
    const reg = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ email: otherEmail, password, display_name: 'E2E Review Publish NoMedia' });
    const otherToken = reg.body.data.access_token;

    const res = await request(app.getHttpServer())
      .post(`/api/places/${placeId}/reviews`)
      .set('Authorization', `Bearer ${otherToken}`)
      .send({ rating: 5, content: 'Không kèm ảnh' });

    expect(res.status).toBe(201);
    const [review]: Array<{ id: string }> = await ds.query(
      `SELECT id FROM reviews WHERE place_id = $1 AND user_id = (SELECT id FROM users WHERE email = $2)`,
      [placeId, otherEmail],
    );
    reviewIds.push(review.id);
  });

  it('media của NGƯỜI KHÁC (không phải người tạo review) -> 422, không tạo review', async () => {
    if (!placeId) return;

    const ownerEmail = `e2e_revpub_owner_${Date.now()}@phuquochub.test`;
    const regOwner = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ email: ownerEmail, password, display_name: 'E2E Review Publish Owner' });
    const ownerToken = regOwner.body.data.access_token;

    const content = fakeJpegBytes('other-user-media');
    const checksum = sha256(content);
    const presignRes = await presign(
      ownerToken,
      { content_type: CONTENT_TYPE, size: content.length, checksum_sha256: checksum },
      nextClientIp(),
    );
    const { key, upload_url: uploadUrl } = presignRes.body.data;
    await putToPresignedUrl(uploadUrl, content, CONTENT_TYPE);
    const registerRes = await register(ownerToken, { key });
    const foreignMediaId = registerRes.body.data.id;
    mediaIds.push(foreignMediaId);

    const intruderEmail = `e2e_revpub_intruder_${Date.now()}@phuquochub.test`;
    const regIntruder = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ email: intruderEmail, password, display_name: 'E2E Review Publish Intruder' });
    const intruderToken = regIntruder.body.data.access_token;

    const res = await request(app.getHttpServer())
      .post(`/api/places/${placeId}/reviews`)
      .set('Authorization', `Bearer ${intruderToken}`)
      .send({ rating: 3, media_ids: [foreignMediaId] });

    expect(res.status).toBe(422);

    const [media]: Array<{ status: string; review_id: string | null }> = await ds.query(
      'SELECT status, review_id FROM media WHERE id = $1',
      [foreignMediaId],
    );
    expect(media.status).toBe('pending');
    expect(media.review_id).toBeNull();
  });

  // Production review-media read path (2026-08-09): GET /places/{id}/reviews.media — trước đây
  // route công khai này không phát media nào dù M3 đã auto-publish nó (xem comment đầu file).
  describe('GET /places/{id}/reviews — media', () => {
    function getReviews(placeIdToQuery: string) {
      return request(app.getHttpServer()).get(`/api/places/${placeIdToQuery}/reviews`);
    }

    it('review không có media -> media: []', async () => {
      if (!placeId) return;

      const email = `e2e_revread_nomedia_${Date.now()}@phuquochub.test`;
      const reg = await request(app.getHttpServer())
        .post('/api/auth/register')
        .send({ email, password, display_name: 'E2E Review Read NoMedia' });
      const token = reg.body.data.access_token;

      await request(app.getHttpServer())
        .post(`/api/places/${placeId}/reviews`)
        .set('Authorization', `Bearer ${token}`)
        .send({ rating: 5, content: 'Không ảnh' });

      const [row]: Array<{ id: string }> = await ds.query(
        `SELECT id FROM reviews WHERE place_id = $1 AND user_id = (SELECT id FROM users WHERE email = $2)`,
        [placeId, email],
      );
      reviewIds.push(row.id);

      const res = await getReviews(placeId);
      expect(res.status).toBe(200);
      const found = res.body.data.find((r: { id: string }) => r.id === row.id);
      expect(found).toBeDefined();
      expect(found.media).toEqual([]);
    });

    it('review với 1 media published -> media trả về đúng, url công khai (không phải docker-internal minio:9000)', async () => {
      if (!placeId) return;

      const email = `e2e_revread_one_${Date.now()}@phuquochub.test`;
      const reg = await request(app.getHttpServer())
        .post('/api/auth/register')
        .send({ email, password, display_name: 'E2E Review Read One' });
      const token = reg.body.data.access_token;

      const mediaId = await uploadAsToken(token, 'read-one');

      const createRes = await request(app.getHttpServer())
        .post(`/api/places/${placeId}/reviews`)
        .set('Authorization', `Bearer ${token}`)
        .send({ rating: 5, media_ids: [mediaId] });
      expect(createRes.status).toBe(201);

      const [mediaRow]: Array<{ review_id: string }> = await ds.query(
        `SELECT review_id FROM media WHERE id = $1`,
        [mediaId],
      );
      reviewIds.push(mediaRow.review_id);

      const res = await getReviews(placeId);
      expect(res.status).toBe(200);
      const found = res.body.data.find((r: { id: string }) => r.id === mediaRow.review_id);
      expect(found).toBeDefined();
      expect(found.media).toHaveLength(1);
      expect(found.media[0]).toMatchObject({ id: mediaId, status: 'published' });
      expect(typeof found.media[0].url).toBe('string');
      expect(found.media[0].url).not.toContain('minio:9000');
    });

    it('review với nhiều media -> trả về đủ, tất cả published', async () => {
      if (!placeId) return;

      const email = `e2e_revread_multi_${Date.now()}@phuquochub.test`;
      const reg = await request(app.getHttpServer())
        .post('/api/auth/register')
        .send({ email, password, display_name: 'E2E Review Read Multi' });
      const token = reg.body.data.access_token;

      const m1 = await uploadAsToken(token, 'read-multi-1');
      const m2 = await uploadAsToken(token, 'read-multi-2');

      const createRes = await request(app.getHttpServer())
        .post(`/api/places/${placeId}/reviews`)
        .set('Authorization', `Bearer ${token}`)
        .send({ rating: 4, media_ids: [m1, m2] });
      expect(createRes.status).toBe(201);

      const [mediaRow]: Array<{ review_id: string }> = await ds.query(`SELECT review_id FROM media WHERE id = $1`, [m1]);
      reviewIds.push(mediaRow.review_id);

      const res = await getReviews(placeId);
      const found = res.body.data.find((r: { id: string }) => r.id === mediaRow.review_id);
      expect(found.media).toHaveLength(2);
      expect(new Set(found.media.map((m: { id: string }) => m.id))).toEqual(new Set([m1, m2]));
      expect(found.media.every((m: { status: string }) => m.status === 'published')).toBe(true);
    });

    it('media hidden hoặc xoá mềm KHÔNG được trả về (kiểm duyệt) — review vẫn 200, chỉ media biến mất khỏi mảng', async () => {
      if (!placeId) return;

      const email = `e2e_revread_hidden_${Date.now()}@phuquochub.test`;
      const reg = await request(app.getHttpServer())
        .post('/api/auth/register')
        .send({ email, password, display_name: 'E2E Review Read Hidden' });
      const token = reg.body.data.access_token;

      const mVisible = await uploadAsToken(token, 'read-hidden-visible');
      const mHidden = await uploadAsToken(token, 'read-hidden-hidden');
      const mDeleted = await uploadAsToken(token, 'read-hidden-deleted');

      const createRes = await request(app.getHttpServer())
        .post(`/api/places/${placeId}/reviews`)
        .set('Authorization', `Bearer ${token}`)
        .send({ rating: 3, media_ids: [mVisible, mHidden, mDeleted] });
      expect(createRes.status).toBe(201);

      const [mediaRow]: Array<{ review_id: string }> = await ds.query(
        `SELECT review_id FROM media WHERE id = $1`,
        [mVisible],
      );
      reviewIds.push(mediaRow.review_id);

      // Mô phỏng kết quả kiểm duyệt (M3 auto-publish cả 3 thành 'published' — đổi trạng thái trực
      // tiếp qua DB, tương đương một quyết định moderation đã xảy ra sau đó).
      await ds.query(`UPDATE media SET status = 'hidden' WHERE id = $1`, [mHidden]);
      await ds.query(`UPDATE media SET deleted_at = now() WHERE id = $1`, [mDeleted]);

      const res = await getReviews(placeId);
      const found = res.body.data.find((r: { id: string }) => r.id === mediaRow.review_id);
      expect(found.media).toHaveLength(1);
      expect(found.media[0].id).toBe(mVisible);
    });
  });

  /**
   * Secure Private Media (2026-08-10) — `GET /media/{id}/file`.
   *
   * Đây là bộ e2e chứng minh TOÀN BỘ chuỗi phát media mới hoạt động THẬT với MinIO thật:
   * upload → gắn review (auto-publish) → đọc review → URL trong response → 302 → signed URL →
   * TẢI ĐƯỢC ĐÚNG BYTES. Và quan trọng không kém: mọi trạng thái KHÔNG published đều 404.
   *
   * Toàn bộ bộ này chạy mà KHÔNG cần bucket mở anonymous read — chính là điều kiện tiên quyết để
   * `mc anonymous set none` an toàn trên production.
   */
  describe('GET /media/{id}/file — phát media riêng tư qua signed URL', () => {
    // `getReviews` của describe anh em phía trên nằm trong scope RIÊNG của nó — khai báo lại ở đây
    // thay vì nâng lên scope ngoài, để không đụng vào khối test đã ổn định.
    function getReviews(placeIdToQuery: string) {
      return request(app.getHttpServer()).get(`/api/places/${placeIdToQuery}/reviews`);
    }

    // Tải URL đã ký bằng fetch THẬT (không qua supertest) — nó trỏ tới MinIO, không phải app.
    async function fetchSigned(url: string): Promise<{ status: number; body: Buffer }> {
      const res = await fetch(url);
      return { status: res.status, body: Buffer.from(await res.arrayBuffer()) };
    }

    /**
     * Upload GIỮ LẠI bytes đã gửi. KHÔNG dùng lại `uploadAsToken()` ở scope ngoài: helper đó tự gọi
     * `fakeJpegBytes()` BÊN TRONG, mà hàm này lại nhét `Date.now()`/`Math.random()` vào nội dung —
     * nên gọi `fakeJpegBytes(seed)` lần thứ hai ở ngoài KHÔNG cho ra cùng bytes đã upload. Muốn so
     * sánh byte-for-byte ở test "chuỗi đầy đủ" thì phải giữ đúng buffer đã PUT lên.
     */
    async function uploadWithContent(
      token: string,
      seed: string,
      clientIp: string,
    ): Promise<{ mediaId: string; content: Buffer }> {
      const content = fakeJpegBytes(seed);
      const presignRes = await presign(
        token,
        { content_type: CONTENT_TYPE, size: content.length, checksum_sha256: sha256(content) },
        clientIp,
      );
      expect(presignRes.status).toBe(201);
      const { key, upload_url: uploadUrl } = presignRes.body.data;

      const putRes = await putToPresignedUrl(uploadUrl, content, CONTENT_TYPE);
      expect(putRes.status).toBe(200);

      const registerRes = await register(token, { key });
      expect(registerRes.status).toBe(201);

      const mediaId = registerRes.body.data.id;
      mediaIds.push(mediaId);
      return { mediaId, content };
    }

    async function publishedMediaOnReview(seed: string): Promise<{ mediaId: string; content: Buffer }> {
      // Mỗi lần gọi cần một USER mới: một user chỉ được tạo MỘT review cho mỗi place. Đăng ký phải
      // kèm X-Forwarded-For riêng — throttle của /auth/register tính theo IP (RATE_LIMIT_AUTH_LIMIT
      // mặc định 10/60s), và khối test này tự nó đã vượt ngưỡng nếu dùng chung IP loopback. Cùng kỹ
      // thuật đã ghi ở đầu file cho presign.
      const clientIp = nextClientIp();
      const email = `e2e_file_${seed}_${Date.now()}@phuquochub.test`;
      const reg = await request(app.getHttpServer())
        .post('/api/auth/register')
        .set('X-Forwarded-For', clientIp)
        .send({ email, password, display_name: `E2E File ${seed}` });
      expect(reg.status).toBe(201);
      const token = reg.body.data.access_token;

      const { mediaId, content } = await uploadWithContent(token, seed, clientIp);

      const createRes = await request(app.getHttpServer())
        .post(`/api/places/${placeId}/reviews`)
        .set('Authorization', `Bearer ${token}`)
        .send({ rating: 5, media_ids: [mediaId] });
      expect(createRes.status).toBe(201);

      const [row]: Array<{ review_id: string }> = await ds.query(
        `SELECT review_id FROM media WHERE id = $1`,
        [mediaId],
      );
      reviewIds.push(row.review_id);
      return { mediaId, content };
    }

    it('CHUỖI ĐẦY ĐỦ: review → url ổn định → 302 → signed URL → tải đúng bytes đã upload', async () => {
      if (!placeId) return;
      const { mediaId, content } = await publishedMediaOnReview('fullchain');

      // 1. URL trong response review phải là endpoint API ổn định, KHÔNG phải URL object storage.
      const reviewsRes = await getReviews(placeId);
      const media = reviewsRes.body.data
        .flatMap((r: { media: Array<{ id: string; url: string }> }) => r.media)
        .find((m: { id: string }) => m.id === mediaId);
      expect(media).toBeDefined();
      expect(media.url).toContain(`/api/media/${mediaId}/file`);
      expect(media.url).not.toContain('minio');
      expect(media.url).not.toContain('X-Amz-Signature'); // URL ổn định, không mang chữ ký

      // 2. Endpoint trả 302 (KHÔNG stream bytes qua Nest) tới một signed URL.
      const redirectRes = await request(app.getHttpServer()).get(`/api/media/${mediaId}/file`);
      expect(redirectRes.status).toBe(302);
      const signedUrl = redirectRes.headers.location;
      expect(signedUrl).toContain('X-Amz-Signature');
      expect(redirectRes.headers['cache-control']).toContain('private');
      // Thân response rỗng — API không nằm trên đường truyền dữ liệu ảnh.
      expect(redirectRes.body).toEqual({});

      // 3. Signed URL tải được ĐÚNG bytes đã upload.
      const fetched = await fetchSigned(signedUrl);
      expect(fetched.status).toBe(200);
      expect(fetched.body.equals(content)).toBe(true);
    });

    /**
     * SECURITY REGRESSION (yêu cầu #8): chứng minh hành vi ứng dụng KHÔNG phụ thuộc vào việc
     * S3_PUBLIC_URL/bucket mở anonymous read.
     *
     * Signed URL ở trên hoạt động nhờ CHỮ KÝ SigV4 của chính nó, không nhờ policy bucket. Ở đây ta
     * bóc chữ ký ra khỏi URL và khẳng định request TRẦN bị từ chối — nếu bucket đang mở anonymous
     * read (như production hiện tại), request trần sẽ trả 200 và test này ĐỎ. Nói cách khác test
     * này vừa chứng minh signed URL là thứ thực sự cấp quyền, vừa là chuông báo nếu ai đó mở lại
     * anonymous read trên bucket test.
     */
    it('SECURITY: bỏ chữ ký khỏi signed URL → object KHÔNG tải được (không dựa vào anonymous read)', async () => {
      if (!placeId) return;
      const { mediaId } = await publishedMediaOnReview('nosig');

      const redirectRes = await request(app.getHttpServer()).get(`/api/media/${mediaId}/file`);
      expect(redirectRes.status).toBe(302);

      const signedUrl = new URL(redirectRes.headers.location);
      const unsignedUrl = `${signedUrl.origin}${signedUrl.pathname}`; // vứt toàn bộ query đã ký

      const unsigned = await fetchSigned(unsignedUrl);
      expect(unsigned.status).toBeGreaterThanOrEqual(400);
    });

    it('pending (chưa duyệt) → 404, không redirect', async () => {
      if (!placeId) return;
      const mediaId = await uploadOrphanMedia('file-pending'); // đăng ký xong vẫn pending, chưa gắn review

      const res = await request(app.getHttpServer()).get(`/api/media/${mediaId}/file`);
      expect(res.status).toBe(404);
      expect(res.headers.location).toBeUndefined();
    });

    it('hidden (bị moderator ẩn) → 404', async () => {
      if (!placeId) return;
      const { mediaId } = await publishedMediaOnReview('hidden');
      await ds.query(`UPDATE media SET status = 'hidden' WHERE id = $1`, [mediaId]);

      const res = await request(app.getHttpServer()).get(`/api/media/${mediaId}/file`);
      expect(res.status).toBe(404);
    });

    it('rejected (bị từ chối) → 404', async () => {
      if (!placeId) return;
      const { mediaId } = await publishedMediaOnReview('rejected');
      await ds.query(`UPDATE media SET status = 'rejected' WHERE id = $1`, [mediaId]);

      const res = await request(app.getHttpServer()).get(`/api/media/${mediaId}/file`);
      expect(res.status).toBe(404);
    });

    it('đã xoá mềm → 404 dù status vẫn là published', async () => {
      if (!placeId) return;
      const { mediaId } = await publishedMediaOnReview('softdel');
      await ds.query(`UPDATE media SET deleted_at = now() WHERE id = $1`, [mediaId]);

      const res = await request(app.getHttpServer()).get(`/api/media/${mediaId}/file`);
      expect(res.status).toBe(404);
    });

    it('media không tồn tại → 404 (cùng phản hồi với pending/hidden/rejected — không rò rỉ trạng thái)', async () => {
      const res = await request(app.getHttpServer()).get(
        '/api/media/00000000-0000-4000-8000-000000000000/file',
      );
      expect(res.status).toBe(404);
    });

    it('id không phải UUID → 400 (ParseUUIDPipe), không chạm DB', async () => {
      const res = await request(app.getHttpServer()).get('/api/media/not-a-uuid/file');
      expect(res.status).toBe(400);
    });

    it('CÔNG KHAI: khách chưa đăng nhập (không Authorization header) vẫn xem được ảnh published', async () => {
      if (!placeId) return;
      const { mediaId } = await publishedMediaOnReview('anon');

      // Không set Authorization — đúng kịch bản khách vãng lai xem trang chi tiết Place.
      const res = await request(app.getHttpServer()).get(`/api/media/${mediaId}/file`);
      expect(res.status).toBe(302);
    });

    it('media bị ẩn SAU KHI url đã phát → lần tải kế tiếp 404 ngay (thu hồi được, khác signed URL nhúng thẳng)', async () => {
      if (!placeId) return;
      const { mediaId } = await publishedMediaOnReview('revoke');

      expect((await request(app.getHttpServer()).get(`/api/media/${mediaId}/file`)).status).toBe(302);

      await ds.query(`UPDATE media SET status = 'hidden' WHERE id = $1`, [mediaId]);

      expect((await request(app.getHttpServer()).get(`/api/media/${mediaId}/file`)).status).toBe(404);
    });
  });
});
