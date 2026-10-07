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

// Tour details over real HTTP, live Postgres. Proves, through the real PermissionsGuard path:
// - a Place.Edit.Managed holder of tour A reads/writes A; on tour B gets 403 (no read, no write, B unchanged);
// - a user with no grant gets 403 on read and write;
// - CAS over HTTP: a stale version is 409 and writes nothing; success returns the NEW version and the next
//   PATCH with that version succeeds;
// - first save without tour_type is 400 and creates no row; an empty PATCH does not bump the version;
// - partial PATCH preserves fields that were not sent;
// - public visibility: a published tour exposes its details; a draft tour's details are not exposed.
describe('Tour details over HTTP: managed scope, CAS, field preservation, public visibility — live Postgres', () => {
  let app: INestApplication;
  let ds: DataSource;
  let jwt: JwtService;
  let config: ConfigService;
  let tourCategoryId: string;

  async function createUser(label: string): Promise<{ accessToken: string; userId: string }> {
    const email = `e2e_tour_${label}_${Date.now()}_${Math.random().toString(36).slice(2)}@phuquochub.test`;
    const rows: Array<{ id: string }> = await ds.query(`INSERT INTO users (email, display_name) VALUES ($1, $2) RETURNING id`, [
      email,
      `Tour E2E ${label}`,
    ]);
    const userId = rows[0].id;
    const accessToken = await jwt.signAsync(
      { sub: userId, email, type: 'access' },
      { secret: config.get<string>('jwt.accessSecret'), expiresIn: config.get<number>('jwt.accessTtl') ?? 900 },
    );
    return { accessToken, userId };
  }

  async function mkTour(label: string, status: 'published' | 'draft'): Promise<{ id: string; slug: string }> {
    const slug = `e2e-tour-${label}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const [row]: Array<{ id: string }> = await ds.query(
      `INSERT INTO places (name, slug, category_id, location, status)
       VALUES ($1, $2, $3, ST_SetSRID(ST_MakePoint(104.0, 10.0), 4326)::geography, $4)
       RETURNING id`,
      [`E2E tour ${label}`, slug, tourCategoryId, status],
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

  async function details(placeId: string): Promise<Record<string, unknown> | null> {
    const [d] = await ds.query(
      `SELECT tour_type, pickup_point, inclusions, duration_minutes FROM place_tour_details WHERE place_id = $1`,
      [placeId],
    );
    return d ?? null;
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
    const [cat] = await ds.query(`SELECT id FROM categories WHERE slug = 'tour' LIMIT 1`);
    tourCategoryId = cat.id;
  }, 120_000);

  // afterAll: app.close() chờ các lần retry cache-invalidation nền (WEB_INTERNAL_URL của run không tồn tại)
  // nên cần thời gian hơn timeout mặc định 5s.
  afterAll(async () => {
    await app?.close();
  }, 60_000);

  it('manager của tour A: đọc/ghi được A; B → 403 cả đọc lẫn ghi, B không đổi', async () => {
    const a = await mkTour('scope-a', 'published');
    const b = await mkTour('scope-b', 'published');
    const mgr = await createUser('mgr-a');
    await grantManaged(mgr.userId, a.id);
    const auth = { Authorization: `Bearer ${mgr.accessToken}` };

    const readA = await request(app.getHttpServer()).get(`/api/tours/${a.id}/details`).set(auth);
    expect(readA.status).toBe(200);

    const writeA = await request(app.getHttpServer())
      .patch(`/api/tours/${a.id}/details`)
      .set(auth)
      .send({ expected_content_version: await version(a.id), tour_type: 'diving', pickup_point: 'Cổng A synthetic' });
    expect(writeA.status).toBe(200);

    const readB = await request(app.getHttpServer()).get(`/api/tours/${b.id}/details`).set(auth);
    expect(readB.status).toBe(403);

    const bVersion = await version(b.id);
    const writeB = await request(app.getHttpServer())
      .patch(`/api/tours/${b.id}/details`)
      .set(auth)
      .send({ expected_content_version: bVersion, tour_type: 'diving', pickup_point: 'Ghi lén' });
    expect(writeB.status).toBe(403);
    expect(await version(b.id)).toBe(bVersion);
    expect(await details(b.id)).toBeNull();
  });

  it('không có grant nào: đọc và ghi đều 403, không ghi gì', async () => {
    const a = await mkTour('nogrant', 'published');
    const outsider = await createUser('outsider');
    const before = await version(a.id);
    const auth = { Authorization: `Bearer ${outsider.accessToken}` };

    expect((await request(app.getHttpServer()).get(`/api/tours/${a.id}/details`).set(auth)).status).toBe(403);
    const write = await request(app.getHttpServer())
      .patch(`/api/tours/${a.id}/details`)
      .set(auth)
      .send({ expected_content_version: before, tour_type: 'diving' });
    expect(write.status).toBe(403);
    expect(await version(a.id)).toBe(before);
    expect(await details(a.id)).toBeNull();
  });

  it('CAS qua HTTP: stale → 409 không ghi; thành công trả version mới; lần kế dùng version đó → 200', async () => {
    const a = await mkTour('cas', 'published');
    const mgr = await createUser('mgr-cas');
    await grantManaged(mgr.userId, a.id);
    const auth = { Authorization: `Bearer ${mgr.accessToken}` };
    const v0 = await version(a.id);

    const first = await request(app.getHttpServer())
      .patch(`/api/tours/${a.id}/details`)
      .set(auth)
      .send({ expected_content_version: v0, tour_type: 'fishing', pickup_point: 'Lần một' });
    expect(first.status).toBe(200);
    expect(first.body.data.content_version).toBe(v0 + 1);

    const stale = await request(app.getHttpServer())
      .patch(`/api/tours/${a.id}/details`)
      .set(auth)
      .send({ expected_content_version: v0, pickup_point: 'Ghi đè cũ' });
    expect(stale.status).toBe(409);
    expect((await details(a.id))?.pickup_point).toBe('Lần một');
    expect(await version(a.id)).toBe(v0 + 1);

    const next = await request(app.getHttpServer())
      .patch(`/api/tours/${a.id}/details`)
      .set(auth)
      .send({ expected_content_version: first.body.data.content_version, pickup_point: 'Lần hai' });
    expect(next.status).toBe(200);
    expect(next.body.data.content_version).toBe(v0 + 2);
  });

  it('lần đầu thiếu tour_type → 400, không tạo hàng chi tiết, không tăng version; PATCH rỗng không tăng version', async () => {
    const a = await mkTour('no-type', 'published');
    const mgr = await createUser('mgr-no-type');
    await grantManaged(mgr.userId, a.id);
    const auth = { Authorization: `Bearer ${mgr.accessToken}` };
    const v0 = await version(a.id);

    const noType = await request(app.getHttpServer())
      .patch(`/api/tours/${a.id}/details`)
      .set(auth)
      .send({ expected_content_version: v0, pickup_point: 'Không có loại' });
    expect(noType.status).toBe(400);
    expect(await details(a.id)).toBeNull();
    expect(await version(a.id)).toBe(v0);

    const empty = await request(app.getHttpServer())
      .patch(`/api/tours/${a.id}/details`)
      .set(auth)
      .send({ expected_content_version: v0 });
    expect(empty.status).toBe(200);
    expect(await version(a.id)).toBe(v0);
  });

  it('PATCH một phần giữ nguyên các field không được gửi', async () => {
    const a = await mkTour('preserve', 'published');
    const mgr = await createUser('mgr-preserve');
    await grantManaged(mgr.userId, a.id);
    const auth = { Authorization: `Bearer ${mgr.accessToken}` };

    await request(app.getHttpServer())
      .patch(`/api/tours/${a.id}/details`)
      .set(auth)
      .send({ expected_content_version: await version(a.id), tour_type: 'sightseeing', inclusions: 'Vé giữ nguyên' });
    await request(app.getHttpServer())
      .patch(`/api/tours/${a.id}/details`)
      .set(auth)
      .send({ expected_content_version: await version(a.id), duration_minutes: 120 });

    const d = await details(a.id);
    expect(d).toMatchObject({ tour_type: 'sightseeing', inclusions: 'Vé giữ nguyên', duration_minutes: 120 });
  });

  it('công khai: tour đã xuất bản thấy chi tiết; tour nháp không lộ qua GET /tours/:slug', async () => {
    const pub = await mkTour('public', 'published');
    const draft = await mkTour('draft', 'draft');
    const mgr = await createUser('mgr-public');
    await grantManaged(mgr.userId, pub.id);
    await grantManaged(mgr.userId, draft.id);
    const auth = { Authorization: `Bearer ${mgr.accessToken}` };

    await request(app.getHttpServer())
      .patch(`/api/tours/${pub.id}/details`)
      .set(auth)
      .send({ expected_content_version: await version(pub.id), tour_type: 'cruise', pickup_point: 'Đường công khai' });
    await request(app.getHttpServer())
      .patch(`/api/tours/${draft.id}/details`)
      .set(auth)
      .send({ expected_content_version: await version(draft.id), tour_type: 'cruise', pickup_point: 'Nháp bí mật' });

    const publicRes = await request(app.getHttpServer()).get(`/api/tours/${pub.slug}`);
    expect(publicRes.status).toBe(200);
    expect(publicRes.body.data.tour_details.pickup_point).toBe('Đường công khai');

    const draftRes = await request(app.getHttpServer()).get(`/api/tours/${draft.slug}`);
    expect(draftRes.status).toBe(404);
    expect(JSON.stringify(draftRes.body)).not.toContain('Nháp bí mật');
  }, 60_000); // các PATCH trước đó kích retry cache-invalidation nền; GET công khai đo được 38–152ms
});
