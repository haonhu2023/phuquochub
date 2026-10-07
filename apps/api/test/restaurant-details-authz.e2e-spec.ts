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

// Restaurant details + menu over real HTTP, live Postgres. Proves, through the real PermissionsGuard path:
// - a Place.Edit.Managed holder of restaurant A can read/write A's details and menu, but gets 403 on B
//   (no read, no write, B unchanged);
// - a user with no grant gets 403 on read and write;
// - the details CAS over HTTP: a stale version is 409 and writes nothing; success returns the new version;
// - public visibility: a draft restaurant's details are not exposed by GET /restaurants/:slug.
describe('Restaurant details & menu over HTTP: managed scope, CAS, public visibility — live Postgres', () => {
  let app: INestApplication;
  let ds: DataSource;
  let jwt: JwtService;
  let config: ConfigService;
  let restaurantCategoryId: string;

  async function createUser(label: string): Promise<{ accessToken: string; userId: string }> {
    const email = `e2e_rest_${label}_${Date.now()}_${Math.random().toString(36).slice(2)}@phuquochub.test`;
    const rows: Array<{ id: string }> = await ds.query(
      `INSERT INTO users (email, display_name) VALUES ($1, $2) RETURNING id`,
      [email, `Restaurant E2E ${label}`],
    );
    const userId = rows[0].id;
    const accessToken = await jwt.signAsync(
      { sub: userId, email, type: 'access' },
      { secret: config.get<string>('jwt.accessSecret'), expiresIn: config.get<number>('jwt.accessTtl') ?? 900 },
    );
    return { accessToken, userId };
  }

  async function mkRestaurant(label: string, status: 'published' | 'draft'): Promise<{ id: string; slug: string }> {
    const slug = `e2e-rest-${label}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const [row]: Array<{ id: string }> = await ds.query(
      `INSERT INTO places (name, slug, category_id, location, status)
       VALUES ($1, $2, $3, ST_SetSRID(ST_MakePoint(103.9, 10.2), 4326)::geography, $4)
       RETURNING id`,
      [`E2E restaurant ${label}`, slug, restaurantCategoryId, status],
    );
    return { id: row.id, slug };
  }

  async function grantManaged(userId: string, placeId: string): Promise<void> {
    const [{ id: roleId }] = await ds.query(`SELECT id FROM roles WHERE code = 'business_manager'`);
    await ds.query(`INSERT INTO user_roles (user_id, role_id, scope_type, business_id) VALUES ($1,$2,'managed',$3)`, [
      userId,
      roleId,
      placeId,
    ]);
    await ds.query(`INSERT INTO business_members (place_id, user_id, role, granted_by) VALUES ($1,$2,'manager',$2)`, [
      placeId,
      userId,
    ]);
  }

  async function version(placeId: string): Promise<number> {
    const [p]: Array<{ content_version: number }> = await ds.query(`SELECT content_version FROM places WHERE id = $1`, [placeId]);
    return p.content_version;
  }

  async function specialist(placeId: string): Promise<boolean | null> {
    const [d]: Array<{ is_local_specialty: boolean }> = await ds.query(
      `SELECT is_local_specialty FROM place_restaurant_details WHERE place_id = $1`,
      [placeId],
    );
    return d?.is_local_specialty ?? null;
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
    const [cat] = await ds.query(`SELECT id FROM categories WHERE slug = 'restaurant' LIMIT 1`);
    restaurantCategoryId = cat.id;
  }, 120_000);

  afterAll(async () => {
    await app?.close();
  });

  it('manager của nhà hàng A: đọc/ghi được chi tiết và menu của A; B → 403 cả đọc, ghi details và ghi menu; B không đổi', async () => {
    const a = await mkRestaurant('scope-a', 'published');
    const b = await mkRestaurant('scope-b', 'published');
    const mgr = await createUser('mgr-a');
    await grantManaged(mgr.userId, a.id);
    const auth = { Authorization: `Bearer ${mgr.accessToken}` };

    const readA = await request(app.getHttpServer()).get(`/api/restaurants/${a.id}/details`).set(auth);
    expect(readA.status).toBe(200);

    const writeA = await request(app.getHttpServer())
      .patch(`/api/restaurants/${a.id}/details`)
      .set(auth)
      .send({ expected_content_version: await version(a.id), is_local_specialty: true });
    expect(writeA.status).toBe(200);

    const readB = await request(app.getHttpServer()).get(`/api/restaurants/${b.id}/details`).set(auth);
    expect(readB.status).toBe(403);

    const bVersion = await version(b.id);
    const writeB = await request(app.getHttpServer())
      .patch(`/api/restaurants/${b.id}/details`)
      .set(auth)
      .send({ expected_content_version: bVersion, is_local_specialty: true });
    expect(writeB.status).toBe(403);

    const menuB = await request(app.getHttpServer())
      .patch(`/api/restaurants/${b.id}/menu`)
      .set(auth)
      .send({ expected_content_version: bVersion, sections: [] });
    expect(menuB.status).toBe(403);

    expect(await version(b.id)).toBe(bVersion);
    expect(await specialist(b.id)).toBeNull();
  });

  it('không có grant nào: đọc và ghi chi tiết đều 403, không ghi gì', async () => {
    const a = await mkRestaurant('nogrant', 'published');
    const outsider = await createUser('outsider');
    const before = await version(a.id);

    const read = await request(app.getHttpServer()).get(`/api/restaurants/${a.id}/details`).set('Authorization', `Bearer ${outsider.accessToken}`);
    expect(read.status).toBe(403);

    const write = await request(app.getHttpServer())
      .patch(`/api/restaurants/${a.id}/details`)
      .set('Authorization', `Bearer ${outsider.accessToken}`)
      .send({ expected_content_version: before, is_local_specialty: true });
    expect(write.status).toBe(403);

    expect(await version(a.id)).toBe(before);
    expect(await specialist(a.id)).toBeNull();
  });

  it('CAS qua HTTP: stale → 409 không ghi; thành công trả version mới; lần kế dùng version đó → 200', async () => {
    const a = await mkRestaurant('cas', 'published');
    const mgr = await createUser('mgr-cas');
    await grantManaged(mgr.userId, a.id);
    const auth = { Authorization: `Bearer ${mgr.accessToken}` };
    const v0 = await version(a.id);

    const first = await request(app.getHttpServer())
      .patch(`/api/restaurants/${a.id}/details`)
      .set(auth)
      .send({ expected_content_version: v0, is_local_specialty: true });
    expect(first.status).toBe(200);
    expect(first.body.data.content_version).toBe(v0 + 1);

    const stale = await request(app.getHttpServer())
      .patch(`/api/restaurants/${a.id}/details`)
      .set(auth)
      .send({ expected_content_version: v0, is_local_specialty: false });
    expect(stale.status).toBe(409);
    expect(await version(a.id)).toBe(v0 + 1);
    expect(await specialist(a.id)).toBe(true);

    const next = await request(app.getHttpServer())
      .patch(`/api/restaurants/${a.id}/details`)
      .set(auth)
      .send({ expected_content_version: first.body.data.content_version, is_local_specialty: false });
    expect(next.status).toBe(200);
    expect(next.body.data.content_version).toBe(v0 + 2);
  });

  it('công khai: bản nháp không lộ chi tiết qua GET /restaurants/:slug', async () => {
    const draft = await mkRestaurant('draft', 'draft');
    const mgr = await createUser('mgr-draft');
    await grantManaged(mgr.userId, draft.id);
    await request(app.getHttpServer())
      .patch(`/api/restaurants/${draft.id}/details`)
      .set('Authorization', `Bearer ${mgr.accessToken}`)
      .send({ expected_content_version: await version(draft.id), is_local_specialty: true });

    const publicRes = await request(app.getHttpServer()).get(`/api/restaurants/${draft.slug}`);
    expect(publicRes.status).toBe(404);
    expect(JSON.stringify(publicRes.body)).not.toContain('is_local_specialty');
  });
});
