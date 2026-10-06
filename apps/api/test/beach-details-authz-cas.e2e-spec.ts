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

// Beach details over real HTTP, live Postgres. Proves, through the real PermissionsGuard path:
// - a Place.Edit.Managed holder of place A can read/write A but gets 403 on place B (no read, no write);
// - a user with no grant gets 403 on read and write;
// - CAS over HTTP: a stale version is 409 and writes nothing; a successful PATCH returns the NEW version,
//   and the next PATCH with that version succeeds (the chain the editor relies on);
// - public visibility: a published beach shows details; a draft beach's details are not public (404).
describe('Beach details over HTTP: managed scope, CAS, public visibility — live Postgres', () => {
  let app: INestApplication;
  let ds: DataSource;
  let jwt: JwtService;
  let config: ConfigService;
  let beachCategoryId: string;

  async function createUser(label: string): Promise<{ accessToken: string; userId: string }> {
    const email = `e2e_beach_${label}_${Date.now()}_${Math.random().toString(36).slice(2)}@phuquochub.test`;
    const rows: Array<{ id: string }> = await ds.query(
      `INSERT INTO users (email, display_name) VALUES ($1, $2) RETURNING id`,
      [email, `Beach E2E ${label}`],
    );
    const userId = rows[0].id;
    const accessToken = await jwt.signAsync(
      { sub: userId, email, type: 'access' },
      { secret: config.get<string>('jwt.accessSecret'), expiresIn: config.get<number>('jwt.accessTtl') ?? 900 },
    );
    return { accessToken, userId };
  }

  async function mkBeach(label: string, status: 'published' | 'draft'): Promise<{ id: string; slug: string }> {
    const slug = `e2e-beach-${label}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const [row]: Array<{ id: string }> = await ds.query(
      `INSERT INTO places (name, slug, category_id, location, status)
       VALUES ($1, $2, $3, ST_SetSRID(ST_MakePoint(104.03, 10.05), 4326)::geography, $4)
       RETURNING id`,
      [`E2E beach ${label}`, slug, beachCategoryId, status],
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

  async function row(placeId: string): Promise<{ version: number; access_route: string | null }> {
    const [p]: Array<{ content_version: number }> = await ds.query(`SELECT content_version FROM places WHERE id = $1`, [placeId]);
    const [d]: Array<{ access_route: string | null }> = await ds.query(
      `SELECT access_route FROM place_beach_details WHERE place_id = $1`,
      [placeId],
    );
    return { version: p.content_version, access_route: d?.access_route ?? null };
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
    const [cat] = await ds.query(`SELECT id FROM categories WHERE slug = 'beach' LIMIT 1`);
    beachCategoryId = cat.id;
  }, 120_000);

  afterAll(async () => {
    await app?.close();
  });

  it('manager của bãi A: đọc/ghi được A; B → 403 cả đọc lẫn ghi, B không đổi', async () => {
    const a = await mkBeach('scope-a', 'published');
    const b = await mkBeach('scope-b', 'published');
    const mgr = await createUser('mgr-a');
    await grantManaged(mgr.userId, a.id);

    const readA = await request(app.getHttpServer()).get(`/api/beaches/${a.id}/details`).set('Authorization', `Bearer ${mgr.accessToken}`);
    expect(readA.status).toBe(200);

    const readB = await request(app.getHttpServer()).get(`/api/beaches/${b.id}/details`).set('Authorization', `Bearer ${mgr.accessToken}`);
    expect(readB.status).toBe(403);

    const before = await row(b.id);
    const writeB = await request(app.getHttpServer())
      .patch(`/api/beaches/${b.id}/details`)
      .set('Authorization', `Bearer ${mgr.accessToken}`)
      .send({ expected_content_version: before.version, access_route: 'Ghi lén' });
    expect(writeB.status).toBe(403);
    expect(await row(b.id)).toEqual(before);
  });

  it('không có grant nào: đọc và ghi đều 403, không ghi gì', async () => {
    const a = await mkBeach('nogrant', 'published');
    const outsider = await createUser('outsider');
    const before = await row(a.id);

    const read = await request(app.getHttpServer()).get(`/api/beaches/${a.id}/details`).set('Authorization', `Bearer ${outsider.accessToken}`);
    expect(read.status).toBe(403);

    const write = await request(app.getHttpServer())
      .patch(`/api/beaches/${a.id}/details`)
      .set('Authorization', `Bearer ${outsider.accessToken}`)
      .send({ expected_content_version: before.version, access_route: 'Ghi lén' });
    expect(write.status).toBe(403);
    expect(await row(a.id)).toEqual(before);
  });

  it('CAS qua HTTP: stale → 409 không ghi; thành công trả version mới; lần kế dùng version đó → 200', async () => {
    const a = await mkBeach('cas', 'published');
    const mgr = await createUser('mgr-cas');
    await grantManaged(mgr.userId, a.id);
    const v0 = (await row(a.id)).version;

    const first = await request(app.getHttpServer())
      .patch(`/api/beaches/${a.id}/details`)
      .set('Authorization', `Bearer ${mgr.accessToken}`)
      .send({ expected_content_version: v0, access_route: 'Lần một' });
    expect(first.status).toBe(200);
    expect(first.body.data.content_version).toBe(v0 + 1);
    expect(first.body.data.access_route).toBe('Lần một');

    const stale = await request(app.getHttpServer())
      .patch(`/api/beaches/${a.id}/details`)
      .set('Authorization', `Bearer ${mgr.accessToken}`)
      .send({ expected_content_version: v0, access_route: 'Ghi đè cũ' });
    expect(stale.status).toBe(409);
    expect(await row(a.id)).toEqual({ version: v0 + 1, access_route: 'Lần một' });

    const next = await request(app.getHttpServer())
      .patch(`/api/beaches/${a.id}/details`)
      .set('Authorization', `Bearer ${mgr.accessToken}`)
      .send({ expected_content_version: first.body.data.content_version, access_route: 'Lần hai' });
    expect(next.status).toBe(200);
    expect(next.body.data.content_version).toBe(v0 + 2);
  });

  it('công khai: bãi đã xuất bản thấy chi tiết; bãi nháp không lộ qua GET /beaches/:slug', async () => {
    const pub = await mkBeach('public', 'published');
    const draft = await mkBeach('draft', 'draft');
    const mgr = await createUser('mgr-public');
    await grantManaged(mgr.userId, pub.id);
    await grantManaged(mgr.userId, draft.id);

    await request(app.getHttpServer())
      .patch(`/api/beaches/${pub.id}/details`)
      .set('Authorization', `Bearer ${mgr.accessToken}`)
      .send({ expected_content_version: (await row(pub.id)).version, access_route: 'Đường công khai' });
    await request(app.getHttpServer())
      .patch(`/api/beaches/${draft.id}/details`)
      .set('Authorization', `Bearer ${mgr.accessToken}`)
      .send({ expected_content_version: (await row(draft.id)).version, access_route: 'Nháp bí mật' });

    const publicRes = await request(app.getHttpServer()).get(`/api/beaches/${pub.slug}`);
    expect(publicRes.status).toBe(200);
    expect(publicRes.body.data.beach_details.access_route).toBe('Đường công khai');

    const draftRes = await request(app.getHttpServer()).get(`/api/beaches/${draft.slug}`);
    expect(draftRes.status).toBe(404);
    expect(JSON.stringify(draftRes.body)).not.toContain('Nháp bí mật');
  });
});
