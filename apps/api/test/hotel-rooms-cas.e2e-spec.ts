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

// Hotel rooms over real HTTP, live Postgres: CAS on places.content_version for the replace-all rooms write.
// - managed holder of hotel A writes A's rooms; on hotel B gets 403 and B's rooms are unchanged;
// - a write without expected_content_version is 400 (field required);
// - a stale version is 409 and writes NO room (the existing rooms survive intact);
// - success returns the rooms AND the new content_version, and the next write with that version succeeds;
// - a room with no price stays null in the public response (never 0).
describe('Hotel rooms over HTTP: managed scope, CAS, no silent overwrite — live Postgres', () => {
  let app: INestApplication;
  let ds: DataSource;
  let jwt: JwtService;
  let config: ConfigService;
  let hotelCategoryId: string;

  async function createUser(label: string): Promise<{ accessToken: string; userId: string }> {
    const email = `e2e_hotel_rooms_${label}_${Date.now()}_${Math.random().toString(36).slice(2)}@phuquochub.test`;
    const rows: Array<{ id: string }> = await ds.query(`INSERT INTO users (email, display_name) VALUES ($1, $2) RETURNING id`, [
      email,
      `Hotel rooms E2E ${label}`,
    ]);
    const userId = rows[0].id;
    const accessToken = await jwt.signAsync(
      { sub: userId, email, type: 'access' },
      { secret: config.get<string>('jwt.accessSecret'), expiresIn: config.get<number>('jwt.accessTtl') ?? 900 },
    );
    return { accessToken, userId };
  }

  async function mkHotel(label: string, status: 'published' | 'draft'): Promise<{ id: string; slug: string }> {
    const slug = `e2e-hotel-rooms-${label}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const [row]: Array<{ id: string }> = await ds.query(
      `INSERT INTO places (name, slug, category_id, location, status)
       VALUES ($1, $2, $3, ST_SetSRID(ST_MakePoint(104.0, 10.0), 4326)::geography, $4) RETURNING id`,
      [`E2E hotel ${label}`, slug, hotelCategoryId, status],
    );
    await ds.query(`INSERT INTO place_hotel_details (place_id, hotel_type) VALUES ($1, 'hotel')`, [row.id]);
    return { id: row.id, slug };
  }

  async function grantManaged(userId: string, placeId: string): Promise<void> {
    const [{ id: roleId }] = await ds.query(`SELECT id FROM roles WHERE code = 'business_manager'`);
    await ds.query(`INSERT INTO user_roles (user_id, role_id, scope_type, business_id) VALUES ($1,$2,'managed',$3)`, [userId, roleId, placeId]);
    await ds.query(`INSERT INTO business_members (place_id, user_id, role, granted_by) VALUES ($1,$2,'manager',$2)`, [placeId, userId]);
  }

  async function version(placeId: string): Promise<number> {
    const [p]: Array<{ content_version: number }> = await ds.query(`SELECT content_version FROM places WHERE id = $1`, [placeId]);
    return p.content_version;
  }

  async function roomNames(placeId: string): Promise<string[]> {
    const rows: Array<{ name: string }> = await ds.query(`SELECT name FROM hotel_room_types WHERE place_id = $1 ORDER BY sort_order`, [placeId]);
    return rows.map((r) => r.name);
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
    const [cat] = await ds.query(`SELECT id FROM categories WHERE slug = 'hotel' LIMIT 1`);
    hotelCategoryId = cat.id;
  }, 120_000);

  afterAll(async () => {
    await app?.close();
  }, 60_000);

  it('manager của A ghi được rooms của A; B → 403 và rooms của B không đổi', async () => {
    const a = await mkHotel('scope-a', 'published');
    const b = await mkHotel('scope-b', 'published');
    const mgr = await createUser('mgr-a');
    await grantManaged(mgr.userId, a.id);
    const auth = { Authorization: `Bearer ${mgr.accessToken}` };
    await request(app.getHttpServer())
      .patch(`/api/hotels/${b.id}/rooms`)
      .set('Authorization', `Bearer ${(await createUser('seed-b')).accessToken}`)
      .send({ expected_content_version: await version(b.id), rooms: [{ name: 'B gốc' }] });

    const writeA = await request(app.getHttpServer())
      .patch(`/api/hotels/${a.id}/rooms`)
      .set(auth)
      .send({ expected_content_version: await version(a.id), rooms: [{ name: 'A phòng 1', capacity: 2 }] });
    expect(writeA.status).toBe(200);

    const vB = await version(b.id);
    const names = await roomNames(b.id);
    const writeB = await request(app.getHttpServer())
      .patch(`/api/hotels/${b.id}/rooms`)
      .set(auth)
      .send({ expected_content_version: vB, rooms: [{ name: 'Ghi lén' }] });
    expect(writeB.status).toBe(403);
    expect(await roomNames(b.id)).toEqual(names);
    expect(await version(b.id)).toBe(vB);
  });

  it('thiếu expected_content_version → 400, không ghi phòng nào', async () => {
    const a = await mkHotel('no-version', 'published');
    const mgr = await createUser('mgr-no-version');
    await grantManaged(mgr.userId, a.id);
    await request(app.getHttpServer())
      .patch(`/api/hotels/${a.id}/rooms`)
      .set('Authorization', `Bearer ${mgr.accessToken}`)
      .send({ expected_content_version: await version(a.id), rooms: [{ name: 'Gốc' }] });
    const before = await roomNames(a.id);
    const res = await request(app.getHttpServer())
      .patch(`/api/hotels/${a.id}/rooms`)
      .set('Authorization', `Bearer ${mgr.accessToken}`)
      .send({ rooms: [{ name: 'Không có version' }] });
    expect(res.status).toBe(400);
    expect(await roomNames(a.id)).toEqual(before);
  });

  it('stale version → 409, KHÔNG ghi phòng, phòng hiện có còn nguyên; thành công trả rooms + version mới; lần kế dùng version đó → 200', async () => {
    const a = await mkHotel('cas', 'published');
    const mgr = await createUser('mgr-cas');
    await grantManaged(mgr.userId, a.id);
    const auth = { Authorization: `Bearer ${mgr.accessToken}` };
    const v0 = await version(a.id);

    const first = await request(app.getHttpServer())
      .patch(`/api/hotels/${a.id}/rooms`)
      .set(auth)
      .send({ expected_content_version: v0, rooms: [{ name: 'Bản một', capacity: 2 }] });
    expect(first.status).toBe(200);
    expect(first.body.data.content_version).toBe(v0 + 1);
    expect(first.body.data.rooms.map((r: { name: string }) => r.name)).toEqual(['Bản một']);

    const stale = await request(app.getHttpServer())
      .patch(`/api/hotels/${a.id}/rooms`)
      .set(auth)
      .send({ expected_content_version: v0, rooms: [{ name: 'Ghi đè cũ' }] });
    expect(stale.status).toBe(409);
    expect(await roomNames(a.id)).toEqual(['Bản một']);
    expect(await version(a.id)).toBe(v0 + 1);

    const next = await request(app.getHttpServer())
      .patch(`/api/hotels/${a.id}/rooms`)
      .set(auth)
      .send({ expected_content_version: first.body.data.content_version, rooms: [{ name: 'Bản hai' }] });
    expect(next.status).toBe(200);
    expect(next.body.data.content_version).toBe(v0 + 2);
  });

  it('phòng không có giá → public trả price_ref null (không thành 0)', async () => {
    const pub = await mkHotel('public-price', 'published');
    const mgr = await createUser('mgr-price');
    await grantManaged(mgr.userId, pub.id);
    await request(app.getHttpServer())
      .patch(`/api/hotels/${pub.id}/rooms`)
      .set('Authorization', `Bearer ${mgr.accessToken}`)
      .send({ expected_content_version: await version(pub.id), rooms: [{ name: 'Không giá', capacity: 2 }] });
    const res = await request(app.getHttpServer()).get(`/api/hotels/${pub.slug}`);
    expect(res.status).toBe(200);
    const rooms = res.body.data.rooms as Array<{ price_ref: unknown }>;
    expect(rooms.map((r) => r.price_ref)).toEqual([null]);
  });
});
