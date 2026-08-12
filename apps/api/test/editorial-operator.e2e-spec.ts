import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { TransformInterceptor } from '../src/common/interceptors/transform.interceptor';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { OperatorBootstrapService } from '../src/modules/users/operator-bootstrap.service';

// Operator Bootstrap & Editorial Place Content (2026-08-12) — E2E trên Postgres/Redis THẬT.
//
// Milestone này mở một con đường ghi MỚI cho một nhóm người dùng tin cậy trên những địa điểm họ
// KHÔNG sở hữu. Vì vậy file này dành phần lớn dung lượng cho các khẳng định PHỦ ĐỊNH: member thường
// không được gì thêm, chủ cơ sở A vẫn không chạm được cơ sở B, và ảnh của cơ sở khác vẫn không thay
// thế được. Toàn bộ fixture là dùng-một-lần và được dọn sạch ở afterAll.
describe('Editorial Operator (e2e)', () => {
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
    const email = `e2e_editorial_${label}_${Date.now()}_${Math.random().toString(36).slice(2)}@phuquochub.test`;
    const rows: Array<{ id: string }> = await ds.query(
      `INSERT INTO users (email, display_name) VALUES ($1, $2) RETURNING id`,
      [email, `Editorial E2E ${label}`],
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

  async function assignRole(
    userId: string,
    roleCode: string,
    scopeType: 'global' | 'managed',
    businessId: string | null,
  ): Promise<void> {
    const [{ id: roleId }] = await ds.query(`SELECT id FROM roles WHERE code = $1`, [roleCode]);
    await ds.query(
      `INSERT INTO user_roles (user_id, role_id, scope_type, business_id) VALUES ($1,$2,$3,$4)`,
      [userId, roleId, scopeType, businessId],
    );
  }

  /** Địa điểm KHÔNG CÓ CHỦ — đúng hình dạng 49 địa điểm seed mà đội vận hành cần biên tập. */
  async function mkUnclaimedPlace(label: string): Promise<string> {
    const rows: Array<{ id: string }> = await ds.query(
      `INSERT INTO places (name, slug, category_id, location, status)
       VALUES ($1, $2, $3, ST_SetSRID(ST_MakePoint(103.9, 10.2), 4326)::geography, 'published')
       RETURNING id`,
      [
        `E2E Editorial ${label}`,
        `e2e-editorial-${label}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        categoryId,
      ],
    );
    placeIds.push(rows[0].id);
    return rows[0].id;
  }

  async function mkPlaceWithOwner(label: string) {
    const placeId = await mkUnclaimedPlace(label);
    const owner = await createUser(`${label}_owner`);
    await ds.query(
      `INSERT INTO business_members (place_id, user_id, role, granted_by) VALUES ($1, $2, 'owner', $2)`,
      [placeId, owner.userId],
    );
    await assignRole(owner.userId, 'business_owner', 'managed', placeId);
    return { placeId, ...owner };
  }

  async function seedPlaceMedia(placeId: string, uploadedBy: string, status = 'pending') {
    const rows: Array<{ id: string }> = await ds.query(
      `INSERT INTO media (type, provider, status, place_id, uploaded_by, object_key, bucket,
                          content_type, size_bytes, checksum_sha256)
       VALUES ('image','upload',$1,$2,$3,$4,'e2e-editorial-bucket','image/jpeg',100,$5)
       RETURNING id`,
      [status, placeId, uploadedBy, `media/e2e-editorial-${Date.now()}-${Math.random()}.jpg`, uniqueChecksum()],
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

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
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
        // `user_roles.business_id` có FK THẬT tới `places` (grant scope=managed của chủ cơ sở) —
        // phải gỡ TRƯỚC khi xoá place, nếu không DELETE places vi phạm fk_user_roles_business.
        if (userIds.length) await ds.query(`DELETE FROM user_roles WHERE user_id = ANY($1)`, [userIds]);
        if (placeIds.length) {
          await ds.query(`UPDATE places SET cover_image_id = NULL WHERE id = ANY($1)`, [placeIds]);
          await ds.query(`DELETE FROM contacts WHERE owner_type='place' AND owner_id = ANY($1)`, [placeIds]);
          await ds.query(`DELETE FROM business_members WHERE place_id = ANY($1)`, [placeIds]);
          await ds.query(`DELETE FROM media WHERE place_id = ANY($1)`, [placeIds]);
          await ds.query(`DELETE FROM wiki_revisions WHERE entity_type='place' AND entity_id = ANY($1)`, [
            placeIds,
          ]);
          await ds.query(`DELETE FROM places WHERE id = ANY($1)`, [placeIds]);
        }
        if (userIds.length) {
          // audit_logs trỏ tới users qua CẢ `entity_id` (đối tượng bị tác động) LẪN `actor_id`
          // (người thực hiện) — phải dọn cả hai, nếu không DELETE users vi phạm
          // audit_logs_actor_id_fkey.
          await ds.query(`DELETE FROM audit_logs WHERE entity_id = ANY($1) OR actor_id = ANY($1)`, [
            userIds,
          ]);
          await ds.query(`DELETE FROM users WHERE id = ANY($1)`, [userIds]);
        }
      }
    } finally {
      if (app) await app.close();
    }
  });

  // ---- A. NGƯỜI VẬN HÀNH ĐẦU TIÊN -------------------------------------------------------------

  describe('A. Bootstrap người vận hành đầu tiên', () => {
    it('member thường KHÔNG có quyền đặc quyền nào trước khi bootstrap', async () => {
      const member = await createUser('pre_bootstrap');
      const place = await mkUnclaimedPlace('pre_bootstrap_place');

      const edit = await request(app.getHttpServer())
        .patch(`/api/places/${place}`)
        .set('Authorization', `Bearer ${member.accessToken}`)
        .send({ short_description: 'không được phép' });
      expect(edit.status).toBe(403);

      const queue = await request(app.getHttpServer())
        .get('/api/moderation/cases')
        .set('Authorization', `Bearer ${member.accessToken}`);
      expect(queue.status).toBe(403);
    });

    it('bootstrap cấp ĐÚNG vai trò administrator cho email đã đăng ký', async () => {
      const user = await createUser('bootstrap_target');
      const svc = app.get(OperatorBootstrapService);

      const res = await svc.bootstrap({ email: user.email });

      expect(res.outcome).toBe('granted');
      expect(res.roleCode).toBe('administrator');
      const rows = await ds.query(
        `SELECT r.code, ur.scope_type, ur.business_id FROM user_roles ur
           JOIN roles r ON r.id = ur.role_id
          WHERE ur.user_id = $1 AND ur.revoked_at IS NULL`,
        [user.userId],
      );
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ code: 'administrator', scope_type: 'global', business_id: null });
    });

    it('chạy lại bootstrap là idempotent — vẫn ĐÚNG MỘT dòng user_roles', async () => {
      const user = await createUser('bootstrap_twice');
      const svc = app.get(OperatorBootstrapService);

      const first = await svc.bootstrap({ email: user.email });
      const second = await svc.bootstrap({ email: user.email });
      const third = await svc.bootstrap({ email: user.email });

      expect(first.outcome).toBe('granted');
      expect(second.outcome).toBe('already_assigned');
      expect(third.outcome).toBe('already_assigned');

      const [{ count }] = await ds.query(
        `SELECT count(*)::int AS count FROM user_roles WHERE user_id = $1 AND revoked_at IS NULL`,
        [user.userId],
      );
      expect(count).toBe(1);
    });

    it('email chưa đăng ký -> lỗi rõ ràng, KHÔNG tạo người dùng nào', async () => {
      const svc = app.get(OperatorBootstrapService);
      const email = `khong-ton-tai-${Date.now()}@phuquochub.test`;

      await expect(svc.bootstrap({ email })).rejects.toThrow(/Không tìm thấy người dùng/);

      const [{ count }] = await ds.query(`SELECT count(*)::int AS count FROM users WHERE email = $1`, [
        email,
      ]);
      expect(count).toBe(0);
    });

    it('super_administrator KHÔNG bootstrap được từ script (chặn leo thang đặc quyền)', async () => {
      const user = await createUser('bootstrap_superadmin');
      const svc = app.get(OperatorBootstrapService);

      await expect(
        svc.bootstrap({ email: user.email, roleCode: 'super_administrator' }),
      ).rejects.toThrow(/super_administrator/);

      const [{ count }] = await ds.query(
        `SELECT count(*)::int AS count FROM user_roles WHERE user_id = $1`,
        [user.userId],
      );
      expect(count).toBe(0);
    });
  });

  // ---- B. BIÊN TẬP ĐỊA ĐIỂM CHƯA CÓ CHỦ ---------------------------------------------------------

  describe('B. Biên tập địa điểm chưa có chủ', () => {
    it('operator biên tập được địa điểm KHÔNG thuộc quyền quản lý của mình', async () => {
      const editor = await createUser('editor_edit');
      await assignRole(editor.userId, 'contributor', 'global', null);
      const place = await mkUnclaimedPlace('editable');

      const res = await request(app.getHttpServer())
        .patch(`/api/places/${place}`)
        .set('Authorization', `Bearer ${editor.accessToken}`)
        .send({ short_description: 'Mô tả do đội vận hành biên tập' });

      expect(res.status).toBe(200);
      const [row] = await ds.query(`SELECT short_description FROM places WHERE id = $1`, [place]);
      expect(row.short_description).toBe('Mô tả do đội vận hành biên tập');
    });

    it('operator đặt được giờ mở cửa trên địa điểm chưa có chủ', async () => {
      const editor = await createUser('editor_hours');
      await assignRole(editor.userId, 'contributor', 'global', null);
      const place = await mkUnclaimedPlace('hours');

      const res = await request(app.getHttpServer())
        .patch(`/api/places/${place}`)
        .set('Authorization', `Bearer ${editor.accessToken}`)
        .send({
          opening_hours: {
            is_24h: false,
            regular: {
              mon: [{ open: '08:00', close: '17:00' }],
              tue: [], wed: [], thu: [], fri: [], sat: [], sun: [],
            },
          },
        });

      expect(res.status).toBe(200);
      const [row] = await ds.query(`SELECT opening_hours FROM places WHERE id = $1`, [place]);
      expect(row.opening_hours.regular.mon).toEqual([{ open: '08:00', close: '17:00' }]);
    });

    it('member thường -> 403 khi biên tập địa điểm chưa có chủ', async () => {
      const member = await createUser('plain_member_edit');
      const place = await mkUnclaimedPlace('member_denied');

      const res = await request(app.getHttpServer())
        .patch(`/api/places/${place}`)
        .set('Authorization', `Bearer ${member.accessToken}`)
        .send({ short_description: 'không được phép' });

      expect(res.status).toBe(403);
    });

    // Bảo toàn phạm vi chủ cơ sở: milestone này KHÔNG nới lỏng gì cho họ.
    it('chủ cơ sở A -> 403 khi biên tập cơ sở B (phạm vi managed giữ nguyên)', async () => {
      const ownerA = await mkPlaceWithOwner('owner_a');
      const placeB = await mkUnclaimedPlace('place_b');

      const res = await request(app.getHttpServer())
        .patch(`/api/places/${placeB}`)
        .set('Authorization', `Bearer ${ownerA.accessToken}`)
        .send({ short_description: 'cơ sở của người khác' });

      expect(res.status).toBe(403);
    });

    it('chủ cơ sở vẫn biên tập được CHÍNH cơ sở mình (không hồi quy)', async () => {
      const owner = await mkPlaceWithOwner('owner_self');

      const res = await request(app.getHttpServer())
        .patch(`/api/places/${owner.placeId}`)
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .send({ short_description: 'chủ cơ sở tự sửa' });

      expect(res.status).toBe(200);
    });
  });

  // ---- C. LIÊN HỆ ------------------------------------------------------------------------------

  describe('C. Liên hệ trên địa điểm chưa có chủ', () => {
    it('operator thêm được liên hệ; member thường -> 403', async () => {
      const editor = await createUser('editor_contact');
      await assignRole(editor.userId, 'contributor', 'global', null);
      const member = await createUser('member_contact');
      const place = await mkUnclaimedPlace('contacts');

      const ok = await request(app.getHttpServer())
        .post(`/api/places/${place}/contacts`)
        .set('Authorization', `Bearer ${editor.accessToken}`)
        .send({ contact_type: 'PHONE', value: '0900000001' });
      expect(ok.status).toBe(201);

      const denied = await request(app.getHttpServer())
        .post(`/api/places/${place}/contacts`)
        .set('Authorization', `Bearer ${member.accessToken}`)
        .send({ contact_type: 'PHONE', value: '0900000002' });
      expect(denied.status).toBe(403);
    });
  });

  // ---- D. ẢNH ----------------------------------------------------------------------------------

  describe('D. Ảnh trên địa điểm chưa có chủ', () => {
    it('operator liệt kê + xin presign được cho địa điểm chưa có chủ', async () => {
      const editor = await createUser('editor_media');
      await assignRole(editor.userId, 'contributor', 'global', null);
      const place = await mkUnclaimedPlace('media_ok');

      const list = await request(app.getHttpServer())
        .get(`/api/places/${place}/media`)
        .set('Authorization', `Bearer ${editor.accessToken}`);
      expect(list.status).toBe(200);

      const presign = await request(app.getHttpServer())
        .post(`/api/places/${place}/media/presign`)
        .set('Authorization', `Bearer ${editor.accessToken}`)
        .send({ content_type: 'image/jpeg', size: 1024, checksum_sha256: 'a'.repeat(64) });
      expect(presign.status).toBe(201);
      // Chỉ key mờ + URL tải lên — không lộ bucket/endpoint nội bộ dưới dạng trường riêng.
      expect(Object.keys(presign.body.data).sort()).toEqual(['expires_in', 'key', 'upload_url']);
    });

    it('member thường -> 403 trên MỌI đường ghi ảnh của địa điểm chưa có chủ', async () => {
      const member = await createUser('member_media');
      const place = await mkUnclaimedPlace('media_denied');

      const list = await request(app.getHttpServer())
        .get(`/api/places/${place}/media`)
        .set('Authorization', `Bearer ${member.accessToken}`);
      expect(list.status).toBe(403);

      const presign = await request(app.getHttpServer())
        .post(`/api/places/${place}/media/presign`)
        .set('Authorization', `Bearer ${member.accessToken}`)
        .send({ content_type: 'image/jpeg', size: 1024, checksum_sha256: 'b'.repeat(64) });
      expect(presign.status).toBe(403);
    });

    // Phạm vi theo CƠ SỞ vẫn tuyệt đối: quyền biên tập KHÔNG làm mờ ranh giới giữa hai cơ sở.
    it('mediaId của cơ sở B KHÔNG dùng được qua đường dẫn cơ sở A (không thay thế chéo)', async () => {
      const editor = await createUser('editor_cross');
      await assignRole(editor.userId, 'contributor', 'global', null);
      const placeA = await mkUnclaimedPlace('cross_a');
      const placeB = await mkUnclaimedPlace('cross_b');
      const mediaOfB = await seedPlaceMedia(placeB, editor.userId, 'published');

      const setCover = await request(app.getHttpServer())
        .patch(`/api/places/${placeA}/media/cover`)
        .set('Authorization', `Bearer ${editor.accessToken}`)
        .send({ media_id: mediaOfB });
      expect([404, 422]).toContain(setCover.status);

      const patchMeta = await request(app.getHttpServer())
        .patch(`/api/places/${placeA}/media/${mediaOfB}`)
        .set('Authorization', `Bearer ${editor.accessToken}`)
        .send({ caption: 'ảnh của cơ sở khác' });
      expect(patchMeta.status).toBe(404);

      const [{ cover_image_id: coverA }] = await ds.query(
        `SELECT cover_image_id FROM places WHERE id = $1`,
        [placeA],
      );
      expect(coverA).toBeNull();
    });

    it('response ảnh cho operator KHÔNG lộ object_key/bucket/checksum', async () => {
      const editor = await createUser('editor_storage');
      await assignRole(editor.userId, 'contributor', 'global', null);
      const place = await mkUnclaimedPlace('storage');
      await seedPlaceMedia(place, editor.userId, 'pending');

      const list = await request(app.getHttpServer())
        .get(`/api/places/${place}/media`)
        .set('Authorization', `Bearer ${editor.accessToken}`);

      const serialized = JSON.stringify(list.body);
      expect(serialized).not.toContain('object_key');
      expect(serialized).not.toContain('e2e-editorial-bucket');
      expect(serialized).not.toContain('checksum');
    });
  });

  // ---- E. KIỂM DUYỆT — bất biến tự-kiểm-duyệt (INV-12) -----------------------------------------

  describe('E. Kiểm duyệt ảnh biên tập (INV-12 giữ nguyên)', () => {
    it('người tải lên KHÔNG tự duyệt được ảnh của mình, dù có đủ quyền kiểm duyệt', async () => {
      // Một `administrator` kế thừa CẢ `Media.Upload.Any` (qua contributor) LẪN `Media.Moderate`
      // (qua moderator) — đúng tình huống mà INV-12 sinh ra để chặn.
      const operator = await createUser('self_mod');
      await assignRole(operator.userId, 'administrator', 'global', null);
      const place = await mkUnclaimedPlace('self_mod');
      const mediaId = await seedPlaceMedia(place, operator.userId, 'pending');
      const caseId = await seedOpenCase(mediaId);

      const res = await request(app.getHttpServer())
        .post(`/api/moderation/cases/${caseId}/decide`)
        .set('Authorization', `Bearer ${operator.accessToken}`)
        .send({ decision: 'approve' });

      expect(res.status).toBe(403);
      const [row] = await ds.query(`SELECT status FROM media WHERE id = $1`, [mediaId]);
      expect(row.status).toBe('pending');
    });

    it('QUY TRÌNH HAI NGƯỜI: operator A tải lên -> moderator B duyệt -> ảnh lên trang công khai', async () => {
      const uploader = await createUser('two_person_uploader');
      await assignRole(uploader.userId, 'contributor', 'global', null);
      const approver = await createUser('two_person_approver');
      await assignRole(approver.userId, 'moderator', 'global', null);

      const place = await mkUnclaimedPlace('two_person');
      const mediaId = await seedPlaceMedia(place, uploader.userId, 'pending');
      const caseId = await seedOpenCase(mediaId);

      const decide = await request(app.getHttpServer())
        .post(`/api/moderation/cases/${caseId}/decide`)
        .set('Authorization', `Bearer ${approver.accessToken}`)
        .send({ decision: 'approve' });
      expect(decide.status).toBe(200);

      const [row] = await ds.query(`SELECT status FROM media WHERE id = $1`, [mediaId]);
      expect(row.status).toBe('published');

      // Đặt ảnh bìa — chỉ ảnh ĐÃ duyệt mới đủ tư cách.
      const cover = await request(app.getHttpServer())
        .patch(`/api/places/${place}/media/cover`)
        .set('Authorization', `Bearer ${uploader.accessToken}`)
        .send({ media_id: mediaId });
      expect(cover.status).toBe(200);

      // Kênh CÔNG KHAI (ẩn danh) thấy đúng kết quả — đây là toàn bộ mục đích của milestone.
      const [{ slug }] = await ds.query(`SELECT slug FROM places WHERE id = $1`, [place]);
      const pub = await request(app.getHttpServer()).get(`/api/places/${slug}`);
      expect(pub.status).toBe(200);
      expect(pub.body.data.media.map((m: { id: string }) => m.id)).toContain(mediaId);
      expect(pub.body.data.cover_image_url).toBeTruthy();
      expect(JSON.stringify(pub.body)).not.toContain('object_key');
    });
  });
});
