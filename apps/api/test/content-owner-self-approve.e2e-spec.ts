import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import request from 'supertest';
import { createHash } from 'crypto';
import { AppModule } from '../src/app.module';
import { TransformInterceptor } from '../src/common/interceptors/transform.interceptor';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';

// content_owner self-approve + place_translations draft/publish (2026-09-16) — E2E trên
// Postgres/Redis THẬT, schema tương thích production (chạy sau `npm run migration:run` trên cùng
// chuỗi migration production dùng). Bao phủ đúng ma trận owner yêu cầu:
//   1. draft KHÔNG lộ ra kênh công khai (GET /hotels/:slug) trước khi publish.
//   2. VI/EN đúng sau khi publish — khách CHƯA đăng nhập (route @Public, không token) thấy đúng.
//   3. Xung đột ghi đồng thời trên trường scalar -> 409, không âm thầm ghi đè.
//   4. content_owner tự duyệt ẢNH CHÍNH MÌNH tải lên -> thành công, audit moderation.self_approved.
//   5. moderator THƯỜNG (không có Media.Moderate.Own) vẫn KHÔNG tự duyệt được ảnh của chính mình.
//   6. Tài khoản THƯỜNG (member, không có content_owner) không sửa được gì.
describe('content_owner — self-approve + description draft/publish (e2e)', () => {
  let app: INestApplication;
  let ds: DataSource;
  let jwt: JwtService;
  let config: ConfigService;
  let categoryId: string;

  const userIds: string[] = [];
  const placeIds: string[] = [];
  const mediaIds: string[] = [];
  const caseIds: string[] = [];

  let checksumCounter = 0;
  function uniqueChecksum(): string {
    checksumCounter += 1;
    return checksumCounter.toString().padStart(64, '0');
  }

  async function createUser(label: string) {
    const email = `e2e_content_owner_${label}_${Date.now()}_${Math.random().toString(36).slice(2)}@phuquochub.test`;
    const rows: Array<{ id: string }> = await ds.query(
      `INSERT INTO users (email, display_name) VALUES ($1, $2) RETURNING id`,
      [email, `ContentOwner E2E ${label}`],
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

  async function assignRole(userId: string, roleCode: string, scopeType: 'global' | 'managed' = 'global', businessId: string | null = null) {
    const [{ id: roleId }] = await ds.query(`SELECT id FROM roles WHERE code = $1`, [roleCode]);
    await ds.query(
      `INSERT INTO user_roles (user_id, role_id, scope_type, business_id) VALUES ($1,$2,$3,$4)`,
      [userId, roleId, scopeType, businessId],
    );
  }

  async function mkPlace(label: string): Promise<string> {
    const rows: Array<{ id: string }> = await ds.query(
      `INSERT INTO places (name, slug, category_id, location, status, description)
       VALUES ($1, $2, $3, ST_SetSRID(ST_MakePoint(103.9, 10.2), 4326)::geography, 'published', 'Mô tả gốc places.description')
       RETURNING id`,
      [`E2E ContentOwner ${label}`, `e2e-content-owner-${label}-${Date.now()}-${Math.random().toString(36).slice(2)}`, categoryId],
    );
    placeIds.push(rows[0].id);
    return rows[0].id;
  }

  async function seedPlaceMedia(placeId: string, uploadedBy: string, status = 'pending') {
    const rows: Array<{ id: string }> = await ds.query(
      `INSERT INTO media (type, provider, status, place_id, uploaded_by, object_key, bucket,
                          content_type, size_bytes, checksum_sha256)
       VALUES ('image','upload',$1,$2,$3,$4,'e2e-content-owner-bucket','image/jpeg',100,$5)
       RETURNING id`,
      [status, placeId, uploadedBy, `media/e2e-content-owner-${Date.now()}-${Math.random()}.jpg`, uniqueChecksum()],
    );
    mediaIds.push(rows[0].id);
    return rows[0].id;
  }

  async function seedOpenCase(mediaId: string): Promise<string> {
    const rows: Array<{ id: string }> = await ds.query(
      `INSERT INTO moderation_cases (target_type, target_id, status, source, severity, priority)
       VALUES ('media', $1, 'open', 'new_content', 'low', 0) RETURNING id`,
      [mediaId],
    );
    caseIds.push(rows[0].id);
    return rows[0].id;
  }

  // Luồng THẬT presign -> PUT lên MinIO thật -> register (2026-09-17, requirement 6): "chạy thật
  // luồng owner upload" -- cùng khuôn media.e2e-spec.ts's `putToPresignedUrl` (MinIO có thật trong
  // môi trường e2e ở đây, khác quy ước "không có MinIO trong CI" của place-media.e2e-spec.ts, nên
  // dùng đường thật thay vì seed thẳng bằng SQL). `register()` tự mở moderation case (severity
  // LOW, source NEW_CONTENT, xem MediaService.register()) -- KHÔNG cần seedOpenCase() nữa.
  function sha256(buf: Buffer): string {
    return createHash('sha256').update(buf).digest('hex');
  }
  function fakeJpegBytes(seed: string): Buffer {
    return Buffer.from(`e2e-content-owner-real-upload-${seed}-${Date.now()}-${Math.random()}`);
  }
  function putToPresignedUrl(uploadUrl: string, content: Buffer): Promise<Response> {
    return fetch(uploadUrl, { method: 'PUT', headers: { 'Content-Type': 'image/jpeg' }, body: content as BodyInit });
  }
  async function realUploadPendingMedia(placeId: string, accessToken: string): Promise<string> {
    const content = fakeJpegBytes(placeId);
    const checksum = sha256(content);
    const presignRes = await request(app.getHttpServer())
      .post(`/api/places/${placeId}/media/presign`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ content_type: 'image/jpeg', size: content.length, checksum_sha256: checksum });
    if (presignRes.status !== 201) {
      throw new Error(`presign thất bại (status ${presignRes.status}): ${JSON.stringify(presignRes.body)}`);
    }
    const { key, upload_url: uploadUrl } = presignRes.body.data;

    const putRes = await putToPresignedUrl(uploadUrl, content);
    if (putRes.status !== 200) {
      throw new Error(`PUT lên MinIO thất bại (status ${putRes.status})`);
    }

    const registerRes = await request(app.getHttpServer())
      .post(`/api/places/${placeId}/media`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ key, caption: 'Ảnh e2e content_owner thật', alt: 'ảnh test upload thật' });
    if (registerRes.status !== 201) {
      throw new Error(`register thất bại (status ${registerRes.status}): ${JSON.stringify(registerRes.body)}`);
    }
    const mediaId: string = registerRes.body.data.id;
    mediaIds.push(mediaId);
    return mediaId;
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
    jwt = app.get(JwtService);
    config = app.get(ConfigService);

    const [cat] = await ds.query(`SELECT id FROM categories LIMIT 1`);
    categoryId = cat.id;
  }, 30_000);

  afterAll(async () => {
    try {
      if (ds?.isInitialized) {
        if (caseIds.length) await ds.query(`DELETE FROM moderation_cases WHERE id = ANY($1)`, [caseIds]);
        if (mediaIds.length) await ds.query(`DELETE FROM media WHERE id = ANY($1)`, [mediaIds]);
        if (placeIds.length) {
          // Thứ tự PHẢI đúng: place_translations.revision_id có FK TỚI wiki_revisions (xoá
          // wiki_revisions trước sẽ vỡ FK đó — đã xảy ra thật khi chạy lần đầu). Xoá
          // place_translations TRƯỚC, rồi mới xoá các wiki_revisions liên quan (cả loại
          // 'place_translation', entity_id = id CỦA CHÍNH bản dịch vừa xoá — lưu lại id TRƯỚC khi
          // xoá bảng — lẫn loại 'place' thường, entity_id = placeId).
          const translationIds: Array<{ id: string }> = await ds.query(
            `SELECT id FROM place_translations WHERE place_id = ANY($1)`,
            [placeIds],
          );
          await ds.query(`DELETE FROM place_translations WHERE place_id = ANY($1)`, [placeIds]);
          if (translationIds.length) {
            await ds.query(`DELETE FROM wiki_revisions WHERE entity_id = ANY($1)`, [
              translationIds.map((t) => t.id),
            ]);
          }
          await ds.query(`DELETE FROM wiki_revisions WHERE entity_id = ANY($1)`, [placeIds]);
        }
        if (userIds.length) await ds.query(`DELETE FROM user_roles WHERE user_id = ANY($1)`, [userIds]);
        if (placeIds.length) {
          await ds.query(`UPDATE places SET cover_image_id = NULL WHERE id = ANY($1)`, [placeIds]);
          await ds.query(`DELETE FROM media WHERE place_id = ANY($1)`, [placeIds]);
          await ds.query(`DELETE FROM places WHERE id = ANY($1)`, [placeIds]);
        }
        if (userIds.length) {
          await ds.query(`DELETE FROM audit_logs WHERE entity_id = ANY($1) OR actor_id = ANY($1)`, [userIds]);
          await ds.query(`DELETE FROM users WHERE id = ANY($1)`, [userIds]);
        }
      }
    } finally {
      if (app) await app.close();
    }
  });

  // ---- 1/2. Draft không lộ công khai; VI/EN đúng sau publish, khách chưa đăng nhập thấy đúng ---

  describe('Description VI/EN: draft không lộ, publish đúng cho khách chưa đăng nhập', () => {
    it('luồng đầy đủ: draft -> KHÔNG lộ public -> publish -> khách (không token) thấy đúng VI/EN', async () => {
      const owner = await createUser('desc_owner');
      await assignRole(owner.userId, 'content_owner');
      const placeId = await mkPlace('desc');
      const [{ slug }] = await ds.query(`SELECT slug FROM places WHERE id = $1`, [placeId]);

      // Trước khi có bất kỳ thao tác nào: khách thấy đúng mô tả GỐC (places.description).
      const before = await request(app.getHttpServer()).get(`/api/places/${slug}`);
      expect(before.status).toBe(200);
      expect(before.body.data.description).toBe('Mô tả gốc places.description');

      // Lưu nháp VI+EN.
      const draft = await request(app.getHttpServer())
        .post(`/api/places/${placeId}/description/draft`)
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .send({ vi: 'Mô tả VI MỚI (nháp)', en: 'New EN description (draft)' });
      expect(draft.status).toBe(201);

      // NGAY SAU KHI LƯU NHÁP: khách (KHÔNG token, route @Public) vẫn thấy mô tả GỐC — draft
      // KHÔNG được phép rò rỉ ra kênh công khai dưới bất kỳ hình thức nào.
      const afterDraft = await request(app.getHttpServer()).get(`/api/places/${slug}`);
      expect(afterDraft.body.data.description).toBe('Mô tả gốc places.description');
      const afterDraftEn = await request(app.getHttpServer()).get(`/api/places/${slug}?locale=en`);
      expect(afterDraftEn.body.data.description).not.toBe('New EN description (draft)');

      // Công khai.
      const publish = await request(app.getHttpServer())
        .post(`/api/places/${placeId}/description/publish`)
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .send();
      expect(publish.status).toBe(201);
      expect(publish.body.data).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ locale_code: 'vi', ok: true }),
          expect.objectContaining({ locale_code: 'en', ok: true }),
        ]),
      );

      // Khách (KHÔNG token) giờ thấy ĐÚNG bản dịch mới, cho cả hai locale.
      const publicVi = await request(app.getHttpServer()).get(`/api/places/${slug}?locale=vi`);
      expect(publicVi.body.data.description).toBe('Mô tả VI MỚI (nháp)');
      const publicEn = await request(app.getHttpServer()).get(`/api/places/${slug}?locale=en`);
      expect(publicEn.body.data.description).toBe('New EN description (draft)');
    });

    it('tài khoản THƯỜNG (member) không thể lưu nháp hay công khai mô tả', async () => {
      const member = await createUser('desc_member');
      const placeId = await mkPlace('desc_member_place');

      const draft = await request(app.getHttpServer())
        .post(`/api/places/${placeId}/description/draft`)
        .set('Authorization', `Bearer ${member.accessToken}`)
        .send({ vi: 'không được phép' });
      expect(draft.status).toBe(403);

      const publish = await request(app.getHttpServer())
        .post(`/api/places/${placeId}/description/publish`)
        .set('Authorization', `Bearer ${member.accessToken}`)
        .send();
      expect(publish.status).toBe(403);
    });
  });

  // ---- Requirement 1 (2026-09-17): name/short_description dùng ĐÚNG cơ chế place_translations,
  // KHÔNG chỉ cập nhật cột places.<col> — cùng ma trận draft-không-lộ/publish-đúng đã kiểm cho
  // description ở trên, generalize sang field_key display_name/short_description. Không lặp lại
  // TOÀN BỘ ma trận (đã kiểm hết ở mức unit cho phần dùng chung) — chỉ smoke-test đủ để xác nhận
  // route/field_key ĐÚNG trên Postgres thật.
  describe('Tên hiển thị + mô tả ngắn VI/EN: CÙNG cơ chế place_translations như mô tả chi tiết', () => {
    it('name: draft không lộ public, publish xong khách thấy đúng tên VI/EN', async () => {
      const owner = await createUser('name_owner');
      await assignRole(owner.userId, 'content_owner');
      const placeId = await mkPlace('name_field');
      const [{ slug, name: originalName }] = await ds.query(`SELECT slug, name FROM places WHERE id = $1`, [placeId]);

      const draft = await request(app.getHttpServer())
        .post(`/api/places/${placeId}/name/draft`)
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .send({ vi: 'Tên VI mới', en: 'New EN name' });
      expect(draft.status).toBe(201);

      const beforePublish = await request(app.getHttpServer()).get(`/api/places/${slug}`);
      expect(beforePublish.body.data.name).toBe(originalName);

      const publish = await request(app.getHttpServer())
        .post(`/api/places/${placeId}/name/publish`)
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .send();
      expect(publish.status).toBe(201);

      const publicVi = await request(app.getHttpServer()).get(`/api/places/${slug}?locale=vi`);
      expect(publicVi.body.data.name).toBe('Tên VI mới');
      const publicEn = await request(app.getHttpServer()).get(`/api/places/${slug}?locale=en`);
      expect(publicEn.body.data.name).toBe('New EN name');
    });

    it('short_description: draft không lộ public, publish xong khách thấy đúng VI/EN', async () => {
      const owner = await createUser('shortdesc_owner');
      await assignRole(owner.userId, 'content_owner');
      const placeId = await mkPlace('shortdesc_field');
      const [{ slug }] = await ds.query(`SELECT slug FROM places WHERE id = $1`, [placeId]);

      const draft = await request(app.getHttpServer())
        .post(`/api/places/${placeId}/short-description/draft`)
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .send({ vi: 'Ngắn VI mới', en: 'New EN short' });
      expect(draft.status).toBe(201);

      const publish = await request(app.getHttpServer())
        .post(`/api/places/${placeId}/short-description/publish`)
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .send();
      expect(publish.status).toBe(201);

      const publicVi = await request(app.getHttpServer()).get(`/api/places/${slug}?locale=vi`);
      expect(publicVi.body.data.short_description).toBe('Ngắn VI mới');
      const publicEn = await request(app.getHttpServer()).get(`/api/places/${slug}?locale=en`);
      expect(publicEn.body.data.short_description).toBe('New EN short');
    });

    it('member thường không lưu nháp/publish được tên lẫn mô tả ngắn', async () => {
      const member = await createUser('name_member');
      const placeId = await mkPlace('name_member_place');

      const nameDraft = await request(app.getHttpServer())
        .post(`/api/places/${placeId}/name/draft`)
        .set('Authorization', `Bearer ${member.accessToken}`)
        .send({ vi: 'không được phép' });
      expect(nameDraft.status).toBe(403);

      const shortDraft = await request(app.getHttpServer())
        .post(`/api/places/${placeId}/short-description/draft`)
        .set('Authorization', `Bearer ${member.accessToken}`)
        .send({ vi: 'không được phép' });
      expect(shortDraft.status).toBe(403);
    });
  });

  // ---- Requirement 1 (2026-09-17): location nay CÓ CAS thật (trước đây saveDraft() từ chối tường
  // minh) — kiểm cả đường thành công lẫn 409 xung đột thật trên Postgres/PostGIS thật. ------------
  describe('Vị trí (location): CAS thật qua saveDraft/publishDraft (2026-09-17, trước đây bị từ chối)', () => {
    it('publishDraft location KHÔNG xung đột -> áp thành công, toạ độ mới phản ánh đúng qua ST_Y/ST_X', async () => {
      const owner = await createUser('loc_owner_ok');
      await assignRole(owner.userId, 'content_owner');
      const placeId = await mkPlace('loc_ok');

      const draft = await request(app.getHttpServer())
        .post(`/api/places/${placeId}/draft`)
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .send({ location: { lat: 10.2, lng: 104.05 } });
      expect(draft.status).toBe(201);

      const publish = await request(app.getHttpServer())
        .post(`/api/places/${placeId}/revisions/${draft.body.data.id}/publish`)
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .send();
      expect(publish.status).toBe(201);
      expect(publish.body.data.location.lat).toBeCloseTo(10.2, 5);
      expect(publish.body.data.location.lng).toBeCloseTo(104.05, 5);
    });

    it('publishDraft location XUNG ĐỘT (ai đó sửa toạ độ sau khi lưu nháp) -> 409, KHÔNG âm thầm ghi đè', async () => {
      const owner = await createUser('loc_owner_conflict');
      await assignRole(owner.userId, 'content_owner');
      const placeId = await mkPlace('loc_conflict');

      const draft = await request(app.getHttpServer())
        .post(`/api/places/${placeId}/draft`)
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .send({ location: { lat: 10.3, lng: 104.1 } });
      expect(draft.status).toBe(201);

      // Một tác nhân KHÁC sửa toạ độ TRỰC TIẾP sau khi nháp được tạo.
      await ds.query(
        `UPDATE places SET location = ST_SetSRID(ST_MakePoint(103.5,10.0),4326)::geography, updated_at = now() WHERE id = $1`,
        [placeId],
      );

      const publish = await request(app.getHttpServer())
        .post(`/api/places/${placeId}/revisions/${draft.body.data.id}/publish`)
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .send();
      expect(publish.status).toBe(409);

      const [row] = await ds.query(`SELECT ST_X(location::geometry) AS lng FROM places WHERE id = $1`, [placeId]);
      expect(Number(row.lng)).toBeCloseTo(103.5, 5);
    });
  });

  // ---- 3. Xung đột ghi đồng thời trên trường scalar -> 409 --------------------------------------

  describe('Xung đột ghi đồng thời (CAS) trên place scalar draft/publish', () => {
    it('publishDraft với updated_at đã trôi (ai đó sửa place sau khi lưu nháp) -> 409, KHÔNG âm thầm ghi đè', async () => {
      const owner = await createUser('cas_owner');
      await assignRole(owner.userId, 'content_owner');
      const placeId = await mkPlace('cas');

      const draft = await request(app.getHttpServer())
        .post(`/api/places/${placeId}/draft`)
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .send({ address: 'Địa chỉ MỚI (nháp)' });
      expect(draft.status).toBe(201);
      const revisionId = draft.body.data.id;
      expect(revisionId).toBeTruthy();

      // Một tác nhân KHÁC sửa cùng place TRỰC TIẾP sau khi nháp được tạo (giả lập xung đột thật).
      await ds.query(`UPDATE places SET address = 'Ai đó khác vừa sửa', updated_at = now() WHERE id = $1`, [placeId]);

      const publish = await request(app.getHttpServer())
        .post(`/api/places/${placeId}/revisions/${revisionId}/publish`)
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .send();
      expect(publish.status).toBe(409);

      // Giá trị của "ai đó khác" PHẢI còn nguyên — publish thất bại không được âm thầm ghi đè.
      const [row] = await ds.query(`SELECT address FROM places WHERE id = $1`, [placeId]);
      expect(row.address).toBe('Ai đó khác vừa sửa');
    });

    // Đây chính là bài test độ chính xác token yêu cầu bởi requirement 5 (2026-09-17): sửa lại
    // trước dùng `date_trunc('milliseconds', ...)` để bù việc JS Date chỉ giữ được độ phân giải
    // mili-giây — NHƯNG làm tròn cùng đơn vị ở cả hai vế mở đúng cửa sổ đua: hai bản nháp đọc CÙNG
    // trạng thái gốc rồi publish hai lần LIÊN TIẾP (không delay nhân tạo, cùng tick sự kiện, gần
    // như chắc chắn rơi cùng mili-giây trên một DB test cục bộ) — lần publish THỨ HAI phải 409 dù
    // đồng hồ hệ thống không phân biệt được hai lần ghi. Test này sẽ ĐỎ nếu quay lại so sánh
    // timestamp làm tròn: `xmin` là mã giao dịch, đổi ở MỌI lần UPDATE bất kể tốc độ ghi.
    it('hai bản nháp cùng đọc trạng thái gốc, publish LIÊN TIẾP không delay -> bản THỨ HAI vẫn 409 (không lost update dù trùng mili-giây)', async () => {
      const owner = await createUser('cas_race_owner');
      await assignRole(owner.userId, 'content_owner');
      const placeId = await mkPlace('cas_race');

      // Cả hai nháp đọc CÙNG một trạng thái gốc (getCardByIdIncludingInactive chưa bị ai đụng vào)
      // -> cùng mang theo baseVersion CŨ.
      const draftA = await request(app.getHttpServer())
        .post(`/api/places/${placeId}/draft`)
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .send({ address: 'Nháp A' });
      expect(draftA.status).toBe(201);
      const draftB = await request(app.getHttpServer())
        .post(`/api/places/${placeId}/draft`)
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .send({ address: 'Nháp B' });
      expect(draftB.status).toBe(201);

      // Publish A ngay lập tức — đổi xmin của dòng `places`, KHÔNG chờ gì cả (không setTimeout,
      // không cách nhau một mili-giây nào theo đồng hồ hệ thống là điều CÓ THỂ xảy ra ở đây).
      const publishA = await request(app.getHttpServer())
        .post(`/api/places/${placeId}/revisions/${draftA.body.data.id}/publish`)
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .send();
      expect(publishA.status).toBe(201);

      // Publish B NGAY SAU đó, cùng tick — B vẫn mang baseVersion đọc TRƯỚC publish A, nên phải
      // 409 dù khoảng cách thời gian giữa hai request có thể dưới 1ms.
      const publishB = await request(app.getHttpServer())
        .post(`/api/places/${placeId}/revisions/${draftB.body.data.id}/publish`)
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .send();
      expect(publishB.status).toBe(409);

      // Giá trị của A (ghi thành công đầu tiên) PHẢI còn nguyên — B thất bại không được ghi đè.
      const [row] = await ds.query(`SELECT address FROM places WHERE id = $1`, [placeId]);
      expect(row.address).toBe('Nháp A');
    });

    it('publishDraft KHÔNG có xung đột -> áp thành công, 200/201', async () => {
      const owner = await createUser('cas_owner_ok');
      await assignRole(owner.userId, 'content_owner');
      const placeId = await mkPlace('cas_ok');

      const draft = await request(app.getHttpServer())
        .post(`/api/places/${placeId}/draft`)
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .send({ address: 'Địa chỉ mới không xung đột' });
      const revisionId = draft.body.data.id;

      const publish = await request(app.getHttpServer())
        .post(`/api/places/${placeId}/revisions/${revisionId}/publish`)
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .send();
      expect(publish.status).toBe(201);

      const [row] = await ds.query(`SELECT address FROM places WHERE id = $1`, [placeId]);
      expect(row.address).toBe('Địa chỉ mới không xung đột');
    });
  });

  // ---- 4/5. Media self-approve: content_owner thành công + audit; moderator thường vẫn 403 -----

  describe('Media self-approve wrapper (INV-12 exception)', () => {
    // Luồng THẬT đầy đủ (requirement 6, 2026-09-17): upload thật qua MinIO (không seed SQL) ->
    // xem trước (kênh nội bộ, ảnh pending không có URL công khai) -> KHÔNG lộ ra gallery công khai
    // trước khi duyệt -> tự duyệt -> ảnh công khai thật -> audit.
    it('luồng thật: upload (presign+PUT MinIO+register) -> xem trước -> CHƯA công khai -> tự duyệt -> công khai + audit', async () => {
      const owner = await createUser('media_owner');
      await assignRole(owner.userId, 'content_owner');
      const placeId = await mkPlace('media');

      const mediaId = await realUploadPendingMedia(placeId, owner.accessToken);

      // register() tự mở case kiểm duyệt thật (MediaService.register) — xác nhận trước khi tự duyệt.
      const [openCase] = await ds.query(
        `SELECT id, status FROM moderation_cases WHERE target_type = 'media' AND target_id = $1`,
        [mediaId],
      );
      expect(openCase.status).toBe('open');
      caseIds.push(openCase.id);

      // Xem trước (kênh nội bộ theo cơ sở) — ảnh pending vẫn phải xem được bởi chính chủ.
      const preview = await request(app.getHttpServer())
        .get(`/api/places/${placeId}/media/${mediaId}/file`)
        .set('Authorization', `Bearer ${owner.accessToken}`);
      expect(preview.status).toBe(302);
      expect(preview.headers.location).toEqual(expect.stringContaining('http'));

      // CHƯA công khai — danh sách ảnh công khai của place (getBySlug's media) không được có ảnh này.
      const beforeApprove = await request(app.getHttpServer()).get(`/api/hotels/${(await ds.query('SELECT slug FROM places WHERE id=$1', [placeId]))[0].slug}`);
      const beforeMediaIds = (beforeApprove.body.data.media ?? []).map((m: { id: string }) => m.id);
      expect(beforeMediaIds).not.toContain(mediaId);

      const res = await request(app.getHttpServer())
        .post(`/api/places/${placeId}/media/${mediaId}/self-approve`)
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .send();
      expect(res.status).toBe(200);

      const [media] = await ds.query(`SELECT status FROM media WHERE id = $1`, [mediaId]);
      expect(media.status).toBe('published');

      // Công khai thật sau khi duyệt — khách (không token) thấy đúng ảnh vừa duyệt trong gallery.
      const afterApprove = await request(app.getHttpServer()).get(`/api/hotels/${(await ds.query('SELECT slug FROM places WHERE id=$1', [placeId]))[0].slug}`);
      const afterMediaIds = (afterApprove.body.data.media ?? []).map((m: { id: string }) => m.id);
      expect(afterMediaIds).toContain(mediaId);

      const auditRows = await ds.query(
        `SELECT event FROM audit_logs WHERE entity_id = $1 AND event = 'moderation.self_approved'`,
        [mediaId],
      );
      expect(auditRows).toHaveLength(1);
    }, 20_000);

    it('moderator THƯỜNG (Media.Moderate, không có .Own) vẫn KHÔNG tự duyệt được ảnh của chính mình', async () => {
      const moderatorWhoUploads = await createUser('media_moderator_self');
      await assignRole(moderatorWhoUploads.userId, 'moderator');
      const placeId = await mkPlace('media_moderator');
      const mediaId = await seedPlaceMedia(placeId, moderatorWhoUploads.userId, 'pending');
      await seedOpenCase(mediaId);

      const res = await request(app.getHttpServer())
        .post(`/api/places/${placeId}/media/${mediaId}/self-approve`)
        .set('Authorization', `Bearer ${moderatorWhoUploads.accessToken}`)
        .send();
      expect(res.status).toBe(403);

      const [media] = await ds.query(`SELECT status FROM media WHERE id = $1`, [mediaId]);
      expect(media.status).toBe('pending');
    });

    it('tài khoản THƯỜNG (member) không qua được guard route self-approve (thiếu Media.Upload.Managed)', async () => {
      const member = await createUser('media_member');
      const placeId = await mkPlace('media_member_place');
      const mediaId = await seedPlaceMedia(placeId, member.userId, 'pending');
      await seedOpenCase(mediaId);

      const res = await request(app.getHttpServer())
        .post(`/api/places/${placeId}/media/${mediaId}/self-approve`)
        .set('Authorization', `Bearer ${member.accessToken}`)
        .send();
      expect(res.status).toBe(403);
    });

    it('content_owner cố tự duyệt ảnh của NGƯỜI KHÁC qua wrapper -> 403 (uploaded_by mismatch, không lộ case_id để vòng qua)', async () => {
      const owner = await createUser('media_owner_2');
      await assignRole(owner.userId, 'content_owner');
      const otherUploader = await createUser('media_other_uploader');
      const placeId = await mkPlace('media_other');
      const mediaId = await seedPlaceMedia(placeId, otherUploader.userId, 'pending');
      await seedOpenCase(mediaId);

      const res = await request(app.getHttpServer())
        .post(`/api/places/${placeId}/media/${mediaId}/self-approve`)
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .send();
      expect(res.status).toBe(403);

      const [media] = await ds.query(`SELECT status FROM media WHERE id = $1`, [mediaId]);
      expect(media.status).toBe('pending');
    });
  });

  // ---- Yêu cầu 2 (2026-09-17): phạm vi kiểm duyệt content_owner — tự duyệt VÀ duyệt của người
  // khác là HAI năng lực khác nhau (Media.Moderate.Own vs Media.Moderate), kiểm thử RIÊNG. --------
  describe('content_owner — kiểm duyệt ẢNH CỦA NGƯỜI KHÁC qua luồng thường (GrantContentOwnerMediaModerationScope, KHÁC wrapper self-approve)', () => {
    it('content_owner duyệt (approve) ảnh của NGƯỜI KHÁC qua POST /moderation/cases/:id/decide -> 200, published, audit moderation.decided (KHÔNG phải self_approved)', async () => {
      const owner = await createUser('mod_scope_owner');
      await assignRole(owner.userId, 'content_owner');
      const otherUploader = await createUser('mod_scope_other');
      const placeId = await mkPlace('mod_scope');
      const mediaId = await seedPlaceMedia(placeId, otherUploader.userId, 'pending');
      const caseId = await seedOpenCase(mediaId);

      const res = await request(app.getHttpServer())
        .post(`/api/moderation/cases/${caseId}/decide`)
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .send({ decision: 'approve' });
      expect(res.status).toBe(200);

      const [media] = await ds.query(`SELECT status FROM media WHERE id = $1`, [mediaId]);
      expect(media.status).toBe('published');

      // Duyệt ảnh CỦA NGƯỜI KHÁC không đi qua nhánh INV-12 self-approve -> chỉ audit
      // moderation.decided thường, KHÔNG có moderation.self_approved cho case này.
      const decidedAudit = await ds.query(
        `SELECT event FROM audit_logs WHERE entity_id = $1 AND event = 'moderation.decided'`,
        [mediaId],
      );
      expect(decidedAudit.length).toBeGreaterThanOrEqual(1);
      const selfApprovedAudit = await ds.query(
        `SELECT event FROM audit_logs WHERE entity_id = $1 AND event = 'moderation.self_approved'`,
        [mediaId],
      );
      expect(selfApprovedAudit).toHaveLength(0);
    });

    it('content_owner từ chối (reject) ảnh của NGƯỜI KHÁC qua decide -> 200, rejected', async () => {
      const owner = await createUser('mod_scope_owner_reject');
      await assignRole(owner.userId, 'content_owner');
      const otherUploader = await createUser('mod_scope_other_reject');
      const placeId = await mkPlace('mod_scope_reject');
      const mediaId = await seedPlaceMedia(placeId, otherUploader.userId, 'pending');
      const caseId = await seedOpenCase(mediaId);

      const res = await request(app.getHttpServer())
        .post(`/api/moderation/cases/${caseId}/decide`)
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .send({ decision: 'reject', reason: 'không liên quan', reason_code: 'unrelated_to_place' });
      expect(res.status).toBe(200);

      const [media] = await ds.query(`SELECT status FROM media WHERE id = $1`, [mediaId]);
      expect(media.status).toBe('rejected');
    });

    it('content_owner xem được hàng chờ kiểm duyệt (Moderation.Queue.View) -> 200, thấy case vừa tạo', async () => {
      const owner = await createUser('mod_scope_owner_queue');
      await assignRole(owner.userId, 'content_owner');
      const otherUploader = await createUser('mod_scope_other_queue');
      const placeId = await mkPlace('mod_scope_queue');
      const mediaId = await seedPlaceMedia(placeId, otherUploader.userId, 'pending');
      const caseId = await seedOpenCase(mediaId);

      const res = await request(app.getHttpServer())
        .get('/api/moderation/cases')
        .set('Authorization', `Bearer ${owner.accessToken}`);
      expect(res.status).toBe(200);
      const ids = (res.body.data.items ?? res.body.data).map((c: { id: string }) => c.id);
      expect(ids).toContain(caseId);
    });

    // Đối chứng: MỘT tài khoản content_owner KHÁC (chưa từng chạm case này) vẫn tự duyệt được ảnh
    // CỦA CHÍNH MÌNH qua wrapper self-approve — hai năng lực (tự duyệt vs duyệt người khác) độc lập,
    // không cái nào che khuất cái kia.
    it('CÙNG một content_owner: tự duyệt ảnh CỦA MÌNH (wrapper) VÀ duyệt ảnh NGƯỜI KHÁC (decide thường) đều hoạt động độc lập', async () => {
      const owner = await createUser('mod_scope_both');
      await assignRole(owner.userId, 'content_owner');
      const otherUploader = await createUser('mod_scope_both_other');
      const placeId = await mkPlace('mod_scope_both');

      // (a) Ảnh CỦA CHÍNH owner -> qua wrapper self-approve.
      const ownMediaId = await seedPlaceMedia(placeId, owner.userId, 'pending');
      await seedOpenCase(ownMediaId);
      const selfRes = await request(app.getHttpServer())
        .post(`/api/places/${placeId}/media/${ownMediaId}/self-approve`)
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .send();
      expect(selfRes.status).toBe(200);

      // (b) Ảnh CỦA NGƯỜI KHÁC -> qua decide thường (Media.Moderate, không phải wrapper).
      const otherMediaId = await seedPlaceMedia(placeId, otherUploader.userId, 'pending');
      const otherCaseId = await seedOpenCase(otherMediaId);
      const decideRes = await request(app.getHttpServer())
        .post(`/api/moderation/cases/${otherCaseId}/decide`)
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .send({ decision: 'approve' });
      expect(decideRes.status).toBe(200);

      const rows = await ds.query(`SELECT id, status FROM media WHERE id = ANY($1)`, [[ownMediaId, otherMediaId]]);
      expect(rows.every((r: { status: string }) => r.status === 'published')).toBe(true);
    });
  });
});
