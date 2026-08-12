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

// Owner Place Photos (2026-08-11) — ranh giới BẢO MẬT của ảnh cơ sở, trên Postgres THẬT, đi qua
// guard THẬT (không mock PDP/resolver nào).
//
// Quyết định sản phẩm (chốt, MVP): ảnh của chủ cơ sở KHÔNG BAO GIỜ tự công khai —
// upload -> `pending` -> moderator duyệt (`published`) hoặc từ chối (`rejected`).
//
// Trọng tâm chứng minh:
//  1. Chỉ chủ/quản lý cơ sở mới đăng được ảnh cho ĐÚNG cơ sở đó (Media.Upload.Managed + ADR-019).
//  2. KHÔNG thể tráo place_id — `place_id` đã bị gỡ khỏi body presign, và place id trên path là
//     thứ guard cưỡng chế quyền, nên không tồn tại đường nào gắn ảnh vào cơ sở của người khác.
//  3. Ảnh `pending`/`rejected` KHÔNG BAO GIỜ lộ ra kênh công khai (gallery + /media/{id}/file).
//  4. Duyệt -> hiện công khai; từ chối -> vẫn ẩn; transition sai -> 422.
//
// Các bước cần OBJECT THẬT trong storage (presign/PUT/register) không chạy ở đây — E2E này không
// có MinIO trong CI. Thay vào đó dòng `media` được seed THẲNG bằng SQL đúng hình dạng mà
// `createUploaded()` tạo ra, rồi mọi assertion còn lại chạy qua HTTP thật. Phần presign/register
// đã được `place-media.service.spec.ts` phủ ở mức unit.
describe('Owner Place Photos — security boundary (live Postgres)', () => {
  let app: INestApplication;
  let ds: DataSource;
  let jwt: JwtService;
  let config: ConfigService;
  let categoryId: string;

  const userIds: string[] = [];
  const placeIds: string[] = [];
  const mediaIds: string[] = [];

  async function createUser(label: string) {
    const email = `e2e_placemedia_${label}_${Date.now()}_${Math.random().toString(36).slice(2)}@phuquochub.test`;
    const rows: Array<{ id: string }> = await ds.query(
      `INSERT INTO users (email, display_name) VALUES ($1, $2) RETURNING id`,
      [email, `PlaceMedia E2E ${label}`],
    );
    const userId = rows[0].id;
    userIds.push(userId);
    const accessTtl = config.get<number>('jwt.accessTtl') ?? 900;
    const accessToken = await jwt.signAsync(
      { sub: userId, email, type: 'access' },
      { secret: config.get<string>('jwt.accessSecret'), expiresIn: accessTtl },
    );
    return { accessToken, userId };
  }

  async function assignRole(
    userId: string,
    roleCode: string,
    scopeType: 'global' | 'managed' | 'own',
    businessId: string | null,
  ): Promise<void> {
    const [{ id: roleId }] = await ds.query(`SELECT id FROM roles WHERE code = $1`, [roleCode]);
    await ds.query(`INSERT INTO user_roles (user_id, role_id, scope_type, business_id) VALUES ($1,$2,$3,$4)`, [
      userId,
      roleId,
      scopeType,
      businessId,
    ]);
  }

  async function mkPlace(label: string): Promise<string> {
    const rows: Array<{ id: string }> = await ds.query(
      `INSERT INTO places (name, slug, category_id, location, status)
       VALUES ($1, $2, $3, ST_SetSRID(ST_MakePoint(103.9, 10.2), 4326)::geography, 'published')
       RETURNING id`,
      [
        `E2E PlaceMedia ${label}`,
        `e2e-placemedia-${label}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        categoryId,
      ],
    );
    placeIds.push(rows[0].id);
    return rows[0].id;
  }

  /** Place + chủ sở hữu hiệu lực THẬT (business_members + user_roles managed). */
  async function mkPlaceWithOwner(label: string) {
    const placeId = await mkPlace(label);
    const owner = await createUser(`${label}_owner`);
    await ds.query(
      `INSERT INTO business_members (place_id, user_id, role, granted_by) VALUES ($1, $2, 'owner', $2)`,
      [placeId, owner.userId],
    );
    await assignRole(owner.userId, 'business_owner', 'managed', placeId);
    return { placeId, ...owner };
  }

  async function mkManagerForPlace(placeId: string, label: string) {
    const manager = await createUser(`${label}_manager`);
    await ds.query(
      `INSERT INTO business_members (place_id, user_id, role, granted_by) VALUES ($1, $2, 'manager', $2)`,
      [placeId, manager.userId],
    );
    await assignRole(manager.userId, 'business_manager', 'managed', placeId);
    return manager;
  }

  async function createModerator(label: string) {
    const u = await createUser(label);
    await assignRole(u.userId, 'moderator', 'global', null);
    return u;
  }

  /** Dòng media ĐÚNG hình dạng `createUploaded()` sinh ra (provider=upload, url=null). */
  async function seedPlaceMedia(
    placeId: string,
    uploadedBy: string,
    status: 'pending' | 'published' | 'rejected' = 'pending',
  ): Promise<string> {
    const rows: Array<{ id: string }> = await ds.query(
      `INSERT INTO media (place_id, type, provider, status, object_key, bucket, content_type,
                          size_bytes, checksum_sha256, uploaded_by, url)
       VALUES ($1, 'image', 'upload', $2, $3, 'test-bucket', 'image/jpeg', 1000, $4, $5, NULL)
       RETURNING id`,
      [
        placeId,
        status,
        `media/${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`,
        Math.random().toString(16).slice(2).padEnd(64, '0').slice(0, 64),
        uploadedBy,
      ],
    );
    mediaIds.push(rows[0].id);
    return rows[0].id;
  }

  /** Case kiểm duyệt new_content — đúng thứ `register()` tạo trong cùng transaction. */
  async function seedCase(mediaId: string): Promise<string> {
    const rows: Array<{ id: string }> = await ds.query(
      `INSERT INTO moderation_cases (target_type, target_id, status, source, severity, priority)
       VALUES ('media', $1, 'open', 'new_content', 'low', 0) RETURNING id`,
      [mediaId],
    );
    return rows[0].id;
  }

  const validPresignBody = {
    content_type: 'image/jpeg',
    size: 1000,
    checksum_sha256: 'a'.repeat(64),
  };

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

  afterAll(async () => {
    try {
      if (ds?.isInitialized) {
        if (mediaIds.length) {
          await ds.query(`DELETE FROM moderation_cases WHERE target_type='media' AND target_id = ANY($1)`, [
            mediaIds,
          ]);
          await ds.query(`DELETE FROM media WHERE id = ANY($1)`, [mediaIds]);
        }
        // media.place_id -> places NO ACTION: media phải xoá TRƯỚC places (đã làm ở trên).
        if (userIds.length) await ds.query(`DELETE FROM user_roles WHERE user_id = ANY($1)`, [userIds]);
        if (placeIds.length) await ds.query(`DELETE FROM places WHERE id = ANY($1)`, [placeIds]);
        if (userIds.length) {
          await ds.query(
            `DELETE FROM audit_logs WHERE actor_id = ANY($1) AND (event LIKE 'media.%' OR event = 'moderation.decided')`,
            [userIds],
          );
          await ds.query(`DELETE FROM users WHERE id = ANY($1)`, [userIds]);
        }
      }
    } finally {
      if (app) await app.close();
    }
  }, 30_000);

  // ---- A. place_id không thể bị tráo ----
  describe('Chống tráo place_id', () => {
    // Đây là lỗ hổng ĐÃ ĐÓNG trong milestone này: trước đây `place_id` nằm trong body presign và
    // chỉ được kiểm tra "có tồn tại", nên bất kỳ member nào cũng gắn được ảnh vào cơ sở người khác.
    it('POST /media/presign KHÔNG còn chấp nhận place_id trong body -> 400', async () => {
      const stranger = await createUser('spoof_body');
      await assignRole(stranger.userId, 'member', 'global', null);
      const victim = await mkPlaceWithOwner('spoof_victim');

      const res = await request(app.getHttpServer())
        .post('/api/media/presign')
        .set('Authorization', `Bearer ${stranger.accessToken}`)
        .send({ ...validPresignBody, place_id: victim.placeId });

      expect(res.status).toBe(400);
    });
  });

  // ---- B. Phân quyền upload ----
  describe('Phân quyền đăng ảnh cho cơ sở', () => {
    it('anonymous -> 401 trên presign, list và delete', async () => {
      const owner = await mkPlaceWithOwner('anon');
      const mediaId = await seedPlaceMedia(owner.placeId, owner.userId);

      const presign = await request(app.getHttpServer())
        .post(`/api/places/${owner.placeId}/media/presign`)
        .send(validPresignBody);
      expect(presign.status).toBe(401);

      const list = await request(app.getHttpServer()).get(`/api/places/${owner.placeId}/media`);
      expect(list.status).toBe(401);

      const del = await request(app.getHttpServer()).delete(
        `/api/places/${owner.placeId}/media/${mediaId}`,
      );
      expect(del.status).toBe(401);
    });

    it('người lạ (member thường) -> 403 khi presign/list/xoá ảnh cơ sở người khác', async () => {
      const owner = await mkPlaceWithOwner('stranger_target');
      const stranger = await createUser('stranger');
      await assignRole(stranger.userId, 'member', 'global', null);
      const mediaId = await seedPlaceMedia(owner.placeId, owner.userId);

      const presign = await request(app.getHttpServer())
        .post(`/api/places/${owner.placeId}/media/presign`)
        .set('Authorization', `Bearer ${stranger.accessToken}`)
        .send(validPresignBody);
      expect(presign.status).toBe(403);

      const list = await request(app.getHttpServer())
        .get(`/api/places/${owner.placeId}/media`)
        .set('Authorization', `Bearer ${stranger.accessToken}`);
      expect(list.status).toBe(403);

      const del = await request(app.getHttpServer())
        .delete(`/api/places/${owner.placeId}/media/${mediaId}`)
        .set('Authorization', `Bearer ${stranger.accessToken}`);
      expect(del.status).toBe(403);

      const [row] = await ds.query(`SELECT deleted_at FROM media WHERE id = $1`, [mediaId]);
      expect(row.deleted_at).toBeNull();
    });

    // Chủ cơ sở B có grant Managed HIỆU LỰC THẬT — nhưng cho cơ sở B. Đây là bằng chứng phân quyền
    // dựa trên DANH TÍNH tài nguyên trên path, không phải "đã đăng nhập là được".
    it('chủ cơ sở B -> 403 khi đăng/xem/xoá ảnh của cơ sở A', async () => {
      const a = await mkPlaceWithOwner('cross_a');
      const b = await mkPlaceWithOwner('cross_b');
      const mediaId = await seedPlaceMedia(a.placeId, a.userId);

      const presign = await request(app.getHttpServer())
        .post(`/api/places/${a.placeId}/media/presign`)
        .set('Authorization', `Bearer ${b.accessToken}`)
        .send(validPresignBody);
      expect(presign.status).toBe(403);

      const list = await request(app.getHttpServer())
        .get(`/api/places/${a.placeId}/media`)
        .set('Authorization', `Bearer ${b.accessToken}`);
      expect(list.status).toBe(403);

      const del = await request(app.getHttpServer())
        .delete(`/api/places/${a.placeId}/media/${mediaId}`)
        .set('Authorization', `Bearer ${b.accessToken}`);
      expect(del.status).toBe(403);
    });

    it('chủ cơ sở -> 201 khi presign cho ĐÚNG cơ sở của mình', async () => {
      const owner = await mkPlaceWithOwner('owner_presign');
      const res = await request(app.getHttpServer())
        .post(`/api/places/${owner.placeId}/media/presign`)
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .send(validPresignBody);

      expect(res.status).toBe(201);
      expect(res.body.data).toHaveProperty('upload_url');
      expect(res.body.data).toHaveProperty('key');
      // Không rò tên bucket/đường dẫn nội bộ ngoài object key đã sinh.
      expect(Object.keys(res.body.data).sort()).toEqual(['expires_in', 'key', 'upload_url']);
    });

    it('quản lý cơ sở (business_manager) -> 201 khi presign cho cơ sở mình quản lý', async () => {
      const owner = await mkPlaceWithOwner('mgr_presign_owner');
      const manager = await mkManagerForPlace(owner.placeId, 'mgr_presign');

      const res = await request(app.getHttpServer())
        .post(`/api/places/${owner.placeId}/media/presign`)
        .set('Authorization', `Bearer ${manager.accessToken}`)
        .send(validPresignBody);
      expect(res.status).toBe(201);
    });

    it('presign từ chối MIME/kích thước không hợp lệ (không tin kiểm tra phía client)', async () => {
      const owner = await mkPlaceWithOwner('validate');

      const badMime = await request(app.getHttpServer())
        .post(`/api/places/${owner.placeId}/media/presign`)
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .send({ ...validPresignBody, content_type: 'application/pdf' });
      expect(badMime.status).toBe(400);

      const tooBig = await request(app.getHttpServer())
        .post(`/api/places/${owner.placeId}/media/presign`)
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .send({ ...validPresignBody, size: 10 * 1024 * 1024 + 1 });
      expect(tooBig.status).toBe(400);
    });
  });

  // ---- C. Danh sách của chủ cơ sở ----
  describe('Danh sách ảnh của chủ cơ sở', () => {
    it('chủ cơ sở thấy MỌI trạng thái, KHÔNG rò object_key/bucket/checksum', async () => {
      const owner = await mkPlaceWithOwner('list_all');
      await seedPlaceMedia(owner.placeId, owner.userId, 'pending');
      await seedPlaceMedia(owner.placeId, owner.userId, 'published');
      await seedPlaceMedia(owner.placeId, owner.userId, 'rejected');

      const res = await request(app.getHttpServer())
        .get(`/api/places/${owner.placeId}/media`)
        .set('Authorization', `Bearer ${owner.accessToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(3);
      expect(res.body.data.map((m: { status: string }) => m.status).sort()).toEqual([
        'pending',
        'published',
        'rejected',
      ]);
      const serialized = JSON.stringify(res.body);
      expect(serialized).not.toContain('test-bucket');
      expect(serialized).not.toContain('object_key');
      expect(serialized).not.toContain('checksum');
    });

    it('cơ sở chưa có ảnh -> mảng rỗng', async () => {
      const owner = await mkPlaceWithOwner('list_empty');
      const res = await request(app.getHttpServer())
        .get(`/api/places/${owner.placeId}/media`)
        .set('Authorization', `Bearer ${owner.accessToken}`);
      expect(res.status).toBe(200);
      expect(res.body.data).toEqual([]);
    });

    it('ảnh đã gỡ KHÔNG còn trong danh sách của chủ cơ sở', async () => {
      const owner = await mkPlaceWithOwner('list_deleted');
      const mediaId = await seedPlaceMedia(owner.placeId, owner.userId);

      const del = await request(app.getHttpServer())
        .delete(`/api/places/${owner.placeId}/media/${mediaId}`)
        .set('Authorization', `Bearer ${owner.accessToken}`);
      expect(del.status).toBe(200);

      const res = await request(app.getHttpServer())
        .get(`/api/places/${owner.placeId}/media`)
        .set('Authorization', `Bearer ${owner.accessToken}`);
      expect(res.body.data).toEqual([]);

      const [row] = await ds.query(`SELECT deleted_at FROM media WHERE id = $1`, [mediaId]);
      expect(row.deleted_at).not.toBeNull(); // xoá MỀM, không mất dấu vết
    });

    // Mượn một placeId mình CÓ quyền để đọc ảnh của cơ sở khác — chặn bởi lớp `belongsToPlace`.
    it('không đọc được file ảnh của cơ sở khác bằng placeId của chính mình -> 404', async () => {
      const mine = await mkPlaceWithOwner('borrow_mine');
      const other = await mkPlaceWithOwner('borrow_other');
      const otherMedia = await seedPlaceMedia(other.placeId, other.userId);

      const res = await request(app.getHttpServer())
        .get(`/api/places/${mine.placeId}/media/${otherMedia}/file`)
        .set('Authorization', `Bearer ${mine.accessToken}`);
      expect(res.status).toBe(404);
    });

    it('xoá ảnh của cơ sở khác qua path cơ sở mình -> 404, ảnh KHÔNG bị đụng', async () => {
      const mine = await mkPlaceWithOwner('del_mine');
      const other = await mkPlaceWithOwner('del_other');
      const otherMedia = await seedPlaceMedia(other.placeId, other.userId);

      const res = await request(app.getHttpServer())
        .delete(`/api/places/${mine.placeId}/media/${otherMedia}`)
        .set('Authorization', `Bearer ${mine.accessToken}`);
      expect(res.status).toBe(404);

      const [row] = await ds.query(`SELECT deleted_at FROM media WHERE id = $1`, [otherMedia]);
      expect(row.deleted_at).toBeNull();
    });
  });

  // ---- D. Kênh công khai KHÔNG BAO GIỜ lộ ảnh chưa duyệt ----
  describe('Kênh công khai', () => {
    it('gallery công khai KHÔNG chứa ảnh pending/rejected, CHỈ chứa published', async () => {
      const owner = await mkPlaceWithOwner('public_gallery');
      const pending = await seedPlaceMedia(owner.placeId, owner.userId, 'pending');
      const rejected = await seedPlaceMedia(owner.placeId, owner.userId, 'rejected');
      const published = await seedPlaceMedia(owner.placeId, owner.userId, 'published');

      const [{ slug }] = await ds.query(`SELECT slug FROM places WHERE id = $1`, [owner.placeId]);
      const res = await request(app.getHttpServer()).get(`/api/places/${slug}`);

      expect(res.status).toBe(200);
      const ids = res.body.data.media.map((m: { id: string }) => m.id);
      expect(ids).toContain(published);
      expect(ids).not.toContain(pending);
      expect(ids).not.toContain(rejected);
    });

    it('GET /media/{id}/file (công khai) -> 404 cho ảnh pending VÀ rejected', async () => {
      const owner = await mkPlaceWithOwner('public_file');
      const pending = await seedPlaceMedia(owner.placeId, owner.userId, 'pending');
      const rejected = await seedPlaceMedia(owner.placeId, owner.userId, 'rejected');

      const p = await request(app.getHttpServer()).get(`/api/media/${pending}/file`);
      expect(p.status).toBe(404);

      const r = await request(app.getHttpServer()).get(`/api/media/${rejected}/file`);
      expect(r.status).toBe(404);
    });

    it('kênh xem ảnh của moderator KHÔNG mở cho công chúng/người thường -> 401/403', async () => {
      const owner = await mkPlaceWithOwner('modfile_guard');
      const pending = await seedPlaceMedia(owner.placeId, owner.userId, 'pending');

      const anon = await request(app.getHttpServer()).get(`/api/media/${pending}/moderation-file`);
      expect(anon.status).toBe(401);

      const member = await createUser('modfile_member');
      await assignRole(member.userId, 'member', 'global', null);
      const asMember = await request(app.getHttpServer())
        .get(`/api/media/${pending}/moderation-file`)
        .set('Authorization', `Bearer ${member.accessToken}`);
      expect(asMember.status).toBe(403);

      // Kể cả chủ cơ sở cũng KHÔNG đi qua kênh của moderator — họ có kênh riêng theo cơ sở.
      const asOwner = await request(app.getHttpServer())
        .get(`/api/media/${pending}/moderation-file`)
        .set('Authorization', `Bearer ${owner.accessToken}`);
      expect(asOwner.status).toBe(403);
    });
  });

  // ---- E. Vòng đời kiểm duyệt ----
  describe('Vòng đời kiểm duyệt', () => {
    it('moderator DUYỆT -> published và ảnh xuất hiện công khai', async () => {
      const owner = await mkPlaceWithOwner('approve');
      const moderator = await createModerator('approve_mod');
      const mediaId = await seedPlaceMedia(owner.placeId, owner.userId, 'pending');
      const caseId = await seedCase(mediaId);

      const [{ slug }] = await ds.query(`SELECT slug FROM places WHERE id = $1`, [owner.placeId]);
      const before = await request(app.getHttpServer()).get(`/api/places/${slug}`);
      expect(before.body.data.media.map((m: { id: string }) => m.id)).not.toContain(mediaId);

      const decide = await request(app.getHttpServer())
        .post(`/api/moderation/cases/${caseId}/decide`)
        .set('Authorization', `Bearer ${moderator.accessToken}`)
        .send({ decision: 'approve' });
      expect(decide.status).toBe(200);

      const [row] = await ds.query(`SELECT status FROM media WHERE id = $1`, [mediaId]);
      expect(row.status).toBe('published');

      const after = await request(app.getHttpServer()).get(`/api/places/${slug}`);
      const published = after.body.data.media.find((m: { id: string }) => m.id === mediaId);
      expect(published).toBeDefined();
      // URL công khai là endpoint API, KHÔNG phải địa chỉ object storage.
      expect(published.url).toContain(`/media/${mediaId}/file`);
      expect(published.url).not.toContain('test-bucket');
    });

    it('moderator TỪ CHỐI -> rejected và ảnh VẪN ẩn công khai', async () => {
      const owner = await mkPlaceWithOwner('reject');
      const moderator = await createModerator('reject_mod');
      const mediaId = await seedPlaceMedia(owner.placeId, owner.userId, 'pending');
      const caseId = await seedCase(mediaId);

      const decide = await request(app.getHttpServer())
        .post(`/api/moderation/cases/${caseId}/decide`)
        .set('Authorization', `Bearer ${moderator.accessToken}`)
        .send({ decision: 'reject', reason: 'Ảnh không liên quan tới cơ sở', reason_code: 'unrelated_to_place' });
      expect(decide.status).toBe(200);

      const [row] = await ds.query(`SELECT status FROM media WHERE id = $1`, [mediaId]);
      expect(row.status).toBe('rejected');

      const [{ slug }] = await ds.query(`SELECT slug FROM places WHERE id = $1`, [owner.placeId]);
      const pub = await request(app.getHttpServer()).get(`/api/places/${slug}`);
      expect(pub.body.data.media.map((m: { id: string }) => m.id)).not.toContain(mediaId);

      const file = await request(app.getHttpServer()).get(`/api/media/${mediaId}/file`);
      expect(file.status).toBe(404);
    });

    // Owner-facing Moderation Feedback (2026-08-12) — QUYẾT ĐỊNH SẢN PHẨM (đã điều tra, không phải
    // thiếu sót): `moderation_cases.reason` là free text do MODERATOR gõ, không có `reason_code`
    // an toàn nào tồn tại cho quyết định media. Tiền lệ ĐÃ CÓ trong chính repo này —
    // `business_claims.decision_note` và `bookings.internal_note` — đều KHÔNG BAO GIỜ lộ ra cho
    // bên bị ảnh hưởng dù nội dung nói riêng về chính họ; chỉ `reason_code` (enum có kiểm soát)
    // mới lộ ra cho `business_claims`. `media` không có enum tương đương, nên `reason` ở đây vẫn
    // đóng vai trò NHƯ `decision_note`/`internal_note` — giữ nguyên tắc, không lộ. Test này ghim
    // lại bảo đảm đó ở tầng HTTP thật, không chỉ ở mức đơn vị: chủ cơ sở KHÔNG BAO GIỜ nhìn thấy
    // `reason` mà moderator đã gõ, dù ảnh CHÍNH LÀ ảnh của họ.
    it('chủ cơ sở KHÔNG thấy lý do từ chối của moderator (free text), CHỈ thấy reason_code an toàn', async () => {
      const owner = await mkPlaceWithOwner('reject_privacy');
      const moderator = await createModerator('reject_privacy_mod');
      const mediaId = await seedPlaceMedia(owner.placeId, owner.userId, 'pending');
      const caseId = await seedCase(mediaId);

      const SECRET_REASON = 'Trùng lặp với case #4821 — nghi ngờ tài khoản này, theo dõi thêm';
      const decide = await request(app.getHttpServer())
        .post(`/api/moderation/cases/${caseId}/decide`)
        .set('Authorization', `Bearer ${moderator.accessToken}`)
        .send({ decision: 'reject', reason: SECRET_REASON, reason_code: 'inappropriate_content' });
      expect(decide.status).toBe(200);

      const ownerList = await request(app.getHttpServer())
        .get(`/api/places/${owner.placeId}/media`)
        .set('Authorization', `Bearer ${owner.accessToken}`);
      expect(ownerList.status).toBe(200);

      const item = ownerList.body.data.find((m: { id: string }) => m.id === mediaId);
      expect(item.status).toBe('rejected');
      // Mã CÓ KIỂM SOÁT lộ ra — đây chính là tính năng.
      expect(item.rejection_reason_code).toBe('inappropriate_content');

      const serialized = JSON.stringify(ownerList.body);
      // Nội dung reason (free text moderator gõ) không được xuất hiện dưới BẤT KỲ hình thức nào.
      expect(serialized).not.toContain(SECRET_REASON);
      expect(serialized).not.toContain('4821');
      // Hợp đồng response chỉ đúng 9 khoá đã biết (8 khoá gốc + rejection_reason_code).
      expect(Object.keys(item).sort()).toEqual(
        [
          'alt_text',
          'caption',
          'created_at',
          'id',
          'is_cover',
          'rejection_reason_code',
          'sort_order',
          'status',
          'url',
        ].sort(),
      );
      // Danh tính moderator (resolved_by/reviewer) không bao giờ lộ ra kênh chủ cơ sở.
      expect(serialized).not.toContain(moderator.userId);
      expect(serialized).not.toContain('resolved_by');
      expect(serialized).not.toContain('reviewer');
    });

    it('reject KHÔNG kèm reason_code -> 422, ảnh vẫn pending, chủ cơ sở không thấy gì thay đổi', async () => {
      const owner = await mkPlaceWithOwner('reject_missing_code');
      const moderator = await createModerator('reject_missing_code_mod');
      const mediaId = await seedPlaceMedia(owner.placeId, owner.userId, 'pending');
      const caseId = await seedCase(mediaId);

      const decide = await request(app.getHttpServer())
        .post(`/api/moderation/cases/${caseId}/decide`)
        .set('Authorization', `Bearer ${moderator.accessToken}`)
        .send({ decision: 'reject', reason: 'thiếu mã lý do' });
      expect(decide.status).toBe(422);

      const [row] = await ds.query(`SELECT status FROM media WHERE id = $1`, [mediaId]);
      expect(row.status).toBe('pending');
    });

    it('reject kèm reason_code KHÔNG hợp lệ -> 400, ảnh vẫn pending', async () => {
      const owner = await mkPlaceWithOwner('reject_bad_code');
      const moderator = await createModerator('reject_bad_code_mod');
      const mediaId = await seedPlaceMedia(owner.placeId, owner.userId, 'pending');
      const caseId = await seedCase(mediaId);

      const decide = await request(app.getHttpServer())
        .post(`/api/moderation/cases/${caseId}/decide`)
        .set('Authorization', `Bearer ${moderator.accessToken}`)
        .send({ decision: 'reject', reason: 'x', reason_code: 'account_flagged_internally' });
      expect(decide.status).toBe(400);

      const [row] = await ds.query(`SELECT status FROM media WHERE id = $1`, [mediaId]);
      expect(row.status).toBe('pending');
    });

    // Case LỊCH SỬ: seed thẳng một case đã resolved (reject) KHÔNG có reason_code, đúng hình dạng
    // dữ liệu trước migration AddModerationReasonCode. Không suy đoán mã — chủ cơ sở nhận `null`,
    // giao diện tự lùi về thông điệp chung.
    it('case lịch sử đã rejected trước khi có reason_code -> chủ cơ sở nhận null, không suy đoán', async () => {
      const owner = await mkPlaceWithOwner('reject_historical');
      const moderatorUser = await createModerator('reject_historical_mod');
      const mediaId = await seedPlaceMedia(owner.placeId, owner.userId, 'rejected');
      await ds.query(
        `INSERT INTO moderation_cases (target_type, target_id, status, source, severity, priority,
                                        decision, reason, reason_code, resolved_by, resolved_at)
         VALUES ('media', $1, 'resolved', 'new_content', 'low', 0, 'reject', 'lý do cũ trước milestone này', NULL, $2, now())`,
        [mediaId, moderatorUser.userId],
      );

      const ownerList = await request(app.getHttpServer())
        .get(`/api/places/${owner.placeId}/media`)
        .set('Authorization', `Bearer ${owner.accessToken}`);
      const item = ownerList.body.data.find((m: { id: string }) => m.id === mediaId);

      expect(item.status).toBe('rejected');
      expect(item.rejection_reason_code).toBeNull();
      expect(JSON.stringify(ownerList.body)).not.toContain('lý do cũ trước milestone này');
    });

    // Cross-place: ảnh bị từ chối của cơ sở KHÁC không được lộ reason_code (hay bất cứ gì) qua
    // gallery của cơ sở mình — chốt chặn IDOR ở đúng đường owner-safe reason mới thêm.
    it('ảnh rejected của cơ sở KHÁC không lộ qua gallery của cơ sở mình (IDOR)', async () => {
      const mine = await mkPlaceWithOwner('reason_leak_mine');
      const other = await mkPlaceWithOwner('reason_leak_other');
      const moderator = await createModerator('reason_leak_mod');
      const otherMediaId = await seedPlaceMedia(other.placeId, other.userId, 'pending');
      const caseId = await seedCase(otherMediaId);
      await request(app.getHttpServer())
        .post(`/api/moderation/cases/${caseId}/decide`)
        .set('Authorization', `Bearer ${moderator.accessToken}`)
        .send({ decision: 'reject', reason: 'x', reason_code: 'copyright' })
        .expect(200);

      const myList = await request(app.getHttpServer())
        .get(`/api/places/${mine.placeId}/media`)
        .set('Authorization', `Bearer ${mine.accessToken}`);
      expect(myList.status).toBe(200);
      expect(myList.body.data.find((m: { id: string }) => m.id === otherMediaId)).toBeUndefined();
    });

    // Nhiều quyết định lịch sử trên CÙNG một media (từ chối rồi khôi phục) — trạng thái chủ cơ sở
    // nhìn thấy PHẢI phản ánh đúng trạng thái HIỆN HÀNH (media.status là cột vô hướng DUY NHẤT,
    // không suy ra từ lịch sử case), và case rejection CŨ không được rò rỉ qua bất kỳ đường nào
    // sau khi ảnh đã được khôi phục.
    it('ảnh bị từ chối RỒI được khôi phục -> chủ cơ sở thấy ĐÚNG trạng thái hiện hành, không còn dấu vết case cũ', async () => {
      const owner = await mkPlaceWithOwner('reject_then_restore');
      const moderator = await createModerator('reject_then_restore_mod');
      const mediaId = await seedPlaceMedia(owner.placeId, owner.userId, 'pending');

      const rejectCase = await seedCase(mediaId);
      await request(app.getHttpServer())
        .post(`/api/moderation/cases/${rejectCase}/decide`)
        .set('Authorization', `Bearer ${moderator.accessToken}`)
        .send({ decision: 'reject', reason: 'Lần đầu bị từ chối vì lý do nội bộ X', reason_code: 'low_quality' })
        .expect(200);

      const [afterReject] = await ds.query(`SELECT status FROM media WHERE id = $1`, [mediaId]);
      expect(afterReject.status).toBe('rejected');

      // Trước khi khôi phục: chủ cơ sở PHẢI thấy mã lý do — nếu không, bước sau ("mã biến mất sau
      // khi khôi phục") không chứng minh được gì (có thể nó chưa từng xuất hiện).
      const beforeRestore = await request(app.getHttpServer())
        .get(`/api/places/${owner.placeId}/media`)
        .set('Authorization', `Bearer ${owner.accessToken}`);
      expect(beforeRestore.body.data.find((m: { id: string }) => m.id === mediaId).rejection_reason_code).toBe(
        'low_quality',
      );

      // Từ `rejected`, FSM chỉ cho `restore` (không có `approve` trực tiếp) — xem
      // media-moderation.transition.ts. Mở case MỚI rồi khôi phục về `published`.
      const restoreCase = await seedCase(mediaId);
      await request(app.getHttpServer())
        .post(`/api/moderation/cases/${restoreCase}/decide`)
        .set('Authorization', `Bearer ${moderator.accessToken}`)
        .send({ decision: 'restore', target_status: 'published' })
        .expect(200);

      const [afterRestore] = await ds.query(`SELECT status FROM media WHERE id = $1`, [mediaId]);
      expect(afterRestore.status).toBe('published');

      const ownerList = await request(app.getHttpServer())
        .get(`/api/places/${owner.placeId}/media`)
        .set('Authorization', `Bearer ${owner.accessToken}`);
      const item = ownerList.body.data.find((m: { id: string }) => m.id === mediaId);
      expect(item.status).toBe('published'); // KHÔNG còn "rejected" — trạng thái hiện hành, xác định
      // Mã lý do biến mất NGAY cùng lúc với trạng thái cũ, dù CSDL vẫn còn nguyên case reject cũ.
      expect(item.rejection_reason_code).toBeNull();

      const serialized = JSON.stringify(ownerList.body);
      expect(serialized).not.toContain('Lần đầu bị từ chối vì lý do nội bộ X');
    });

    // CHỌN XÁC ĐỊNH khi có NHIỀU quyết định: từ chối (mã A) -> khôi phục về pending -> từ chối lại
    // (mã B). Chủ cơ sở phải thấy B — quyết định từ chối HIỆN HÀNH — chứ không phải A, và không
    // phải "một dòng bất kỳ" do planner chọn. Đây là bằng chứng sống cho `DISTINCT ON` +
    // `ORDER BY resolved_at DESC, id DESC` ở `findOwnerSafeReasonCodesForMedia()`.
    it('nhiều lần từ chối -> chủ cơ sở thấy mã của lần từ chối MỚI NHẤT, không phải lần cũ', async () => {
      const owner = await mkPlaceWithOwner('reject_twice');
      const moderator = await createModerator('reject_twice_mod');
      const mediaId = await seedPlaceMedia(owner.placeId, owner.userId, 'pending');

      const firstCase = await seedCase(mediaId);
      await request(app.getHttpServer())
        .post(`/api/moderation/cases/${firstCase}/decide`)
        .set('Authorization', `Bearer ${moderator.accessToken}`)
        .send({ decision: 'reject', reason: 'lần 1', reason_code: 'copyright' })
        .expect(200);

      const restoreCase = await seedCase(mediaId);
      await request(app.getHttpServer())
        .post(`/api/moderation/cases/${restoreCase}/decide`)
        .set('Authorization', `Bearer ${moderator.accessToken}`)
        .send({ decision: 'restore', target_status: 'pending' })
        .expect(200);

      const secondCase = await seedCase(mediaId);
      await request(app.getHttpServer())
        .post(`/api/moderation/cases/${secondCase}/decide`)
        .set('Authorization', `Bearer ${moderator.accessToken}`)
        .send({ decision: 'reject', reason: 'lần 2', reason_code: 'low_quality' })
        .expect(200);

      const ownerList = await request(app.getHttpServer())
        .get(`/api/places/${owner.placeId}/media`)
        .set('Authorization', `Bearer ${owner.accessToken}`);
      const item = ownerList.body.data.find((m: { id: string }) => m.id === mediaId);

      expect(item.status).toBe('rejected');
      expect(item.rejection_reason_code).toBe('low_quality');
      expect(item.rejection_reason_code).not.toBe('copyright');

      // Cả ba case vẫn còn nguyên trong CSDL (lịch sử không bị xoá) — điều thay đổi chỉ là dòng
      // NÀO được chọn để trả lời chủ cơ sở.
      const [{ count }] = await ds.query(
        `SELECT count(*)::int AS count FROM moderation_cases WHERE target_id = $1 AND status = 'resolved'`,
        [mediaId],
      );
      expect(count).toBe(3);
    });

    it('người thường KHÔNG quyết định được ảnh chờ duyệt -> 403, trạng thái không đổi', async () => {
      const owner = await mkPlaceWithOwner('decide_403');
      const mediaId = await seedPlaceMedia(owner.placeId, owner.userId, 'pending');
      const caseId = await seedCase(mediaId);

      // Kể cả CHỦ CƠ SỞ cũng không được tự duyệt ảnh của chính mình.
      const res = await request(app.getHttpServer())
        .post(`/api/moderation/cases/${caseId}/decide`)
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .send({ decision: 'approve' });
      expect(res.status).toBe(403);

      const [row] = await ds.query(`SELECT status FROM media WHERE id = $1`, [mediaId]);
      expect(row.status).toBe('pending');
    });

    it('transition KHÔNG hợp lệ (duyệt ảnh đã published) -> 422', async () => {
      const owner = await mkPlaceWithOwner('bad_transition');
      const moderator = await createModerator('bad_transition_mod');
      const mediaId = await seedPlaceMedia(owner.placeId, owner.userId, 'published');
      const caseId = await seedCase(mediaId);

      const res = await request(app.getHttpServer())
        .post(`/api/moderation/cases/${caseId}/decide`)
        .set('Authorization', `Bearer ${moderator.accessToken}`)
        .send({ decision: 'approve' });
      expect(res.status).toBe(422);
    });

    it('case detail cho moderator: có tên cơ sở + URL xem ảnh, KHÔNG lộ object_key/bucket', async () => {
      const owner = await mkPlaceWithOwner('preview');
      const moderator = await createModerator('preview_mod');
      const mediaId = await seedPlaceMedia(owner.placeId, owner.userId, 'pending');
      const caseId = await seedCase(mediaId);

      const res = await request(app.getHttpServer())
        .get(`/api/moderation/cases/${caseId}`)
        .set('Authorization', `Bearer ${moderator.accessToken}`);

      expect(res.status).toBe(200);
      const preview = res.body.data.target_preview;
      expect(preview.found).toBe(true);
      expect(preview.place_id).toBe(owner.placeId);
      expect(preview.place_name).toContain('E2E PlaceMedia');
      expect(preview.status).toBe('pending');
      expect(preview.uploaded_by).toBe(owner.userId);
      expect(preview.preview_url).toContain(`/media/${mediaId}/moderation-file`);

      const serialized = JSON.stringify(res.body);
      expect(serialized).not.toContain('test-bucket');
      expect(serialized).not.toContain('object_key');
    });

    it('moderator MỞ ĐƯỢC ảnh chờ duyệt qua kênh của mình (302 tới signed URL, không lộ khoá)', async () => {
      const owner = await mkPlaceWithOwner('modfile_ok');
      const moderator = await createModerator('modfile_ok_mod');
      const mediaId = await seedPlaceMedia(owner.placeId, owner.userId, 'pending');

      const res = await request(app.getHttpServer())
        .get(`/api/media/${mediaId}/moderation-file`)
        .set('Authorization', `Bearer ${moderator.accessToken}`)
        .redirects(0);

      expect(res.status).toBe(302);
      expect(res.headers.location).toBeTruthy();
      // Signed URL là capability dạng bearer — không được để proxy/CDN dùng chung.
      expect(res.headers['cache-control']).toContain('private');
    });
  });
});
