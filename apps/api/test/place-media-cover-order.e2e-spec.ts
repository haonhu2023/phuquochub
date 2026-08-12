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

// Owner Cover & Photo Ordering (2026-08-12) — ảnh bìa + thứ tự ảnh của cơ sở, trên Postgres THẬT,
// đi qua guard THẬT (không mock PDP/resolver nào).
//
// Trọng tâm chứng minh:
//  1. Chỉ chủ/quản lý ĐÚNG cơ sở đó mới sắp xếp/đặt bìa được (Media.Upload.Managed + ADR-019).
//  2. KHÔNG thể tráo media id sang cơ sở khác ở CẢ hai luồng.
//  3. Ảnh `pending`/`rejected` KHÔNG BAO GIỜ trở thành ảnh bìa công khai.
//  4. Ảnh bìa công khai là URL API ỔN ĐỊNH — không phải presigned URL, không lộ object_key/bucket.
//  5. Gỡ ảnh / kiểm duyệt đưa ảnh khỏi `published` KHÔNG để lại ảnh bìa treo.
//
// Cùng chiến lược seed như place-media.e2e-spec.ts: dòng `media` được ghi THẲNG bằng SQL đúng hình
// dạng `createUploaded()` tạo ra (provider=upload, url=NULL), vì bước presign/PUT/register cần
// MinIO thật và đã được phủ ở mức unit.
describe('Owner Place Photos — ảnh bìa & thứ tự ảnh (live Postgres)', () => {
  let app: INestApplication;
  let ds: DataSource;
  let jwt: JwtService;
  let config: ConfigService;
  let categoryId: string;

  const userIds: string[] = [];
  const placeIds: string[] = [];
  const mediaIds: string[] = [];

  async function createUser(label: string) {
    const email = `e2e_cover_${label}_${Date.now()}_${Math.random().toString(36).slice(2)}@phuquochub.test`;
    const rows: Array<{ id: string }> = await ds.query(
      `INSERT INTO users (email, display_name) VALUES ($1, $2) RETURNING id`,
      [email, `Cover E2E ${label}`],
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

  /** Place `published` + chủ sở hữu hiệu lực THẬT (business_members + user_roles managed). */
  async function mkPlaceWithOwner(label: string) {
    const rows: Array<{ id: string; slug: string }> = await ds.query(
      `INSERT INTO places (name, slug, category_id, location, status)
       VALUES ($1, $2, $3, ST_SetSRID(ST_MakePoint(103.9, 10.2), 4326)::geography, 'published')
       RETURNING id, slug`,
      [
        `E2E Cover ${label}`,
        `e2e-cover-${label}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        categoryId,
      ],
    );
    const placeId = rows[0].id;
    placeIds.push(placeId);
    const owner = await createUser(`${label}_owner`);
    await ds.query(
      `INSERT INTO business_members (place_id, user_id, role, granted_by) VALUES ($1, $2, 'owner', $2)`,
      [placeId, owner.userId],
    );
    await assignRole(owner.userId, 'business_owner', 'managed', placeId);
    return { placeId, slug: rows[0].slug, ...owner };
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

  /** Dòng media ĐÚNG hình dạng `createUploaded()` sinh ra (provider=upload, url=NULL). */
  async function seedPlaceMedia(
    placeId: string,
    uploadedBy: string,
    status: 'pending' | 'published' | 'rejected' | 'hidden' = 'published',
    createdAt?: string,
  ): Promise<string> {
    const rows: Array<{ id: string }> = await ds.query(
      `INSERT INTO media (place_id, type, provider, status, object_key, bucket, content_type,
                          size_bytes, checksum_sha256, uploaded_by, url, created_at)
       VALUES ($1, 'image', 'upload', $2, $3, 'test-bucket', 'image/jpeg', 1000, $4, $5, NULL,
               COALESCE($6::timestamptz, now()))
       RETURNING id`,
      [
        placeId,
        status,
        `media/${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`,
        Math.random().toString(16).slice(2).padEnd(64, '0').slice(0, 64),
        uploadedBy,
        createdAt ?? null,
      ],
    );
    mediaIds.push(rows[0].id);
    return rows[0].id;
  }

  async function seedCase(mediaId: string): Promise<string> {
    const rows: Array<{ id: string }> = await ds.query(
      `INSERT INTO moderation_cases (target_type, target_id, status, source, severity, priority)
       VALUES ('media', $1, 'open', 'new_content', 'low', 0) RETURNING id`,
      [mediaId],
    );
    return rows[0].id;
  }

  const ownerList = (placeId: string, token: string) =>
    request(app.getHttpServer())
      .get(`/api/places/${placeId}/media`)
      .set('Authorization', `Bearer ${token}`);

  const reorder = (placeId: string, token: string, mediaIdsBody: unknown) =>
    request(app.getHttpServer())
      .patch(`/api/places/${placeId}/media/order`)
      .set('Authorization', `Bearer ${token}`)
      .send({ media_ids: mediaIdsBody });

  const setCover = (placeId: string, token: string, mediaId: unknown) =>
    request(app.getHttpServer())
      .patch(`/api/places/${placeId}/media/cover`)
      .set('Authorization', `Bearer ${token}`)
      .send({ media_id: mediaId });

  async function coverImageIdOf(placeId: string): Promise<string | null> {
    const [row] = await ds.query(`SELECT cover_image_id FROM places WHERE id = $1`, [placeId]);
    return row.cover_image_id;
  }

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
        // cover_image_id -> media là FK: bỏ con trỏ TRƯỚC khi xoá media của chính lần chạy này.
        if (placeIds.length) {
          await ds.query(`UPDATE places SET cover_image_id = NULL WHERE id = ANY($1)`, [placeIds]);
        }
        if (mediaIds.length) {
          await ds.query(`DELETE FROM moderation_cases WHERE target_type='media' AND target_id = ANY($1)`, [
            mediaIds,
          ]);
          await ds.query(`DELETE FROM media WHERE id = ANY($1)`, [mediaIds]);
        }
        if (userIds.length) await ds.query(`DELETE FROM user_roles WHERE user_id = ANY($1)`, [userIds]);
        if (placeIds.length) await ds.query(`DELETE FROM places WHERE id = ANY($1)`, [placeIds]);
        if (userIds.length) {
          await ds.query(
            `DELETE FROM audit_logs WHERE actor_id = ANY($1)
              AND (event LIKE 'media.%' OR event LIKE 'place.%' OR event = 'moderation.decided')`,
            [userIds],
          );
          await ds.query(`DELETE FROM users WHERE id = ANY($1)`, [userIds]);
        }
      }
    } finally {
      if (app) await app.close();
    }
  }, 30_000);

  // ---- A. Phân quyền: hai luồng mới đi CÙNG một đường phân quyền với phần còn lại của place media ----
  describe('Phân quyền sắp xếp & đặt ảnh bìa', () => {
    it('anonymous -> 401 ở cả hai endpoint', async () => {
      const owner = await mkPlaceWithOwner('anon');
      const m = await seedPlaceMedia(owner.placeId, owner.userId);

      const order = await request(app.getHttpServer())
        .patch(`/api/places/${owner.placeId}/media/order`)
        .send({ media_ids: [m] });
      expect(order.status).toBe(401);

      const cover = await request(app.getHttpServer())
        .patch(`/api/places/${owner.placeId}/media/cover`)
        .send({ media_id: m });
      expect(cover.status).toBe(401);
    });

    it('người lạ (member thường) -> 403, dữ liệu KHÔNG đổi', async () => {
      const owner = await mkPlaceWithOwner('stranger');
      const stranger = await createUser('stranger');
      await assignRole(stranger.userId, 'member', 'global', null);
      const m = await seedPlaceMedia(owner.placeId, owner.userId);

      expect((await reorder(owner.placeId, stranger.accessToken, [m])).status).toBe(403);
      expect((await setCover(owner.placeId, stranger.accessToken, m)).status).toBe(403);

      const [row] = await ds.query(`SELECT sort_order FROM media WHERE id = $1`, [m]);
      expect(row.sort_order).toBeNull();
      await expect(coverImageIdOf(owner.placeId)).resolves.toBeNull();
    });

    // Chủ cơ sở B có grant Managed HIỆU LỰC THẬT — nhưng cho cơ sở B.
    it('chủ cơ sở B -> 403 khi sắp xếp/đặt bìa cho cơ sở A', async () => {
      const a = await mkPlaceWithOwner('cross_a');
      const b = await mkPlaceWithOwner('cross_b');
      const m = await seedPlaceMedia(a.placeId, a.userId);

      expect((await reorder(a.placeId, b.accessToken, [m])).status).toBe(403);
      expect((await setCover(a.placeId, b.accessToken, m)).status).toBe(403);
      await expect(coverImageIdOf(a.placeId)).resolves.toBeNull();
    });

    it('quản lý cơ sở (business_manager) sắp xếp và đặt bìa được — cùng quyền với chủ cơ sở', async () => {
      const owner = await mkPlaceWithOwner('mgr');
      const manager = await mkManagerForPlace(owner.placeId, 'mgr');
      const m1 = await seedPlaceMedia(owner.placeId, owner.userId);
      const m2 = await seedPlaceMedia(owner.placeId, owner.userId);

      const order = await reorder(owner.placeId, manager.accessToken, [m2, m1]);
      expect(order.status).toBe(200);
      expect(order.body.data.map((p: { id: string }) => p.id)).toEqual([m2, m1]);

      const cover = await setCover(owner.placeId, manager.accessToken, m2);
      expect(cover.status).toBe(200);
      await expect(coverImageIdOf(owner.placeId)).resolves.toBe(m2);
    });
  });

  // ---- B. Sắp xếp ----
  describe('Sắp xếp ảnh', () => {
    it('chủ cơ sở sắp lại -> thứ tự BỀN VỮNG, sort_order liên tục từ 0', async () => {
      const owner = await mkPlaceWithOwner('order_ok');
      const m1 = await seedPlaceMedia(owner.placeId, owner.userId);
      const m2 = await seedPlaceMedia(owner.placeId, owner.userId);
      const m3 = await seedPlaceMedia(owner.placeId, owner.userId);

      const res = await reorder(owner.placeId, owner.accessToken, [m3, m1, m2]);
      expect(res.status).toBe(200);
      expect(res.body.data.map((p: { id: string }) => p.id)).toEqual([m3, m1, m2]);
      expect(res.body.data.map((p: { sort_order: number }) => p.sort_order)).toEqual([0, 1, 2]);

      // Bền vững: đọc lại bằng một request MỚI, không dùng response của lần ghi.
      const after = await ownerList(owner.placeId, owner.accessToken);
      expect(after.body.data.map((p: { id: string }) => p.id)).toEqual([m3, m1, m2]);
    });

    it('sắp lại NHIỀU LẦN không làm số trôi dần (luôn 0..n-1)', async () => {
      const owner = await mkPlaceWithOwner('order_twice');
      const m1 = await seedPlaceMedia(owner.placeId, owner.userId);
      const m2 = await seedPlaceMedia(owner.placeId, owner.userId);

      await reorder(owner.placeId, owner.accessToken, [m2, m1]);
      const second = await reorder(owner.placeId, owner.accessToken, [m1, m2]);

      expect(second.body.data.map((p: { sort_order: number }) => p.sort_order)).toEqual([0, 1]);
      expect(second.body.data.map((p: { id: string }) => p.id)).toEqual([m1, m2]);
    });

    it('ảnh pending/rejected CŨNG sắp được (chúng hiện trên màn hình quản lý)', async () => {
      const owner = await mkPlaceWithOwner('order_mixed');
      const pub = await seedPlaceMedia(owner.placeId, owner.userId, 'published');
      const pending = await seedPlaceMedia(owner.placeId, owner.userId, 'pending');
      const rejected = await seedPlaceMedia(owner.placeId, owner.userId, 'rejected');

      const res = await reorder(owner.placeId, owner.accessToken, [pending, rejected, pub]);
      expect(res.status).toBe(200);
      expect(res.body.data.map((p: { id: string }) => p.id)).toEqual([pending, rejected, pub]);
    });

    it('id TRÙNG LẶP -> 422, không ghi gì', async () => {
      const owner = await mkPlaceWithOwner('order_dup');
      const m1 = await seedPlaceMedia(owner.placeId, owner.userId);
      const m2 = await seedPlaceMedia(owner.placeId, owner.userId);

      const res = await reorder(owner.placeId, owner.accessToken, [m1, m1, m2]);
      expect(res.status).toBe(422);

      const rows = await ds.query(`SELECT sort_order FROM media WHERE id = ANY($1)`, [[m1, m2]]);
      expect(rows.every((r: { sort_order: number | null }) => r.sort_order === null)).toBe(true);
    });

    it('danh sách THIẾU ảnh -> 422 (hợp đồng "toàn bộ hay không có gì")', async () => {
      const owner = await mkPlaceWithOwner('order_partial');
      const m1 = await seedPlaceMedia(owner.placeId, owner.userId);
      await seedPlaceMedia(owner.placeId, owner.userId);

      expect((await reorder(owner.placeId, owner.accessToken, [m1])).status).toBe(422);
    });

    // Chốt chặn IDOR quan trọng nhất của luồng này: kể cả khi kẻ gọi CÓ quyền trên cơ sở của mình.
    it('chèn media id của cơ sở KHÁC -> 422, ảnh của cơ sở kia KHÔNG bị đụng', async () => {
      const mine = await mkPlaceWithOwner('inject_mine');
      const other = await mkPlaceWithOwner('inject_other');
      const myMedia = await seedPlaceMedia(mine.placeId, mine.userId);
      const foreign = await seedPlaceMedia(other.placeId, other.userId);

      const res = await reorder(mine.placeId, mine.accessToken, [foreign, myMedia]);
      expect(res.status).toBe(422);

      const [row] = await ds.query(`SELECT sort_order FROM media WHERE id = $1`, [foreign]);
      expect(row.sort_order).toBeNull();
    });

    it('media_ids chứa UUID sai định dạng -> 400 (DTO chặn trước khi chạm DB)', async () => {
      const owner = await mkPlaceWithOwner('order_uuid');
      const m1 = await seedPlaceMedia(owner.placeId, owner.userId);

      expect((await reorder(owner.placeId, owner.accessToken, ['not-a-uuid'])).status).toBe(400);
      expect((await reorder(owner.placeId, owner.accessToken, [m1, 'nope'])).status).toBe(400);
    });

    // placeId rác trả 403 chứ KHÔNG phải 400: Nest chạy guard TRƯỚC pipe, nên
    // `@AuthorizationContext` cố phân giải 'not-a-uuid' → resolver không tìm thấy → deny (D2 bước
    // 5 coi null là DENY). Đây là fail-closed đúng hướng — không ai được biết một chuỗi có phải
    // placeId hợp lệ hay không trước khi qua được phân quyền.
    it('placeId rác -> 403 (fail-closed ở guard, trước cả ParseUUIDPipe)', async () => {
      const owner = await mkPlaceWithOwner('order_bad_place');
      const m1 = await seedPlaceMedia(owner.placeId, owner.userId);

      expect((await reorder('not-a-uuid', owner.accessToken, [m1])).status).toBe(403);
      expect((await setCover('not-a-uuid', owner.accessToken, m1)).status).toBe(403);
    });

    it('mảng rỗng -> 400; place_id trong body -> 400', async () => {
      const owner = await mkPlaceWithOwner('order_empty');
      await seedPlaceMedia(owner.placeId, owner.userId);

      expect((await reorder(owner.placeId, owner.accessToken, [])).status).toBe(400);

      const spoof = await request(app.getHttpServer())
        .patch(`/api/places/${owner.placeId}/media/order`)
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .send({ media_ids: [], place_id: owner.placeId });
      expect(spoof.status).toBe(400);
    });

    it('gallery CÔNG KHAI tôn trọng thứ tự đã sắp, và vẫn CHỈ chứa ảnh published', async () => {
      const owner = await mkPlaceWithOwner('order_public');
      const a = await seedPlaceMedia(owner.placeId, owner.userId, 'published');
      const b = await seedPlaceMedia(owner.placeId, owner.userId, 'published');
      const pending = await seedPlaceMedia(owner.placeId, owner.userId, 'pending');
      const rejected = await seedPlaceMedia(owner.placeId, owner.userId, 'rejected');

      // b trước a, và hai ảnh chưa duyệt xen vào giữa danh sách sắp xếp.
      const res = await reorder(owner.placeId, owner.accessToken, [b, pending, a, rejected]);
      expect(res.status).toBe(200);

      const pub = await request(app.getHttpServer()).get(`/api/places/${owner.slug}`);
      expect(pub.status).toBe(200);
      const ids = pub.body.data.media.map((m: { id: string }) => m.id);
      expect(ids).toEqual([b, a]); // đúng thứ tự, và ảnh chưa duyệt bị loại hoàn toàn
      expect(ids).not.toContain(pending);
      expect(ids).not.toContain(rejected);
    });

    // Trước milestone này gallery chỉ ORDER BY sort_order: khi tất cả cùng NULL (đúng thực tế dữ
    // liệu hiện có) planner tự do chọn thứ tự. Khoá phụ tới tận PK làm kết quả xác định.
    it('ảnh CHƯA từng sắp: thứ tự vẫn XÁC ĐỊNH và ổn định giữa hai lần gọi', async () => {
      const owner = await mkPlaceWithOwner('order_tiebreak');
      // created_at giống hệt nhau ⇒ chỉ còn `id DESC` phân xử.
      const at = '2026-08-12T03:00:00.000Z';
      const m1 = await seedPlaceMedia(owner.placeId, owner.userId, 'published', at);
      const m2 = await seedPlaceMedia(owner.placeId, owner.userId, 'published', at);
      const expected = [m1, m2].sort().reverse(); // id DESC

      const first = await ownerList(owner.placeId, owner.accessToken);
      const second = await ownerList(owner.placeId, owner.accessToken);

      expect(first.body.data.map((p: { id: string }) => p.id)).toEqual(expected);
      expect(second.body.data.map((p: { id: string }) => p.id)).toEqual(expected);

      const pub = await request(app.getHttpServer()).get(`/api/places/${owner.slug}`);
      expect(pub.body.data.media.map((m: { id: string }) => m.id)).toEqual(expected);
    });
  });

  // ---- C. Ảnh bìa ----
  describe('Ảnh bìa', () => {
    it('chủ cơ sở chọn ảnh ĐÃ DUYỆT -> lưu cover_image_id, đánh dấu is_cover cho ĐÚNG một ảnh', async () => {
      const owner = await mkPlaceWithOwner('cover_ok');
      const m1 = await seedPlaceMedia(owner.placeId, owner.userId, 'published');
      const m2 = await seedPlaceMedia(owner.placeId, owner.userId, 'published');

      const res = await setCover(owner.placeId, owner.accessToken, m2);
      expect(res.status).toBe(200);

      await expect(coverImageIdOf(owner.placeId)).resolves.toBe(m2);
      const flags = res.body.data.map((p: { id: string; is_cover: boolean }) => [p.id, p.is_cover]);
      expect(flags.filter(([, isCover]: [string, boolean]) => isCover)).toEqual([[m2, true]]);
      expect(flags).toContainEqual([m1, false]);
    });

    it('đổi ảnh bìa -> chỉ ảnh mới là bìa (không tích luỹ)', async () => {
      const owner = await mkPlaceWithOwner('cover_switch');
      const m1 = await seedPlaceMedia(owner.placeId, owner.userId, 'published');
      const m2 = await seedPlaceMedia(owner.placeId, owner.userId, 'published');

      await setCover(owner.placeId, owner.accessToken, m1);
      const res = await setCover(owner.placeId, owner.accessToken, m2);

      expect(res.body.data.filter((p: { is_cover: boolean }) => p.is_cover)).toHaveLength(1);
      await expect(coverImageIdOf(owner.placeId)).resolves.toBe(m2);
    });

    it('ảnh PENDING không thể thành bìa -> 422, cover_image_id không đổi', async () => {
      const owner = await mkPlaceWithOwner('cover_pending');
      const pending = await seedPlaceMedia(owner.placeId, owner.userId, 'pending');

      const res = await setCover(owner.placeId, owner.accessToken, pending);
      expect(res.status).toBe(422);
      await expect(coverImageIdOf(owner.placeId)).resolves.toBeNull();
    });

    it('ảnh REJECTED không thể thành bìa -> 422', async () => {
      const owner = await mkPlaceWithOwner('cover_rejected');
      const rejected = await seedPlaceMedia(owner.placeId, owner.userId, 'rejected');

      expect((await setCover(owner.placeId, owner.accessToken, rejected)).status).toBe(422);
      await expect(coverImageIdOf(owner.placeId)).resolves.toBeNull();
    });

    it('ảnh HIDDEN không thể thành bìa -> 422', async () => {
      const owner = await mkPlaceWithOwner('cover_hidden');
      const hidden = await seedPlaceMedia(owner.placeId, owner.userId, 'hidden');

      expect((await setCover(owner.placeId, owner.accessToken, hidden)).status).toBe(422);
    });

    // 404 (không phải 422): không tiết lộ ảnh của cơ sở khác có tồn tại hay không.
    it('media id của cơ sở KHÁC -> 404, cover của CẢ HAI cơ sở không đổi', async () => {
      const mine = await mkPlaceWithOwner('cover_mine');
      const other = await mkPlaceWithOwner('cover_other');
      const foreign = await seedPlaceMedia(other.placeId, other.userId, 'published');

      const res = await setCover(mine.placeId, mine.accessToken, foreign);
      expect(res.status).toBe(404);

      await expect(coverImageIdOf(mine.placeId)).resolves.toBeNull();
      await expect(coverImageIdOf(other.placeId)).resolves.toBeNull();
    });

    it('media id không tồn tại -> 404; media_id sai định dạng -> 400', async () => {
      const owner = await mkPlaceWithOwner('cover_missing');
      const ghost = '11111111-1111-4111-8111-111111111111';

      expect((await setCover(owner.placeId, owner.accessToken, ghost)).status).toBe(404);
      expect((await setCover(owner.placeId, owner.accessToken, 'not-a-uuid')).status).toBe(400);
    });

    it('KHÔNG chấp nhận URL tuỳ ý làm ảnh bìa (hợp đồng chỉ có media id) -> 400', async () => {
      const owner = await mkPlaceWithOwner('cover_url');
      const m = await seedPlaceMedia(owner.placeId, owner.userId, 'published');

      const res = await request(app.getHttpServer())
        .patch(`/api/places/${owner.placeId}/media/cover`)
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .send({ media_id: m, cover_image_url: 'https://evil.example/x.jpg' });
      expect(res.status).toBe(400);
    });
  });

  // ---- D. Kênh công khai ----
  describe('Ảnh bìa trên kênh công khai', () => {
    it('trả URL API ỔN ĐỊNH — không presigned, không MinIO, không object_key/bucket/checksum', async () => {
      const owner = await mkPlaceWithOwner('cover_public');
      const m = await seedPlaceMedia(owner.placeId, owner.userId, 'published');
      expect((await setCover(owner.placeId, owner.accessToken, m)).status).toBe(200);

      const res = await request(app.getHttpServer()).get(`/api/places/${owner.slug}`);
      expect(res.status).toBe(200);
      expect(res.body.data.cover_image_url).toContain(`/media/${m}/file`);

      const url: string = res.body.data.cover_image_url;
      expect(url).not.toContain('X-Amz-Signature'); // không phải presigned URL
      expect(url).not.toContain('X-Amz-Credential');
      expect(url).not.toContain('test-bucket');
      expect(url).not.toContain(':9000'); // không phải endpoint MinIO

      const serialized = JSON.stringify(res.body);
      expect(serialized).not.toContain('object_key');
      expect(serialized).not.toContain('cover_image_media_id'); // cột nội bộ không rò ra hợp đồng
      expect(serialized).not.toContain('checksum');
      expect(serialized).not.toContain('test-bucket');
    });

    it('chưa chọn bìa -> cover_image_url = null (không vỡ, không đoán ảnh thay thế)', async () => {
      const owner = await mkPlaceWithOwner('cover_none');
      await seedPlaceMedia(owner.placeId, owner.userId, 'published');

      const res = await request(app.getHttpServer()).get(`/api/places/${owner.slug}`);
      expect(res.body.data.cover_image_url).toBeNull();
    });

    // Phòng vệ theo chiều sâu: kể cả khi con trỏ bị đặt THẲNG bằng SQL (bỏ qua mọi kiểm tra ở
    // đường ghi), đường ĐỌC vẫn không phát URL cho ảnh chưa duyệt.
    it('cover_image_id trỏ ảnh PENDING (đặt thẳng bằng SQL) -> công khai vẫn null', async () => {
      const owner = await mkPlaceWithOwner('cover_forced_pending');
      const pending = await seedPlaceMedia(owner.placeId, owner.userId, 'pending');
      await ds.query(`UPDATE places SET cover_image_id = $2 WHERE id = $1`, [owner.placeId, pending]);

      const res = await request(app.getHttpServer()).get(`/api/places/${owner.slug}`);
      expect(res.body.data.cover_image_url).toBeNull();
    });

    it('cover_image_id trỏ ảnh của cơ sở KHÁC (đặt thẳng bằng SQL) -> công khai vẫn null', async () => {
      const mine = await mkPlaceWithOwner('cover_forced_cross');
      const other = await mkPlaceWithOwner('cover_forced_cross_other');
      const foreign = await seedPlaceMedia(other.placeId, other.userId, 'published');
      await ds.query(`UPDATE places SET cover_image_id = $2 WHERE id = $1`, [mine.placeId, foreign]);

      const res = await request(app.getHttpServer()).get(`/api/places/${mine.slug}`);
      expect(res.body.data.cover_image_url).toBeNull();
    });
  });

  // ---- E. Vòng đời: ảnh bìa không bao giờ bị treo ----
  describe('Ảnh bìa khi ảnh biến mất hoặc mất tư cách', () => {
    it('chủ cơ sở GỠ ảnh đang là bìa -> cover_image_id được dọn, công khai không vỡ', async () => {
      const owner = await mkPlaceWithOwner('cover_delete');
      const m = await seedPlaceMedia(owner.placeId, owner.userId, 'published');
      await setCover(owner.placeId, owner.accessToken, m);

      const del = await request(app.getHttpServer())
        .delete(`/api/places/${owner.placeId}/media/${m}`)
        .set('Authorization', `Bearer ${owner.accessToken}`);
      expect(del.status).toBe(200);

      await expect(coverImageIdOf(owner.placeId)).resolves.toBeNull();
      const pub = await request(app.getHttpServer()).get(`/api/places/${owner.slug}`);
      expect(pub.status).toBe(200);
      expect(pub.body.data.cover_image_url).toBeNull();
    });

    it('gỡ một ảnh KHÔNG phải bìa -> bìa giữ nguyên', async () => {
      const owner = await mkPlaceWithOwner('cover_delete_other');
      const cover = await seedPlaceMedia(owner.placeId, owner.userId, 'published');
      const other = await seedPlaceMedia(owner.placeId, owner.userId, 'published');
      await setCover(owner.placeId, owner.accessToken, cover);

      await request(app.getHttpServer())
        .delete(`/api/places/${owner.placeId}/media/${other}`)
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .expect(200);

      await expect(coverImageIdOf(owner.placeId)).resolves.toBe(cover);
    });

    it('kiểm duyệt viên ẨN ảnh đang là bìa -> cover được dọn, công khai không còn ảnh bìa', async () => {
      const owner = await mkPlaceWithOwner('cover_hide');
      const moderator = await createModerator('cover_hide_mod');
      const m = await seedPlaceMedia(owner.placeId, owner.userId, 'published');
      await setCover(owner.placeId, owner.accessToken, m);
      const caseId = await seedCase(m);

      const decide = await request(app.getHttpServer())
        .post(`/api/moderation/cases/${caseId}/decide`)
        .set('Authorization', `Bearer ${moderator.accessToken}`)
        .send({ decision: 'hide', reason: 'Ảnh vi phạm chính sách' });
      expect(decide.status).toBe(200);

      await expect(coverImageIdOf(owner.placeId)).resolves.toBeNull();
      const pub = await request(app.getHttpServer()).get(`/api/places/${owner.slug}`);
      expect(pub.body.data.cover_image_url).toBeNull();
      expect(pub.body.data.media.map((x: { id: string }) => x.id)).not.toContain(m);
    });

    // Khôi phục KHÔNG âm thầm trả lại tư cách ảnh bìa — chủ cơ sở phải chọn lại tường minh.
    it('ẩn rồi KHÔI PHỤC ảnh -> ảnh hiện lại nhưng KHÔNG tự thành bìa', async () => {
      const owner = await mkPlaceWithOwner('cover_restore');
      const moderator = await createModerator('cover_restore_mod');
      const m = await seedPlaceMedia(owner.placeId, owner.userId, 'published');
      await setCover(owner.placeId, owner.accessToken, m);

      const hideCase = await seedCase(m);
      await request(app.getHttpServer())
        .post(`/api/moderation/cases/${hideCase}/decide`)
        .set('Authorization', `Bearer ${moderator.accessToken}`)
        .send({ decision: 'hide', reason: 'Kiểm tra lại' })
        .expect(200);

      const restoreCase = await seedCase(m);
      await request(app.getHttpServer())
        .post(`/api/moderation/cases/${restoreCase}/decide`)
        .set('Authorization', `Bearer ${moderator.accessToken}`)
        .send({ decision: 'restore', target_status: 'published' })
        .expect(200);

      const pub = await request(app.getHttpServer()).get(`/api/places/${owner.slug}`);
      expect(pub.body.data.media.map((x: { id: string }) => x.id)).toContain(m);
      expect(pub.body.data.cover_image_url).toBeNull();
      await expect(coverImageIdOf(owner.placeId)).resolves.toBeNull();
    });
  });
});
