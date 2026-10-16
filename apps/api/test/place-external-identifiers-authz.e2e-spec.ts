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

// GET/PUT /places/:id/external-identifiers... over real HTTP, live Postgres, real PermissionsGuard
// path — cùng lý do places-preview-authz.e2e-spec.ts tồn tại: metadata-lock spec
// (place-external-identifiers.controller.spec.ts) chỉ chứng minh route KHAI BÁO đúng permission,
// không chứng minh guard THỰC SỰ chặn một actor quản lý place A ghi định danh của place B.
describe('Place external identifiers over HTTP: managed scope — live Postgres', () => {
  let app: INestApplication;
  let ds: DataSource;
  let jwt: JwtService;
  let config: ConfigService;
  let categoryId: string;

  async function createUser(label: string): Promise<{ accessToken: string; userId: string }> {
    const email = `e2e_extid_${label}_${Date.now()}_${Math.random().toString(36).slice(2)}@phuquochub.test`;
    const rows: Array<{ id: string }> = await ds.query(
      `INSERT INTO users (email, display_name) VALUES ($1, $2) RETURNING id`,
      [email, `ExtId E2E ${label}`],
    );
    const userId = rows[0].id;
    const accessToken = await jwt.signAsync(
      { sub: userId, email, type: 'access' },
      { secret: config.get<string>('jwt.accessSecret'), expiresIn: config.get<number>('jwt.accessTtl') ?? 900 },
    );
    return { accessToken, userId };
  }

  async function mkPlace(label: string): Promise<{ id: string }> {
    const slug = `e2e-extid-${label}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const [row]: Array<{ id: string }> = await ds.query(
      `INSERT INTO places (name, slug, category_id, location, status, verification_status)
       VALUES ($1, $2, $3, ST_SetSRID(ST_MakePoint(104.03, 10.05), 4326)::geography, 'draft', 'pending')
       RETURNING id`,
      [`E2E extid ${label}`, slug, categoryId],
    );
    return { id: row.id };
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
    categoryId = cat.id;
  }, 120_000);

  afterAll(async () => {
    await app?.close();
  });

  it('manager của place A: ghi định danh A → 200; ghi định danh B (ngoài phạm vi quản lý) → 403', async () => {
    const a = await mkPlace('scope-a');
    const b = await mkPlace('scope-b');
    const mgr = await createUser('mgr-a');
    await grantManaged(mgr.userId, a.id);

    const putA = await request(app.getHttpServer())
      .put(`/api/places/${a.id}/external-identifiers/google-places`)
      .set('Authorization', `Bearer ${mgr.accessToken}`)
      .send({ external_id: 'ChIJ-scope-a' });
    expect(putA.status).toBe(200);
    expect(putA.body.data.place_id).toBe(a.id);
    expect(putA.body.data.external_id).toBe('ChIJ-scope-a');
    expect(putA.body.data.verified_at).toBeNull(); // KHÔNG tự đánh dấu verified chỉ vì vừa nhập

    const putB = await request(app.getHttpServer())
      .put(`/api/places/${b.id}/external-identifiers/google-places`)
      .set('Authorization', `Bearer ${mgr.accessToken}`)
      .send({ external_id: 'ChIJ-scope-b' });
    expect(putB.status).toBe(403);

    const listA = await request(app.getHttpServer())
      .get(`/api/places/${a.id}/external-identifiers`)
      .set('Authorization', `Bearer ${mgr.accessToken}`);
    expect(listA.status).toBe(200);
    expect(listA.body.data).toHaveLength(1);

    const listB = await request(app.getHttpServer())
      .get(`/api/places/${b.id}/external-identifiers`)
      .set('Authorization', `Bearer ${mgr.accessToken}`);
    expect(listB.status).toBe(403);
  });

  it('không có grant nào trên place: ghi/đọc định danh → 403', async () => {
    const a = await mkPlace('nogrant');
    const outsider = await createUser('outsider');

    const put = await request(app.getHttpServer())
      .put(`/api/places/${a.id}/external-identifiers/google-places`)
      .set('Authorization', `Bearer ${outsider.accessToken}`)
      .send({ external_id: 'ChIJ-nogrant' });
    expect(put.status).toBe(403);
  });

  it('không có token: 401 (route KHÔNG công khai)', async () => {
    const a = await mkPlace('noauth');

    const res = await request(app.getHttpServer())
      .put(`/api/places/${a.id}/external-identifiers/google-places`)
      .send({ external_id: 'ChIJ-noauth' });
    expect(res.status).toBe(401);
  });

  it('lưu lặp cùng giá trị → idempotent (không tạo hàng thứ hai); sửa sang giá trị khác → thay tại chỗ, không nhân đôi', async () => {
    const a = await mkPlace('idempotent');
    const mgr = await createUser('mgr-idempotent');
    await grantManaged(mgr.userId, a.id);

    const first = await request(app.getHttpServer())
      .put(`/api/places/${a.id}/external-identifiers/google-places`)
      .set('Authorization', `Bearer ${mgr.accessToken}`)
      .send({ external_id: 'ChIJ-v1' });
    expect(first.status).toBe(200);

    const again = await request(app.getHttpServer())
      .put(`/api/places/${a.id}/external-identifiers/google-places`)
      .set('Authorization', `Bearer ${mgr.accessToken}`)
      .send({ external_id: 'ChIJ-v1' });
    expect(again.status).toBe(200);
    expect(again.body.data.id).toBe(first.body.data.id);

    const corrected = await request(app.getHttpServer())
      .put(`/api/places/${a.id}/external-identifiers/google-places`)
      .set('Authorization', `Bearer ${mgr.accessToken}`)
      .send({ external_id: 'ChIJ-v2-corrected' });
    expect(corrected.status).toBe(200);
    expect(corrected.body.data.id).toBe(first.body.data.id); // CÙNG hàng, không phải hàng mới
    expect(corrected.body.data.external_id).toBe('ChIJ-v2-corrected');

    const list = await request(app.getHttpServer())
      .get(`/api/places/${a.id}/external-identifiers`)
      .set('Authorization', `Bearer ${mgr.accessToken}`);
    expect(list.body.data).toHaveLength(1); // vẫn đúng 1 hàng, không nhân đôi
  });

  it('nhập ID đã thuộc place khác → 400, không ghi gì (không áp định danh của một địa điểm cho địa điểm khác)', async () => {
    const a = await mkPlace('conflict-a');
    const b = await mkPlace('conflict-b');
    const mgrA = await createUser('mgr-conflict-a');
    const mgrB = await createUser('mgr-conflict-b');
    await grantManaged(mgrA.userId, a.id);
    await grantManaged(mgrB.userId, b.id);

    await request(app.getHttpServer())
      .put(`/api/places/${a.id}/external-identifiers/google-places`)
      .set('Authorization', `Bearer ${mgrA.accessToken}`)
      .send({ external_id: 'ChIJ-claimed-by-a' });

    const res = await request(app.getHttpServer())
      .put(`/api/places/${b.id}/external-identifiers/google-places`)
      .set('Authorization', `Bearer ${mgrB.accessToken}`)
      .send({ external_id: 'ChIJ-claimed-by-a' });
    expect(res.status).toBe(400);

    const listB = await request(app.getHttpServer())
      .get(`/api/places/${b.id}/external-identifiers`)
      .set('Authorization', `Bearer ${mgrB.accessToken}`);
    expect(listB.body.data).toHaveLength(0);
  });

  it('định danh hợp lệ đi qua API tới GET /places/:slug — chỉ khi đủ điều kiện (verified); record chưa có ID vẫn hoạt động', async () => {
    const a = await mkPlace('public-readback');
    const mgr = await createUser('mgr-public-readback');
    await grantManaged(mgr.userId, a.id);
    const [{ slug }] = await ds.query(`SELECT slug FROM places WHERE id = $1`, [a.id]);
    await ds.query(`UPDATE places SET status = 'published' WHERE id = $1`, [a.id]);

    // Chưa nhập ID nào — record vẫn hoạt động, google_place_id = null.
    const before = await request(app.getHttpServer()).get(`/api/places/${slug}`);
    expect(before.status).toBe(200);
    expect(before.body.data.google_place_id).toBeNull();

    // Nhập ID qua dashboard — verifiedAt vẫn null (chưa ai xác minh) → PUBLIC VẪN null, giữ fallback.
    await request(app.getHttpServer())
      .put(`/api/places/${a.id}/external-identifiers/google-places`)
      .set('Authorization', `Bearer ${mgr.accessToken}`)
      .send({ external_id: 'ChIJ-unverified' });
    const afterUnverified = await request(app.getHttpServer()).get(`/api/places/${slug}`);
    expect(afterUnverified.body.data.google_place_id).toBeNull();

    // Mô phỏng một identifier ĐÃ xác minh (cơ chế xác minh thật chưa tồn tại trong gói này — xem
    // PlaceExternalIdentifiersService's ghi chú — ghi thẳng verified_at bằng SQL CHỈ để chứng minh
    // đường ĐỌC hoạt động đúng khi điều kiện đã thoả, không phải một API thật).
    await ds.query(`UPDATE place_external_identifiers SET verified_at = now() WHERE place_id = $1`, [a.id]);
    const afterVerified = await request(app.getHttpServer()).get(`/api/places/${slug}`);
    expect(afterVerified.body.data.google_place_id).toBe('ChIJ-unverified');
  });
});
