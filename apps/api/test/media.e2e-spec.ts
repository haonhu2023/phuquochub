import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { createHash } from 'crypto';
import { AppModule } from '../src/app.module';
import { TransformInterceptor } from '../src/common/interceptors/transform.interceptor';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';

// CẦN Postgres + Redis + MinIO thật (docker compose up -d postgres redis minio) + migration đã
// chạy (InitPlaces/AddMediaUploadFoundation/SeedMediaPermissions). Bucket dùng ở đây là
// phuquochub-test (NODE_ENV=test do Jest tự đặt — xem configuration.ts defaultS3Bucket) — KHÔNG
// BAO GIỜ là phuquochub-dev, nên các object test này không lẫn với dữ liệu dev thủ công.
describe('Media Upload Foundation (e2e, live MinIO round-trip)', () => {
  let app: INestApplication;
  let ds: DataSource;
  let accessToken: string;
  let otherAccessToken: string;
  let placeId: string | null = null;
  const email = `e2e_media_${Date.now()}@phuquochub.test`;
  const otherEmail = `e2e_media_other_${Date.now()}@phuquochub.test`;
  const password = 'password123';
  const CONTENT_TYPE = 'image/jpeg';

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
      .send({ email, password, display_name: 'E2E Media User' });
    accessToken = reg.body.data.access_token;

    const reg2 = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ email: otherEmail, password, display_name: 'E2E Media Other User' });
    otherAccessToken = reg2.body.data.access_token;
    // Same rationale as bookings.e2e-spec.ts: full AppModule compile+init (real Postgres/Redis)
    // plus two real bcrypt registrations exceeds Jest's default 5000ms hook timeout.
  }, 30_000);

  afterAll(async () => {
    if (app) await app.close();
  });

  function sha256(buf: Buffer): string {
    return createHash('sha256').update(buf).digest('hex');
  }

  function fakeJpegBytes(seed: string): Buffer {
    return Buffer.from(`fake-jpeg-bytes-${seed}-${Date.now()}-${Math.random()}`);
  }

  function presign(token: string, body: Record<string, unknown>) {
    const req = request(app.getHttpServer()).post('/api/media/presign');
    if (token) req.set('Authorization', `Bearer ${token}`);
    return req.send(body);
  }

  function register(token: string, body: Record<string, unknown>) {
    return request(app.getHttpServer()).post('/api/media').set('Authorization', `Bearer ${token}`).send(body);
  }

  // Real PUT against the live MinIO instance — the request never touches our own API.
  // `as BodyInit`: a pre-existing @types/node/undici-types gap — Buffer works fine as a fetch
  // body at runtime (it IS a Uint8Array), but the current resolved @types/node version's BodyInit
  // union no longer structurally includes it. Type-only cast, zero runtime behavior change.
  function putToPresignedUrl(uploadUrl: string, content: Buffer, contentType: string): Promise<Response> {
    return fetch(uploadUrl, { method: 'PUT', headers: { 'Content-Type': contentType }, body: content as BodyInit });
  }

  describe('POST /api/media/presign', () => {
    it('không token → 401 (deny-by-default)', async () => {
      const res = await presign('', { content_type: CONTENT_TYPE, size: 100, checksum_sha256: 'a'.repeat(64) });
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    // Chỉ MỘT case 400 đại diện ở e2e (xác nhận ValidationPipe thật sự nối dây end-to-end) — mọi
    // quy tắc validate riêng lẻ (size/checksum format/whitelist owner...) đã được kiểm tra đầy đủ
    // ở media.dto.spec.ts (28 test). Giữ số lần gọi presign() trong suite này dưới ngưỡng throttle
    // 10/phút (bookings.e2e-spec.ts đã gặp đúng lỗi "request thứ 11 tự trip throttle" trước đây).
    it('content_type ngoài whitelist (jpeg/png/webp) → 400 (ValidationPipe nối dây đúng — chi tiết từng rule xem media.dto.spec.ts)', async () => {
      const res = await presign(accessToken, { content_type: 'application/pdf', size: 100, checksum_sha256: 'a'.repeat(64) });
      expect(res.status).toBe(400);
    });

    // TRƯỚC (Media Upload Foundation): `place_id` được chấp nhận, chỉ kiểm tra place tồn tại →
    // 422 nếu không. NAY (Owner Place Photos): trường này bị gỡ hẳn khỏi DTO, nên bất kỳ giá trị
    // nào — tồn tại hay không — đều là 400 `forbidNonWhitelisted`. Đây là điểm mấu chốt: việc
    // "place có tồn tại không" chưa bao giờ là một phép kiểm tra QUYỀN, nên nó bị thay bằng route
    // /places/{id}/media/presign nơi guard cưỡng chế Media.Upload.Managed trên chính cơ sở đó.
    it('place_id (dù tồn tại hay không) → 400, không còn nhánh 422 nào cho trường này', async () => {
      const res = await presign(accessToken, {
        content_type: CONTENT_TYPE,
        size: 100,
        checksum_sha256: 'a'.repeat(64),
        place_id: '00000000-0000-4000-8000-000000000000',
      });
      expect(res.status).toBe(400);
    });

    it('payload hợp lệ → 201, key server-sinh dạng media/{uuid}.jpg, KHÔNG lộ presigned URL nội bộ storage nào ngoài upload_url', async () => {
      const content = fakeJpegBytes('presign-valid');
      const res = await presign(accessToken, {
        content_type: CONTENT_TYPE,
        size: content.length,
        checksum_sha256: sha256(content),
      });
      expect(res.status).toBe(201);
      expect(res.body.data.key).toMatch(/^media\/[0-9a-f-]{36}\.jpg$/);
      expect(res.body.data.upload_url).toEqual(expect.stringContaining('http'));
      expect(res.body.data.expires_in).toBe(600);
      expect(Object.keys(res.body.data).sort()).toEqual(['expires_in', 'key', 'upload_url']);
    });
  });

  describe('POST /api/media — full round trip against live MinIO', () => {
    it('luồng thành công: presign → PUT thật lên MinIO → register → 201, status=pending, url=null (không lộ media pending)', async () => {
      const content = fakeJpegBytes('roundtrip-success');
      const checksum = sha256(content);
      // Luồng MỒ CÔI (ảnh review) — KHÔNG gắn cơ sở. `place_id` đã bị gỡ khỏi DTO này
      // (Owner Place Photos, 2026-08-11); ảnh của cơ sở đi qua /places/{id}/media/presign.
      const presignRes = await presign(accessToken, {
        content_type: CONTENT_TYPE,
        size: content.length,
        checksum_sha256: checksum,
      });
      expect(presignRes.status).toBe(201);
      const { key, upload_url: uploadUrl } = presignRes.body.data;

      const putRes = await putToPresignedUrl(uploadUrl, content, CONTENT_TYPE);
      expect(putRes.status).toBe(200);

      const registerRes = await register(accessToken, { key, caption: 'Ảnh test e2e', alt: 'ảnh mô tả' });
      expect(registerRes.status).toBe(201);
      expect(registerRes.body.data).toMatchObject({
        status: 'pending',
        url: null,
        caption: 'Ảnh test e2e',
        alt_text: 'ảnh mô tả',
      });
      expect(registerRes.body.data.id).toBeTruthy();
      expect(registerRes.body.data.thumbnail_url).toBeNull();
    });

    // Chốt chặn hồi quy cho lỗ hổng đã đóng: presign mồ côi KHÔNG được nhận trường owner nào.
    // Nếu ai đó thêm lại `place_id` vào DTO, test này đỏ ngay.
    it('presign KÈM place_id → 400 (không có đường gắn ảnh vào cơ sở mà không qua kiểm tra quyền)', async () => {
      const content = fakeJpegBytes('spoof-place-id');
      const res = await presign(accessToken, {
        content_type: CONTENT_TYPE,
        size: content.length,
        checksum_sha256: sha256(content),
        place_id: placeId ?? '00000000-0000-4000-8000-000000000000',
      });
      expect(res.status).toBe(400);
    });

    it('key chưa từng presign (bịa ra) → 422, không tạo row', async () => {
      const res = await register(accessToken, { key: 'media/00000000-0000-4000-8000-000000000000.jpg' });
      expect(res.status).toBe(422);
    });

    it('user KHÁC cố register key không phải của mình → 403', async () => {
      const content = fakeJpegBytes('cross-user');
      const checksum = sha256(content);
      const presignRes = await presign(accessToken, { content_type: CONTENT_TYPE, size: content.length, checksum_sha256: checksum });
      const { key, upload_url: uploadUrl } = presignRes.body.data;
      await putToPresignedUrl(uploadUrl, content, CONTENT_TYPE);

      const res = await register(otherAccessToken, { key });
      expect(res.status).toBe(403);
    });

    it('checksum khai báo lúc presign KHÔNG khớp bytes thật đã PUT lên MinIO → 422 (fallback GET+stream+SHA-256 phát hiện)', async () => {
      const content = fakeJpegBytes('tampered-checksum');
      const wrongChecksum = 'f'.repeat(64); // cố tình khai sai để mô phỏng nội dung bị đổi
      const presignRes = await presign(accessToken, {
        content_type: CONTENT_TYPE,
        size: content.length,
        checksum_sha256: wrongChecksum,
      });
      const { key, upload_url: uploadUrl } = presignRes.body.data;
      await putToPresignedUrl(uploadUrl, content, CONTENT_TYPE);

      const res = await register(accessToken, { key });
      expect(res.status).toBe(422);
    });

    it('đăng ký trùng theo checksum (cùng người upload, 2 lần upload cùng nội dung) → lần 2 bị 409', async () => {
      const content = fakeJpegBytes('duplicate-content');
      const checksum = sha256(content);

      const presignRes1 = await presign(accessToken, { content_type: CONTENT_TYPE, size: content.length, checksum_sha256: checksum });
      const { key: key1, upload_url: uploadUrl1 } = presignRes1.body.data;
      await putToPresignedUrl(uploadUrl1, content, CONTENT_TYPE);
      const registerRes1 = await register(accessToken, { key: key1 });
      expect(registerRes1.status).toBe(201);

      const presignRes2 = await presign(accessToken, { content_type: CONTENT_TYPE, size: content.length, checksum_sha256: checksum });
      const { key: key2, upload_url: uploadUrl2 } = presignRes2.body.data;
      await putToPresignedUrl(uploadUrl2, content, CONTENT_TYPE);
      const registerRes2 = await register(accessToken, { key: key2 });
      expect(registerRes2.status).toBe(409);

      // The rejected duplicate's object must be gone from storage — proven by a second register
      // attempt on the SAME (now-deleted) key failing "missing" rather than re-processing it.
      const retryRes = await register(accessToken, { key: key2 });
      expect(retryRes.status).toBe(422);
    });

    it('không token → 401', async () => {
      const res = await request(app.getHttpServer()).post('/api/media').send({ key: 'media/00000000-0000-4000-8000-000000000000.jpg' });
      expect(res.status).toBe(401);
    });
  });
});
