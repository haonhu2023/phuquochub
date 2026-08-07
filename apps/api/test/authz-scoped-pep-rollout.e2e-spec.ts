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

// ADR-019 M0.2 (Resource-Scoped Authorization — PEP + Resolvers + Rollout).
//
// FINDING A (ADR-019 §Context, phát hiện gốc từ đánh giá kỹ thuật ADR-015): trước M0.2,
// `PermissionsGuard` chỉ kiểm HẠNG scope của permission (`Place.Edit.Managed`), KHÔNG BAO GIỜ so
// khớp DANH TÍNH tài nguyên — một `business_manager` scoped tới place A có thể sửa place B/C/bất
// kỳ place nào khác. Bộ e2e này là bằng chứng RED-THEN-GREEN:
//
//   RED  (chạy khi mã nguồn PEP CHƯA đấu nối — M0.1 baseline, `git stash` các thay đổi M0.2 tracked
//         rồi chạy lại chính file này): managerA PATCH place B trả về 200 — Finding A tái hiện SỐNG.
//   GREEN (mã nguồn M0.2 đầy đủ, trạng thái hiện tại của repo): managerA PATCH place B trả về 403
//         cho CẢ 8 handler; place A vẫn 200/201; contributor (Any) và super_administrator (wildcard)
//         không đổi hành vi; tài nguyên không xác định trả 403 đồng nhất (không lộ tồn tại).
//
// CẦN Postgres thật (migration đã chạy, seed RBAC/Place permissions). Vai trò được gán trực tiếp
// qua SQL (không route HTTP nào gán business_manager — xác nhận trong ADR-019 §Context).
describe('ADR-019 M0.2 — resource-scoped PEP rollout (red-then-green, live Postgres)', () => {
  let app: INestApplication;
  let ds: DataSource;
  let jwt: JwtService;
  let config: ConfigService;

  let placeAId: string;
  let placeBId: string;
  let contactAId: string;
  let contactBId: string;
  let priceAId: string;
  let priceBId: string;
  const userIds: string[] = [];
  const userRoleIds: string[] = [];
  const contactIds: string[] = [];
  const priceIds: string[] = [];
  const placeIds: string[] = [];

  // Tạo user + access token TRỰC TIẾP (INSERT + ký JWT bằng chính JwtService/secret mà
  // TokenService dùng) — KHÔNG qua `POST /auth/register`. Route đó bị `@Throttle` giới hạn 10
  // request/60s (auth.controller.ts AUTH_THROTTLE) — bộ test này cần nhiều user hơn giới hạn đó
  // trong cùng một cửa sổ. Cùng tiền lệ với authz-scoped-grants.e2e-spec.ts (insert user trực
  // tiếp qua DataSource.query). Không cần password/hash — test không đăng nhập qua HTTP.
  async function createUser(label: string): Promise<{ accessToken: string; userId: string }> {
    const email = `e2e_m02_${label}_${Date.now()}_${Math.random().toString(36).slice(2)}@phuquochub.test`;
    const rows: Array<{ id: string }> = await ds.query(
      `INSERT INTO users (email, display_name) VALUES ($1, $2) RETURNING id`,
      [email, `M0.2 E2E ${label}`],
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
    const roleRows: Array<{ id: string }> = await ds.query(`SELECT id FROM roles WHERE code = $1`, [roleCode]);
    if (!roleRows[0]) throw new Error(`role not seeded: ${roleCode}`);
    const rows: Array<{ id: string }> = await ds.query(
      `INSERT INTO user_roles (user_id, role_id, scope_type, business_id) VALUES ($1, $2, $3, $4) RETURNING id`,
      [userId, roleRows[0].id, scopeType, businessId],
    );
    userRoleIds.push(rows[0].id);
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }),
    );
    app.useGlobalInterceptors(new TransformInterceptor());
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();

    ds = app.get<DataSource>(getDataSourceToken());
    jwt = app.get(JwtService);
    config = app.get(ConfigService);

    const [{ id: categoryId }] = await ds.query(`SELECT id FROM categories LIMIT 1`);
    const mkPlace = async (name: string) => {
      const rows: Array<{ id: string }> = await ds.query(
        `INSERT INTO places (name, slug, category_id, location, status)
         VALUES ($1, $2, $3, ST_SetSRID(ST_MakePoint(103.9, 10.2), 4326)::geography, 'published')
         RETURNING id`,
        [name, `${name.toLowerCase().replace(/\s+/g, '-')}-${Date.now()}`, categoryId],
      );
      placeIds.push(rows[0].id);
      return rows[0].id;
    };
    placeAId = await mkPlace('E2E M0.2 Place A');
    placeBId = await mkPlace('E2E M0.2 Place B');

    const mkContact = async (placeId: string) => {
      const rows: Array<{ id: string }> = await ds.query(
        `INSERT INTO contacts (owner_type, owner_id, contact_type, value) VALUES ('place', $1, 'PHONE', '0900000000') RETURNING id`,
        [placeId],
      );
      contactIds.push(rows[0].id);
      return rows[0].id;
    };
    contactAId = await mkContact(placeAId);
    contactBId = await mkContact(placeBId);

    const mkPrice = async (placeId: string) => {
      const rows: Array<{ id: string }> = await ds.query(
        `INSERT INTO price_history (entity_type, entity_id, service_name, amount, currency) VALUES ('place', $1, 'Vé vào cổng', 50000, 'VND') RETURNING id`,
        [placeId],
      );
      priceIds.push(rows[0].id);
      return rows[0].id;
    };
    priceAId = await mkPrice(placeAId);
    priceBId = await mkPrice(placeBId);
  }, 60_000);

  // Teardown hang fix (2026-08-07): dọn dẹp trong `try` — nếu một bước ném lỗi, `finally` vẫn đảm
  // bảo `app.close()` chạy (không thì Nest/TypeORM giữ handle mở, Jest treo sau khi in kết quả).
  // KHÔNG nuốt lỗi bằng `.catch()`: lỗi dọn dẹp vẫn nổi lên sau `finally`.
  afterAll(async () => {
    try {
      if (ds?.isInitialized) {
        // wiki_revisions.editor_id có FK cứng -> users.id (ON DELETE NO ACTION) — contributor/
        // super_admin PATCH place tạo revision với editor_id = họ (PlacesService.update). Phải xoá
        // TRƯỚC users, không thì DELETE users vi phạm FK.
        if (userIds.length || placeIds.length) {
          await ds.query(
            `DELETE FROM wiki_revisions WHERE editor_id = ANY($1) OR (entity_type = 'place' AND entity_id = ANY($2))`,
            [userIds, placeIds],
          );
        }
        if (userRoleIds.length) await ds.query(`DELETE FROM user_roles WHERE id = ANY($1)`, [userRoleIds]);
        if (priceIds.length) await ds.query(`DELETE FROM price_history WHERE id = ANY($1)`, [priceIds]);
        if (contactIds.length) await ds.query(`DELETE FROM contacts WHERE id = ANY($1)`, [contactIds]);
        if (placeIds.length) await ds.query(`DELETE FROM places WHERE id = ANY($1)`, [placeIds]);
        if (userIds.length) await ds.query(`DELETE FROM users WHERE id = ANY($1)`, [userIds]);
      }
    } finally {
      if (app) await app.close();
    }
  }, 30_000);

  describe('Finding A — cross-business isolation for business_manager (place-identity handlers)', () => {
    it('managerA (Managed, scoped to place A) PATCH place A -> 200 (own business, allowed)', async () => {
      const { accessToken, userId } = await createUser('mgrA_places');
      await assignRole(userId, 'business_manager', 'managed', placeAId);

      const res = await request(app.getHttpServer())
        .patch(`/api/places/${placeAId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ name: 'Place A — updated by manager A' });

      expect(res.status).toBe(200);
    });

    it('managerA (Managed, scoped to place A) PATCH place B -> 403 (Finding A closed: cross-business denied)', async () => {
      const { accessToken, userId } = await createUser('mgrA_cross_places');
      await assignRole(userId, 'business_manager', 'managed', placeAId);

      const res = await request(app.getHttpServer())
        .patch(`/api/places/${placeBId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ name: 'SHOULD NOT APPLY' });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('hotels: managerA PATCH /hotels/:id/rooms — place A allowed, place B denied', async () => {
      const { accessToken, userId } = await createUser('mgrA_hotels');
      await assignRole(userId, 'business_manager', 'managed', placeAId);

      const allowed = await request(app.getHttpServer())
        .patch(`/api/hotels/${placeAId}/rooms`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ rooms: [] });
      const denied = await request(app.getHttpServer())
        .patch(`/api/hotels/${placeBId}/rooms`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ rooms: [] });

      expect(allowed.status).toBe(200);
      expect(denied.status).toBe(403);
    });

    it('restaurants: managerA PATCH /restaurants/:id/menu — place A allowed, place B denied', async () => {
      const { accessToken, userId } = await createUser('mgrA_restaurants');
      await assignRole(userId, 'business_manager', 'managed', placeAId);

      const allowed = await request(app.getHttpServer())
        .patch(`/api/restaurants/${placeAId}/menu`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ sections: [] });
      const denied = await request(app.getHttpServer())
        .patch(`/api/restaurants/${placeBId}/menu`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ sections: [] });

      expect(allowed.status).toBe(200);
      expect(denied.status).toBe(403);
    });

    it('contacts: managerA POST /places/:id/contacts — place A allowed, place B denied', async () => {
      const { accessToken, userId } = await createUser('mgrA_contacts_create');
      await assignRole(userId, 'business_manager', 'managed', placeAId);

      const allowed = await request(app.getHttpServer())
        .post(`/api/places/${placeAId}/contacts`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ contact_type: 'PHONE', value: '0911111111' });
      const denied = await request(app.getHttpServer())
        .post(`/api/places/${placeBId}/contacts`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ contact_type: 'PHONE', value: '0922222222' });

      expect(allowed.status).toBe(201);
      expect(denied.status).toBe(403);
      if (allowed.status === 201) {
        contactIds.push(allowed.body.data.id);
      }
    });

    it('prices: managerA POST /places/:id/prices — place A allowed, place B denied', async () => {
      const { accessToken, userId } = await createUser('mgrA_prices_create');
      await assignRole(userId, 'business_manager', 'managed', placeAId);

      const allowed = await request(app.getHttpServer())
        .post(`/api/places/${placeAId}/prices`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ service_name: 'Vé người lớn', amount: 100000 });
      const denied = await request(app.getHttpServer())
        .post(`/api/places/${placeBId}/prices`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ service_name: 'Vé người lớn', amount: 100000 });

      expect(allowed.status).toBe(201);
      expect(denied.status).toBe(403);
      if (allowed.status === 201) {
        priceIds.push(allowed.body.data.id);
      }
    });
  });

  describe('Contact/Price authz resolvers — cross-business isolation for resource-identity handlers', () => {
    it('contacts: managerA PATCH /contacts/:id — contact of place A allowed, contact of place B denied', async () => {
      const { accessToken, userId } = await createUser('mgrA_contacts_update');
      await assignRole(userId, 'business_manager', 'managed', placeAId);

      const allowed = await request(app.getHttpServer())
        .patch(`/api/contacts/${contactAId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ value: '0933333333' });
      const denied = await request(app.getHttpServer())
        .patch(`/api/contacts/${contactBId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ value: '0944444444' });

      expect(allowed.status).toBe(200);
      expect(denied.status).toBe(403);
    });

    it('contacts: managerA DELETE /contacts/:id — contact of place B denied (contact of place A left intact for other assertions)', async () => {
      const { accessToken, userId } = await createUser('mgrA_contacts_delete');
      await assignRole(userId, 'business_manager', 'managed', placeAId);

      const denied = await request(app.getHttpServer())
        .delete(`/api/contacts/${contactBId}`)
        .set('Authorization', `Bearer ${accessToken}`);

      expect(denied.status).toBe(403);
    });

    it('prices: managerA PATCH /prices/:id — price of place A allowed, price of place B denied', async () => {
      const { accessToken, userId } = await createUser('mgrA_prices_update');
      await assignRole(userId, 'business_manager', 'managed', placeAId);

      const allowed = await request(app.getHttpServer())
        .patch(`/api/prices/${priceAId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ service_name: 'Vé cập nhật' });
      const denied = await request(app.getHttpServer())
        .patch(`/api/prices/${priceBId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ service_name: 'SHOULD NOT APPLY' });

      expect(allowed.status).toBe(200);
      expect(denied.status).toBe(403);
    });

    it('unknown/non-existent resource id -> uniform 403, KHÔNG lộ tồn tại (D10)', async () => {
      const { accessToken, userId } = await createUser('mgrA_unknown');
      await assignRole(userId, 'business_manager', 'managed', placeAId);
      const nonExistentUuid = '00000000-0000-4000-8000-000000000000';

      const res = await request(app.getHttpServer())
        .patch(`/api/contacts/${nonExistentUuid}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ value: 'x' });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });
  });

  describe('Any/wildcard scope unaffected — contributor and super_administrator', () => {
    it('contributor (Place.Edit.Any) edits BOTH place A and place B unchanged', async () => {
      const { accessToken, userId } = await createUser('contributor');
      await assignRole(userId, 'contributor', 'global', null);

      const a = await request(app.getHttpServer())
        .patch(`/api/places/${placeAId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ name: 'Place A — edited by contributor' });
      const b = await request(app.getHttpServer())
        .patch(`/api/places/${placeBId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ name: 'Place B — edited by contributor' });

      expect(a.status).toBe(200);
      expect(b.status).toBe(200);
    });

    it('super_administrator (wildcard "*") edits BOTH place A and place B unchanged', async () => {
      const { accessToken, userId } = await createUser('superadmin');
      await assignRole(userId, 'super_administrator', 'global', null);

      const a = await request(app.getHttpServer())
        .patch(`/api/places/${placeAId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ name: 'Place A — edited by super admin' });
      const b = await request(app.getHttpServer())
        .patch(`/api/places/${placeBId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ name: 'Place B — edited by super admin' });

      expect(a.status).toBe(200);
      expect(b.status).toBe(200);
    });

    it('plain member (không có grant Managed/Any nào) vẫn 403 cho cả hai place — deny-by-default không đổi', async () => {
      const { accessToken, userId } = await createUser('plain_member');
      // `createUser` KHÔNG tự gán 'member' như `POST /auth/register` làm — gán tường minh ở đây để
      // tái tạo đúng hồ sơ quyền của một user thật mới đăng ký (rbac.md: mọi user có 'member').
      await assignRole(userId, 'member', 'global', null);

      const a = await request(app.getHttpServer())
        .patch(`/api/places/${placeAId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ name: 'SHOULD NOT APPLY' });
      const b = await request(app.getHttpServer())
        .patch(`/api/places/${placeBId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ name: 'SHOULD NOT APPLY' });

      expect(a.status).toBe(403);
      expect(b.status).toBe(403);
    });
  });
});
