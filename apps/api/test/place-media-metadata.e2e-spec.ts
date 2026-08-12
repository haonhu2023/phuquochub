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

// Owner Photo Metadata (2026-08-12) — sửa caption/alt_text của MỘT ảnh cơ sở, trên Postgres THẬT,
// đi qua guard THẬT (không mock PDP/resolver nào).
//
// Trọng tâm chứng minh:
//  1. Chỉ chủ/quản lý ĐÚNG cơ sở đó mới sửa được (Media.Upload.Managed + ADR-019), cùng đường phân
//     quyền đã chứng minh cho upload/xoá/sắp xếp/đặt bìa.
//  2. KHÔNG thể tráo media id sang cơ sở khác.
//  3. Trim + rỗng-thành-null hoạt động đúng qua HTTP thật.
//  4. Sửa metadata KHÔNG đụng status/sort_order/cover_image_id — ảnh pending/rejected/published
//     giữ nguyên trạng thái, sắp xếp và ảnh bìa không đổi.
//  5. Không rò rỉ object_key/bucket/checksum.
describe('Owner Place Photos — sửa caption/alt_text (live Postgres)', () => {
  let app: INestApplication;
  let ds: DataSource;
  let jwt: JwtService;
  let config: ConfigService;
  let categoryId: string;

  const userIds: string[] = [];
  const placeIds: string[] = [];
  const mediaIds: string[] = [];

  async function createUser(label: string) {
    const email = `e2e_meta_${label}_${Date.now()}_${Math.random().toString(36).slice(2)}@phuquochub.test`;
    const rows: Array<{ id: string }> = await ds.query(
      `INSERT INTO users (email, display_name) VALUES ($1, $2) RETURNING id`,
      [email, `PlaceMediaMeta E2E ${label}`],
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

  async function mkPlaceWithOwner(label: string) {
    const rows: Array<{ id: string }> = await ds.query(
      `INSERT INTO places (name, slug, category_id, location, status)
       VALUES ($1, $2, $3, ST_SetSRID(ST_MakePoint(103.9, 10.2), 4326)::geography, 'published')
       RETURNING id`,
      [
        `E2E PlaceMediaMeta ${label}`,
        `e2e-placemediameta-${label}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
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

  async function seedPlaceMedia(
    placeId: string,
    uploadedBy: string,
    status: 'pending' | 'published' | 'rejected' | 'hidden' = 'pending',
    caption: string | null = null,
    altText: string | null = null,
  ): Promise<string> {
    const rows: Array<{ id: string }> = await ds.query(
      `INSERT INTO media (place_id, type, provider, status, object_key, bucket, content_type,
                          size_bytes, checksum_sha256, uploaded_by, url, caption, alt_text)
       VALUES ($1, 'image', 'upload', $2, $3, 'test-bucket', 'image/jpeg', 1000, $4, $5, NULL, $6, $7)
       RETURNING id`,
      [
        placeId,
        status,
        `media/${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`,
        Math.random().toString(16).slice(2).padEnd(64, '0').slice(0, 64),
        uploadedBy,
        caption,
        altText,
      ],
    );
    mediaIds.push(rows[0].id);
    return rows[0].id;
  }

  async function mediaRow(mediaId: string) {
    const [row] = await ds.query(
      `SELECT caption, alt_text, status, sort_order FROM media WHERE id = $1`,
      [mediaId],
    );
    return row as { caption: string | null; alt_text: string | null; status: string; sort_order: number | null };
  }

  const patchMetadata = (placeId: string, mediaId: string, token: string, body: Record<string, unknown>) =>
    request(app.getHttpServer())
      .patch(`/api/places/${placeId}/media/${mediaId}`)
      .set('Authorization', `Bearer ${token}`)
      .send(body);

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
            `DELETE FROM audit_logs WHERE actor_id = ANY($1) AND (event LIKE 'media.%' OR event LIKE 'place.%')`,
            [userIds],
          );
          await ds.query(`DELETE FROM users WHERE id = ANY($1)`, [userIds]);
        }
      }
    } finally {
      if (app) await app.close();
    }
  }, 30_000);

  // ---- A. Phân quyền ----
  describe('Phân quyền sửa metadata', () => {
    it('anonymous -> 401', async () => {
      const owner = await mkPlaceWithOwner('anon');
      const m = await seedPlaceMedia(owner.placeId, owner.userId);
      const res = await request(app.getHttpServer())
        .patch(`/api/places/${owner.placeId}/media/${m}`)
        .send({ caption: 'x' });
      expect(res.status).toBe(401);
    });

    it('người lạ (member thường) -> 403, dữ liệu KHÔNG đổi', async () => {
      const owner = await mkPlaceWithOwner('stranger');
      const stranger = await createUser('stranger');
      await assignRole(stranger.userId, 'member', 'global', null);
      const m = await seedPlaceMedia(owner.placeId, owner.userId, 'pending', 'original', null);

      const res = await patchMetadata(owner.placeId, m, stranger.accessToken, { caption: 'hacked' });
      expect(res.status).toBe(403);

      const row = await mediaRow(m);
      expect(row.caption).toBe('original');
    });

    // Chủ cơ sở B có grant Managed HIỆU LỰC THẬT — nhưng cho cơ sở B.
    it('chủ cơ sở B -> 403 khi sửa ảnh của cơ sở A', async () => {
      const a = await mkPlaceWithOwner('cross_a');
      const b = await mkPlaceWithOwner('cross_b');
      const m = await seedPlaceMedia(a.placeId, a.userId, 'pending', 'original', null);

      const res = await patchMetadata(a.placeId, m, b.accessToken, { caption: 'hacked' });
      expect(res.status).toBe(403);

      const row = await mediaRow(m);
      expect(row.caption).toBe('original');
    });

    it('quản lý cơ sở (business_manager) sửa được — cùng quyền với chủ cơ sở', async () => {
      const owner = await mkPlaceWithOwner('mgr');
      const manager = await mkManagerForPlace(owner.placeId, 'mgr');
      const m = await seedPlaceMedia(owner.placeId, owner.userId);

      const res = await patchMetadata(owner.placeId, m, manager.accessToken, { caption: 'set by manager' });
      expect(res.status).toBe(200);
      const row = await mediaRow(m);
      expect(row.caption).toBe('set by manager');
    });

    it('chủ cơ sở sửa được ảnh của chính mình', async () => {
      const owner = await mkPlaceWithOwner('owner_ok');
      const m = await seedPlaceMedia(owner.placeId, owner.userId);

      const res = await patchMetadata(owner.placeId, m, owner.accessToken, { caption: 'set by owner' });
      expect(res.status).toBe(200);
    });
  });

  // ---- B. Cross-place injection ----
  describe('Chống tráo mediaId', () => {
    it('mediaId của cơ sở KHÁC qua path cơ sở mình -> 404, ảnh KHÔNG bị đụng', async () => {
      const mine = await mkPlaceWithOwner('inject_mine');
      const other = await mkPlaceWithOwner('inject_other');
      const foreign = await seedPlaceMedia(other.placeId, other.userId, 'pending', 'original', null);

      const res = await patchMetadata(mine.placeId, foreign, mine.accessToken, { caption: 'stolen' });
      expect(res.status).toBe(404);

      const row = await mediaRow(foreign);
      expect(row.caption).toBe('original');
    });

    it('placeId trong body bị bỏ qua hoàn toàn (whitelist+forbidNonWhitelisted -> 400)', async () => {
      const mine = await mkPlaceWithOwner('spoof_mine');
      const other = await mkPlaceWithOwner('spoof_other');
      const m = await seedPlaceMedia(mine.placeId, mine.userId);

      const res = await patchMetadata(mine.placeId, m, mine.accessToken, {
        caption: 'x',
        place_id: other.placeId,
      });
      expect(res.status).toBe(400);
    });
  });

  // ---- C. UUID validation ----
  describe('Xác thực UUID', () => {
    it('placeId rác -> 403 (fail-closed ở guard, trước ParseUUIDPipe)', async () => {
      const owner = await mkPlaceWithOwner('bad_place');
      const m = await seedPlaceMedia(owner.placeId, owner.userId);
      const res = await patchMetadata('not-a-uuid', m, owner.accessToken, { caption: 'x' });
      expect(res.status).toBe(403);
    });

    it('mediaId rác -> 400 (ParseUUIDPipe)', async () => {
      const owner = await mkPlaceWithOwner('bad_media');
      const res = await patchMetadata(owner.placeId, 'not-a-uuid', owner.accessToken, { caption: 'x' });
      expect(res.status).toBe(400);
    });
  });

  // ---- D. Trim / null semantics / validation ----
  describe('Trim, rỗng-thành-null, giới hạn độ dài', () => {
    it('caption/alt_text được TRIM trước khi lưu', async () => {
      const owner = await mkPlaceWithOwner('trim');
      const m = await seedPlaceMedia(owner.placeId, owner.userId);

      const res = await patchMetadata(owner.placeId, m, owner.accessToken, {
        caption: '  Bãi biển đẹp  ',
        alt_text: '  Bãi cát trắng  ',
      });
      expect(res.status).toBe(200);
      const row = await mediaRow(m);
      expect(row.caption).toBe('Bãi biển đẹp');
      expect(row.alt_text).toBe('Bãi cát trắng');
    });

    it('chuỗi rỗng/toàn khoảng trắng -> lưu thành NULL (xoá mô tả)', async () => {
      const owner = await mkPlaceWithOwner('empty_null');
      const m = await seedPlaceMedia(owner.placeId, owner.userId, 'pending', 'has caption', 'has alt');

      const res = await patchMetadata(owner.placeId, m, owner.accessToken, { caption: '   ', alt_text: '' });
      expect(res.status).toBe(200);
      const row = await mediaRow(m);
      expect(row.caption).toBeNull();
      expect(row.alt_text).toBeNull();
    });

    it('bỏ qua một trường -> trường đó KHÔNG bị xoá (giữ nguyên giá trị cũ)', async () => {
      const owner = await mkPlaceWithOwner('partial');
      const m = await seedPlaceMedia(owner.placeId, owner.userId, 'pending', 'keep this caption', 'keep this alt');

      const res = await patchMetadata(owner.placeId, m, owner.accessToken, { caption: 'new caption only' });
      expect(res.status).toBe(200);
      const row = await mediaRow(m);
      expect(row.caption).toBe('new caption only');
      expect(row.alt_text).toBe('keep this alt'); // KHÔNG đổi
    });

    it('caption vượt 300 ký tự -> 400', async () => {
      const owner = await mkPlaceWithOwner('too_long_caption');
      const m = await seedPlaceMedia(owner.placeId, owner.userId);
      const res = await patchMetadata(owner.placeId, m, owner.accessToken, { caption: 'a'.repeat(301) });
      expect(res.status).toBe(400);
    });

    it('alt_text vượt 200 ký tự -> 400', async () => {
      const owner = await mkPlaceWithOwner('too_long_alt');
      const m = await seedPlaceMedia(owner.placeId, owner.userId);
      const res = await patchMetadata(owner.placeId, m, owner.accessToken, { alt_text: 'a'.repeat(201) });
      expect(res.status).toBe(400);
    });

    it('cả hai trường vắng mặt -> 400 (không phải no-op hợp lệ)', async () => {
      const owner = await mkPlaceWithOwner('empty_body');
      const m = await seedPlaceMedia(owner.placeId, owner.userId);
      const res = await patchMetadata(owner.placeId, m, owner.accessToken, {});
      expect(res.status).toBe(400);
    });

    it('mediaId không tồn tại -> 404', async () => {
      const owner = await mkPlaceWithOwner('missing_media');
      const ghost = '11111111-1111-4111-8111-111111111111';
      const res = await patchMetadata(owner.placeId, ghost, owner.accessToken, { caption: 'x' });
      expect(res.status).toBe(404);
    });
  });

  // ---- E. Không đụng status/sort_order/cover ----
  describe('Sửa metadata KHÔNG ảnh hưởng vòng đời kiểm duyệt/thứ tự/ảnh bìa', () => {
    it('ảnh pending -> vẫn pending sau khi sửa metadata', async () => {
      const owner = await mkPlaceWithOwner('stays_pending');
      const m = await seedPlaceMedia(owner.placeId, owner.userId, 'pending');
      await patchMetadata(owner.placeId, m, owner.accessToken, { caption: 'x' }).expect(200);
      const row = await mediaRow(m);
      expect(row.status).toBe('pending');
    });

    it('ảnh rejected -> vẫn rejected sau khi sửa metadata (sửa được, không phục hồi)', async () => {
      const owner = await mkPlaceWithOwner('stays_rejected');
      const m = await seedPlaceMedia(owner.placeId, owner.userId, 'rejected');
      const res = await patchMetadata(owner.placeId, m, owner.accessToken, { caption: 'still rejected' });
      expect(res.status).toBe(200);
      const row = await mediaRow(m);
      expect(row.status).toBe('rejected');
      expect(row.caption).toBe('still rejected');
    });

    it('ảnh published -> vẫn published, gallery công khai vẫn hiển thị đúng caption/alt mới', async () => {
      const owner = await mkPlaceWithOwner('stays_published');
      const m = await seedPlaceMedia(owner.placeId, owner.userId, 'published');
      await patchMetadata(owner.placeId, m, owner.accessToken, {
        caption: 'public caption',
        alt_text: 'public alt',
      }).expect(200);

      const row = await mediaRow(m);
      expect(row.status).toBe('published');

      const [{ slug }] = await ds.query(`SELECT slug FROM places WHERE id = $1`, [owner.placeId]);
      const pub = await request(app.getHttpServer()).get(`/api/places/${slug}`);
      const item = pub.body.data.media.find((x: { id: string }) => x.id === m);
      expect(item.caption).toBe('public caption');
      expect(item.alt_text).toBe('public alt');
    });

    it('sort_order KHÔNG bị đụng khi sửa metadata', async () => {
      const owner = await mkPlaceWithOwner('order_untouched');
      const m1 = await seedPlaceMedia(owner.placeId, owner.userId, 'published');
      const m2 = await seedPlaceMedia(owner.placeId, owner.userId, 'published');

      const order = await request(app.getHttpServer())
        .patch(`/api/places/${owner.placeId}/media/order`)
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .send({ media_ids: [m2, m1] });
      expect(order.status).toBe(200);

      await patchMetadata(owner.placeId, m2, owner.accessToken, { caption: 'edited' }).expect(200);

      const rowM1 = await mediaRow(m1);
      const rowM2 = await mediaRow(m2);
      expect(rowM2.sort_order).toBe(0);
      expect(rowM1.sort_order).toBe(1);
    });

    it('ảnh bìa hiện tại KHÔNG bị đụng khi sửa metadata của chính ảnh đó', async () => {
      const owner = await mkPlaceWithOwner('cover_untouched');
      const m = await seedPlaceMedia(owner.placeId, owner.userId, 'published');

      const cover = await request(app.getHttpServer())
        .patch(`/api/places/${owner.placeId}/media/cover`)
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .send({ media_id: m });
      expect(cover.status).toBe(200);

      const res = await patchMetadata(owner.placeId, m, owner.accessToken, { caption: 'still the cover' });
      expect(res.status).toBe(200);
      expect(res.body.data.find((p: { id: string }) => p.id === m).is_cover).toBe(true);

      const [{ cover_image_id: coverId }] = await ds.query(`SELECT cover_image_id FROM places WHERE id = $1`, [
        owner.placeId,
      ]);
      expect(coverId).toBe(m);
    });
  });

  // ---- F. Không rò rỉ chi tiết lưu trữ ----
  describe('Không rò rỉ chi tiết lưu trữ', () => {
    it('response KHÔNG chứa object_key/bucket/checksum', async () => {
      const owner = await mkPlaceWithOwner('no_leak');
      const m = await seedPlaceMedia(owner.placeId, owner.userId);

      const res = await patchMetadata(owner.placeId, m, owner.accessToken, { caption: 'x' });
      expect(res.status).toBe(200);
      const serialized = JSON.stringify(res.body);
      expect(serialized).not.toContain('test-bucket');
      expect(serialized).not.toContain('object_key');
      expect(serialized).not.toContain('checksum');
    });

    it('trả về danh sách ảnh của cơ sở (cùng hình dạng GET), phản ánh giá trị vừa sửa', async () => {
      const owner = await mkPlaceWithOwner('response_shape');
      const m = await seedPlaceMedia(owner.placeId, owner.userId);

      const res = await patchMetadata(owner.placeId, m, owner.accessToken, {
        caption: 'shaped caption',
        alt_text: 'shaped alt',
      });
      expect(res.status).toBe(200);
      const item = res.body.data.find((p: { id: string }) => p.id === m);
      expect(item).toMatchObject({ caption: 'shaped caption', alt_text: 'shaped alt' });
      // 9 khoá: 8 khoá gốc + `rejection_reason_code` (Controlled Media Rejection Reason,
      // 2026-08-12). Ảnh này chưa bị từ chối nên giá trị là `null` — nhưng KHOÁ vẫn có mặt, đúng
      // hợp đồng "cùng hình dạng GET" mà chính test này đang canh.
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
      expect(item.rejection_reason_code).toBeNull();
    });
  });
});
