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

// Place Contacts CRUD/security contract (live Postgres) — api.md §11.1, ADR-019 D5/D16.
//
// Gap closed: ContactsController (contacts.controller.ts) has zero E2E coverage — only
// ContactAuthzResolver has a unit test (mocked repository). This file proves the REAL
// authorization path end-to-end: PermissionsGuard -> AuthorizationService.canWithGrants() ->
// evaluateScopedAccess() -> IDENTITY_PLACE_RESOLVER (create, resourceType='place') /
// CONTACT_AUTHZ_RESOLVER (update/remove, resourceType='contact', businessId = contacts.owner_id).
//
// Same fixture convention as business-managers.e2e-spec.ts: owners/managers seeded DIRECTLY via
// SQL (business_members + user_roles) — the assign/revoke API itself is proven elsewhere
// (business-managers.e2e-spec.ts); this file isolates the Contacts endpoints.
//
// PATCH/DELETE routes are `/contacts/:id` — NO place/business id anywhere in the request. That
// structural fact is itself part of the IDOR proof (§E/§F below): an attacker cannot "supply" a
// place id to escape scoping, so cross-place isolation tests prove the resolver's DB lookup
// (contacts.owner_id) is what gates access, not anything client-controlled.
describe('Place Contacts CRUD/security contract (live Postgres)', () => {
  let app: INestApplication;
  let ds: DataSource;
  let jwt: JwtService;
  let config: ConfigService;
  let categoryId: string;

  const userIds: string[] = [];
  const placeIds: string[] = [];
  const contactIds: string[] = [];

  async function createUser(label: string): Promise<{ accessToken: string; userId: string }> {
    const email = `e2e_contacts_${label}_${Date.now()}_${Math.random().toString(36).slice(2)}@phuquochub.test`;
    const rows: Array<{ id: string }> = await ds.query(
      `INSERT INTO users (email, display_name) VALUES ($1, $2) RETURNING id`,
      [email, `Contacts E2E ${label}`],
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
      [`E2E Contacts ${label}`, `e2e-contacts-${label}-${Date.now()}-${Math.random().toString(36).slice(2)}`, categoryId],
    );
    placeIds.push(rows[0].id);
    return rows[0].id;
  }

  /** Place mới + owner hiệu lực THẬT (business_members + user_roles, scope='managed'). */
  async function mkPlaceWithOwner(
    label: string,
  ): Promise<{ placeId: string; accessToken: string; userId: string }> {
    const placeId = await mkPlace(label);
    const owner = await createUser(`${label}_owner`);
    await ds.query(
      `INSERT INTO business_members (place_id, user_id, role, granted_by) VALUES ($1, $2, 'owner', $2)`,
      [placeId, owner.userId],
    );
    await assignRole(owner.userId, 'business_owner', 'managed', placeId);
    return { placeId, ...owner };
  }

  /** Manager hiệu lực THẬT cho MỘT place đã có (business_members role='manager' + user_roles managed). */
  async function mkManagerForPlace(
    placeId: string,
    label: string,
  ): Promise<{ accessToken: string; userId: string }> {
    const manager = await createUser(`${label}_manager`);
    await ds.query(
      `INSERT INTO business_members (place_id, user_id, role, granted_by) VALUES ($1, $2, 'manager', $2)`,
      [placeId, manager.userId],
    );
    await assignRole(manager.userId, 'business_manager', 'managed', placeId);
    return manager;
  }

  async function createContact(
    placeId: string,
    accessToken: string,
    body: Record<string, unknown> = {},
  ) {
    const res = await request(app.getHttpServer())
      .post(`/api/places/${placeId}/contacts`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ contact_type: 'PHONE', value: '0900000000', ...body });
    if (res.status === 201 && res.body?.data?.id) {
      contactIds.push(res.body.data.id);
    }
    return res;
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

  // Teardown hang fix pattern (business-managers.e2e-spec.ts, 2026-08-07): cleanup trong `try`,
  // `app.close()` trong `finally` — không nuốt lỗi dọn dẹp bằng `.catch()`.
  afterAll(async () => {
    try {
      if (ds?.isInitialized) {
        // contacts KHÔNG có FK cứng tới places (polymorphic owner_type/owner_id) -> dọn tường minh
        // theo contactIds VÀ theo placeIds sở hữu (bắt luôn các contact tạo qua API không track được
        // id do assertion thất bại giữa chừng).
        if (contactIds.length || placeIds.length) {
          await ds.query(`DELETE FROM contacts WHERE id = ANY($1) OR (owner_type='place' AND owner_id = ANY($2))`, [
            contactIds,
            placeIds,
          ]);
        }
        // user_roles.business_id -> places NO ACTION -> xoá TRƯỚC places.
        if (userIds.length) await ds.query(`DELETE FROM user_roles WHERE user_id = ANY($1)`, [userIds]);
        // business_members có ON DELETE CASCADE từ places/users nên places bên dưới tự dọn nốt.
        if (placeIds.length) await ds.query(`DELETE FROM places WHERE id = ANY($1)`, [placeIds]);
        if (userIds.length) await ds.query(`DELETE FROM users WHERE id = ANY($1)`, [userIds]);
      }
    } finally {
      if (app) await app.close();
    }
  }, 30_000);

  // ---- A. Public listing ----
  describe('GET /places/:id/contacts (public)', () => {
    it('không cần JWT -> 200', async () => {
      const placeId = await mkPlace('pub_list');
      const res = await request(app.getHttpServer()).get(`/api/places/${placeId}/contacts`);
      expect(res.status).toBe(200);
      expect(res.body.data).toEqual([]);
    });

    it('chỉ trả contact của ĐÚNG place được yêu cầu — không lẫn place khác', async () => {
      const owner = await mkPlaceWithOwner('pub_isolation');
      const otherPlaceId = await mkPlace('pub_isolation_other');

      const created = await createContact(owner.placeId, owner.accessToken, {
        contact_type: 'EMAIL',
        value: 'contact-a@phuquochub.test',
      });
      expect(created.status).toBe(201);

      const listA = await request(app.getHttpServer()).get(`/api/places/${owner.placeId}/contacts`);
      expect(listA.status).toBe(200);
      expect(listA.body.data).toHaveLength(1);
      expect(listA.body.data[0].id).toBe(created.body.data.id);

      const listOther = await request(app.getHttpServer()).get(`/api/places/${otherPlaceId}/contacts`);
      expect(listOther.status).toBe(200);
      expect(listOther.body.data).toEqual([]);
    });

    it('contact đã xoá mềm -> KHÔNG xuất hiện trong danh sách công khai', async () => {
      const owner = await mkPlaceWithOwner('pub_soft_delete');
      const created = await createContact(owner.placeId, owner.accessToken);
      expect(created.status).toBe(201);
      const contactId = created.body.data.id;

      const del = await request(app.getHttpServer())
        .delete(`/api/contacts/${contactId}`)
        .set('Authorization', `Bearer ${owner.accessToken}`);
      expect(del.status).toBe(200);

      const list = await request(app.getHttpServer()).get(`/api/places/${owner.placeId}/contacts`);
      expect(list.status).toBe(200);
      expect(list.body.data).toEqual([]);
    });
  });

  // ---- B. Authentication ----
  describe('Authentication (401 without JWT)', () => {
    it('POST /places/:id/contacts không JWT -> 401', async () => {
      const placeId = await mkPlace('auth_post');
      const res = await request(app.getHttpServer())
        .post(`/api/places/${placeId}/contacts`)
        .send({ contact_type: 'PHONE', value: '0900000000' });
      expect(res.status).toBe(401);
    });

    it('PATCH /contacts/:id không JWT -> 401', async () => {
      const owner = await mkPlaceWithOwner('auth_patch');
      const created = await createContact(owner.placeId, owner.accessToken);
      expect(created.status).toBe(201);

      const res = await request(app.getHttpServer())
        .patch(`/api/contacts/${created.body.data.id}`)
        .send({ value: 'should-not-apply' });
      expect(res.status).toBe(401);
    });

    it('DELETE /contacts/:id không JWT -> 401', async () => {
      const owner = await mkPlaceWithOwner('auth_delete');
      const created = await createContact(owner.placeId, owner.accessToken);
      expect(created.status).toBe(201);

      const res = await request(app.getHttpServer()).delete(`/api/contacts/${created.body.data.id}`);
      expect(res.status).toBe(401);
    });
  });

  // ---- C. Owner authorization ----
  describe('Owner CRUD', () => {
    it('owner POST -> 201, response contract đúng Contact schema', async () => {
      const owner = await mkPlaceWithOwner('owner_create');
      const res = await createContact(owner.placeId, owner.accessToken, {
        contact_type: 'HOTLINE',
        value: '1900-1234',
        label: 'Đường dây nóng',
        is_primary: true,
        display_order: 1,
      });
      expect(res.status).toBe(201);
      expect(res.body.data).toEqual({
        id: expect.any(String),
        owner_type: 'place',
        contact_type: 'HOTLINE',
        value: '1900-1234',
        label: 'Đường dây nóng',
        is_primary: true,
        verification_status: 'pending',
        display_order: 1,
      });
    });

    it('owner PATCH -> 200, cập nhật đúng field gửi lên', async () => {
      const owner = await mkPlaceWithOwner('owner_update');
      const created = await createContact(owner.placeId, owner.accessToken, { value: '0911111111' });
      expect(created.status).toBe(201);

      const res = await request(app.getHttpServer())
        .patch(`/api/contacts/${created.body.data.id}`)
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .send({ value: '0922222222', label: 'Updated by owner' });
      expect(res.status).toBe(200);
      expect(res.body.data.value).toBe('0922222222');
      expect(res.body.data.label).toBe('Updated by owner');
      expect(res.body.data.id).toBe(created.body.data.id);
    });

    it('owner DELETE -> 200, xoá MỀM (deleted_at set, row vẫn tồn tại)', async () => {
      const owner = await mkPlaceWithOwner('owner_delete');
      const created = await createContact(owner.placeId, owner.accessToken);
      expect(created.status).toBe(201);
      const contactId = created.body.data.id;

      const res = await request(app.getHttpServer())
        .delete(`/api/contacts/${contactId}`)
        .set('Authorization', `Bearer ${owner.accessToken}`);
      expect(res.status).toBe(200);
      expect(res.body.data).toBeNull();

      const rows: Array<{ deleted_at: string | null }> = await ds.query(
        `SELECT deleted_at FROM contacts WHERE id = $1`,
        [contactId],
      );
      expect(rows).toHaveLength(1);
      expect(rows[0].deleted_at).not.toBeNull();

      // Xoá mềm rồi -> PATCH/DELETE lần nữa không còn thấy resource (findById lọc deleted_at IS
      // NULL) -> AuthorizationContext resolver trả null -> fail-closed -> 403 (Thiếu quyền).
      const patchAfterDelete = await request(app.getHttpServer())
        .patch(`/api/contacts/${contactId}`)
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .send({ value: 'should-not-apply' });
      expect(patchAfterDelete.status).toBe(403);
    });
  });

  // ---- D. Business manager authorization ----
  describe('Manager CRUD', () => {
    it('manager POST -> 201', async () => {
      const owner = await mkPlaceWithOwner('mgr_create_owner');
      const manager = await mkManagerForPlace(owner.placeId, 'mgr_create');

      const res = await createContact(owner.placeId, manager.accessToken, {
        contact_type: 'ZALO',
        value: '0933333333',
      });
      expect(res.status).toBe(201);
      expect(res.body.data.contact_type).toBe('ZALO');
    });

    it('manager PATCH -> 200', async () => {
      const owner = await mkPlaceWithOwner('mgr_update_owner');
      const manager = await mkManagerForPlace(owner.placeId, 'mgr_update');
      const created = await createContact(owner.placeId, owner.accessToken, { value: '0944444444' });
      expect(created.status).toBe(201);

      const res = await request(app.getHttpServer())
        .patch(`/api/contacts/${created.body.data.id}`)
        .set('Authorization', `Bearer ${manager.accessToken}`)
        .send({ value: '0955555555' });
      expect(res.status).toBe(200);
      expect(res.body.data.value).toBe('0955555555');
    });

    it('manager DELETE -> 200 (xoá mềm)', async () => {
      const owner = await mkPlaceWithOwner('mgr_delete_owner');
      const manager = await mkManagerForPlace(owner.placeId, 'mgr_delete');
      const created = await createContact(owner.placeId, owner.accessToken);
      expect(created.status).toBe(201);

      const res = await request(app.getHttpServer())
        .delete(`/api/contacts/${created.body.data.id}`)
        .set('Authorization', `Bearer ${manager.accessToken}`);
      expect(res.status).toBe(200);

      const rows: Array<{ deleted_at: string | null }> = await ds.query(
        `SELECT deleted_at FROM contacts WHERE id = $1`,
        [created.body.data.id],
      );
      expect(rows[0].deleted_at).not.toBeNull();
    });
  });

  // ---- E. Cross-user / IDOR isolation ----
  describe('Cross-user isolation (IDOR)', () => {
    it('unrelated user (không có grant Managed nào) -> POST -> 403', async () => {
      const owner = await mkPlaceWithOwner('idor_create_owner');
      const stranger = await createUser('idor_create_stranger');
      await assignRole(stranger.userId, 'member', 'global', null);

      const res = await createContact(owner.placeId, stranger.accessToken);
      expect(res.status).toBe(403);
    });

    it('unrelated user -> PATCH contact của place khác -> 403, dữ liệu KHÔNG đổi', async () => {
      const owner = await mkPlaceWithOwner('idor_update_owner');
      const stranger = await createUser('idor_update_stranger');
      await assignRole(stranger.userId, 'member', 'global', null);
      const created = await createContact(owner.placeId, owner.accessToken, { value: 'untouched-value' });
      expect(created.status).toBe(201);

      const res = await request(app.getHttpServer())
        .patch(`/api/contacts/${created.body.data.id}`)
        .set('Authorization', `Bearer ${stranger.accessToken}`)
        .send({ value: 'HACKED' });
      expect(res.status).toBe(403);

      const rows: Array<{ value: string }> = await ds.query(`SELECT value FROM contacts WHERE id = $1`, [
        created.body.data.id,
      ]);
      expect(rows[0].value).toBe('untouched-value');
    });

    it('unrelated user -> DELETE contact của place khác -> 403, row vẫn còn nguyên (chưa xoá)', async () => {
      const owner = await mkPlaceWithOwner('idor_delete_owner');
      const stranger = await createUser('idor_delete_stranger');
      await assignRole(stranger.userId, 'member', 'global', null);
      const created = await createContact(owner.placeId, owner.accessToken);
      expect(created.status).toBe(201);

      const res = await request(app.getHttpServer())
        .delete(`/api/contacts/${created.body.data.id}`)
        .set('Authorization', `Bearer ${stranger.accessToken}`);
      expect(res.status).toBe(403);

      const rows: Array<{ deleted_at: string | null }> = await ds.query(
        `SELECT deleted_at FROM contacts WHERE id = $1`,
        [created.body.data.id],
      );
      expect(rows[0].deleted_at).toBeNull();
    });
  });

  // ---- F. Cross-place isolation ----
  // Chứng minh trọng tâm của toàn bộ ADR-019 D5/D16 cho Contacts: PATCH/DELETE KHÔNG hề có place id
  // nào trong request (route chỉ có :id = contact id) — vậy attacker KHÔNG THỂ "gửi" place id để
  // thoát scoping. Owner B có Managed grant HIỆU LỰC THẬT nhưng cho place B — CONTACT_AUTHZ_RESOLVER
  // tra contacts.owner_id (place A) từ DB, không khớp business_id grant của owner B -> 403. Đây là
  // bằng chứng authorization dựa trên danh tính DB-derived, không phải bất cứ gì client cung cấp.
  describe('Cross-place isolation', () => {
    it('owner của place B (grant Managed hiệu lực CHO place B) -> PATCH contact của place A -> 403', async () => {
      const ownerA = await mkPlaceWithOwner('crossplace_a');
      const ownerB = await mkPlaceWithOwner('crossplace_b');
      const created = await createContact(ownerA.placeId, ownerA.accessToken, { value: 'place-a-value' });
      expect(created.status).toBe(201);

      const res = await request(app.getHttpServer())
        .patch(`/api/contacts/${created.body.data.id}`)
        .set('Authorization', `Bearer ${ownerB.accessToken}`)
        .send({ value: 'HACKED-FROM-B' });
      expect(res.status).toBe(403);

      const rows: Array<{ value: string }> = await ds.query(`SELECT value FROM contacts WHERE id = $1`, [
        created.body.data.id,
      ]);
      expect(rows[0].value).toBe('place-a-value');
    });

    it('owner của place B -> DELETE contact của place A -> 403', async () => {
      const ownerA = await mkPlaceWithOwner('crossplace_del_a');
      const ownerB = await mkPlaceWithOwner('crossplace_del_b');
      const created = await createContact(ownerA.placeId, ownerA.accessToken);
      expect(created.status).toBe(201);

      const res = await request(app.getHttpServer())
        .delete(`/api/contacts/${created.body.data.id}`)
        .set('Authorization', `Bearer ${ownerB.accessToken}`);
      expect(res.status).toBe(403);

      const rows: Array<{ deleted_at: string | null }> = await ds.query(
        `SELECT deleted_at FROM contacts WHERE id = $1`,
        [created.body.data.id],
      );
      expect(rows[0].deleted_at).toBeNull();
    });

    it('owner của place B -> POST contact LÊN place A -> 403 (@AuthorizationContext resourceType=place dùng :id của route, không phải business_id của caller)', async () => {
      const ownerA = await mkPlaceWithOwner('crossplace_post_a');
      const ownerB = await mkPlaceWithOwner('crossplace_post_b');

      const res = await createContact(ownerA.placeId, ownerB.accessToken);
      expect(res.status).toBe(403);
    });
  });

  // ---- G. Input contract ----
  describe('Input validation (DTO contract)', () => {
    it('contact_type hợp lệ (đủ loại closed enum) -> 201', async () => {
      const owner = await mkPlaceWithOwner('valid_types');
      for (const type of ['HOTLINE', 'PHONE', 'EMAIL', 'WEBSITE', 'FACEBOOK', 'INSTAGRAM', 'TIKTOK', 'ZALO', 'YOUTUBE', 'OTHER']) {
        const res = await createContact(owner.placeId, owner.accessToken, {
          contact_type: type,
          value: `value-for-${type}`,
        });
        expect(res.status).toBe(201);
        expect(res.body.data.contact_type).toBe(type);
      }
    });

    it('contact_type KHÔNG thuộc enum -> 400', async () => {
      const owner = await mkPlaceWithOwner('invalid_type');
      const res = await createContact(owner.placeId, owner.accessToken, { contact_type: 'CARRIER_PIGEON' });
      expect(res.status).toBe(400);
    });

    it('thiếu value (required) -> 400', async () => {
      const owner = await mkPlaceWithOwner('missing_value');
      const res = await request(app.getHttpServer())
        .post(`/api/places/${owner.placeId}/contacts`)
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .send({ contact_type: 'PHONE' });
      expect(res.status).toBe(400);
    });

    it('value vượt MaxLength(300) -> 400', async () => {
      const owner = await mkPlaceWithOwner('long_value');
      const res = await createContact(owner.placeId, owner.accessToken, { value: 'x'.repeat(301) });
      expect(res.status).toBe(400);
    });

    it('label vượt MaxLength(120) -> 400', async () => {
      const owner = await mkPlaceWithOwner('long_label');
      const res = await createContact(owner.placeId, owner.accessToken, { label: 'x'.repeat(121) });
      expect(res.status).toBe(400);
    });

    it('field không khai báo trong DTO (forbidNonWhitelisted) -> 400', async () => {
      const owner = await mkPlaceWithOwner('extra_field');
      const res = await createContact(owner.placeId, owner.accessToken, { not_a_real_field: 'x' });
      expect(res.status).toBe(400);
    });
  });

  // ---- H. Response contract / privacy ----
  describe('Response contract', () => {
    it('response CHỈ chứa đúng field tài liệu hoá — không rò owner_id/ownerId/timestamps nội bộ', async () => {
      const owner = await mkPlaceWithOwner('response_shape');
      const res = await createContact(owner.placeId, owner.accessToken);
      expect(res.status).toBe(201);
      expect(Object.keys(res.body.data).sort()).toEqual(
        ['contact_type', 'display_order', 'id', 'is_primary', 'label', 'owner_type', 'value', 'verification_status'].sort(),
      );
      expect(res.body.data).not.toHaveProperty('ownerId');
      expect(res.body.data).not.toHaveProperty('owner_id');
      expect(res.body.data).not.toHaveProperty('createdAt');
      expect(res.body.data).not.toHaveProperty('updatedAt');
      expect(res.body.data).not.toHaveProperty('deletedAt');
      expect(res.body.data).not.toHaveProperty('deleted_at');
    });
  });
});
