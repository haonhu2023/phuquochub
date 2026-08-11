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
        .send({ decision: 'reject', reason: 'Ảnh không liên quan tới cơ sở' });
      expect(decide.status).toBe(200);

      const [row] = await ds.query(`SELECT status FROM media WHERE id = $1`, [mediaId]);
      expect(row.status).toBe('rejected');

      const [{ slug }] = await ds.query(`SELECT slug FROM places WHERE id = $1`, [owner.placeId]);
      const pub = await request(app.getHttpServer()).get(`/api/places/${slug}`);
      expect(pub.body.data.media.map((m: { id: string }) => m.id)).not.toContain(mediaId);

      const file = await request(app.getHttpServer()).get(`/api/media/${mediaId}/file`);
      expect(file.status).toBe(404);
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
