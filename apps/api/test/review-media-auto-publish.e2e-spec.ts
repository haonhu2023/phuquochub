import { INestApplication, ValidationPipe } from '@nestjs/common';
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
// GIỚI HẠN ĐÃ CÔNG BỐ (không phải thiếu sót): hiện KHÔNG có đường đọc công khai nào trả về media
// gắn với review (reviews.mapper.ts's ReviewResponse không có trường media/photo nào) — M3 không
// xây route đọc mới. Xác nhận publish thành công qua truy vấn DB trực tiếp
// (media.status/review_id), không qua một gallery endpoint chưa tồn tại.
describe('Review creation auto-publishes attached media (e2e)', () => {
  let app: INestApplication;
  let ds: DataSource;
  let accessToken: string;
  let placeId: string | null = null;
  const email = `e2e_revpub_${Date.now()}@phuquochub.test`;
  const password = 'password123';
  const CONTENT_TYPE = 'image/jpeg';

  const reviewIds: string[] = [];
  const mediaIds: string[] = [];

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    app.useGlobalInterceptors(new TransformInterceptor());
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();

    ds = app.get<DataSource>(getDataSourceToken());

    const rows: Array<{ id: string }> = await ds.query(
      `SELECT id FROM places WHERE deleted_at IS NULL AND status = 'published' ORDER BY id ASC LIMIT 1`,
    );
    placeId = rows[0]?.id ?? null;

    const reg = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ email, password, display_name: 'E2E Review Publish User' });
    accessToken = reg.body.data.access_token;
  }, 30_000);

  afterAll(async () => {
    if (ds?.isInitialized) {
      if (reviewIds.length) await ds.query(`DELETE FROM reviews WHERE id = ANY($1)`, [reviewIds]);
      if (mediaIds.length) await ds.query(`DELETE FROM media WHERE id = ANY($1)`, [mediaIds]);
    }
    if (app) await app.close();
  });

  function sha256(buf: Buffer): string {
    return createHash('sha256').update(buf).digest('hex');
  }

  function fakeJpegBytes(seed: string): Buffer {
    return Buffer.from(`fake-jpeg-bytes-${seed}-${Date.now()}-${Math.random()}`);
  }

  function presign(token: string, body: Record<string, unknown>) {
    return request(app.getHttpServer()).post('/api/media/presign').set('Authorization', `Bearer ${token}`).send(body);
  }

  function register(token: string, body: Record<string, unknown>) {
    return request(app.getHttpServer()).post('/api/media').set('Authorization', `Bearer ${token}`).send(body);
  }

  function putToPresignedUrl(uploadUrl: string, content: Buffer, contentType: string): Promise<Response> {
    return fetch(uploadUrl, { method: 'PUT', headers: { 'Content-Type': contentType }, body: content as BodyInit });
  }

  async function uploadOrphanMedia(seed: string): Promise<string> {
    const content = fakeJpegBytes(seed);
    const checksum = sha256(content);
    const presignRes = await presign(accessToken, {
      content_type: CONTENT_TYPE,
      size: content.length,
      checksum_sha256: checksum,
    });
    expect(presignRes.status).toBe(201);
    const { key, upload_url: uploadUrl } = presignRes.body.data;

    const putRes = await putToPresignedUrl(uploadUrl, content, CONTENT_TYPE);
    expect(putRes.status).toBe(200);

    const registerRes = await register(accessToken, { key });
    expect(registerRes.status).toBe(201);
    expect(registerRes.body.data.status).toBe('pending'); // chưa gắn review nào — vẫn pending (O2)

    const mediaId = registerRes.body.data.id;
    mediaIds.push(mediaId);
    return mediaId;
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

    const mediaId1 = await uploadOrphanMedia('multi-1');
    const mediaId2 = await uploadOrphanMedia('multi-2');

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
      const presignRes = await presign(token, { content_type: CONTENT_TYPE, size: content.length, checksum_sha256: checksum });
      const { key, upload_url: uploadUrl } = presignRes.body.data;
      await putToPresignedUrl(uploadUrl, content, CONTENT_TYPE);
      const registerRes = await register(token, { key });
      mediaIds.push(registerRes.body.data.id);
      return registerRes.body.data.id;
    }
    void mediaId1;
    void mediaId2;
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
    const presignRes = await presign(otherToken, { content_type: CONTENT_TYPE, size: content.length, checksum_sha256: checksum });
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
    const presignRes = await presign(ownerToken, { content_type: CONTENT_TYPE, size: content.length, checksum_sha256: checksum });
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
});
