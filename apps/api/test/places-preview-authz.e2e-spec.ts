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

// GET /places/:id/preview over real HTTP, live Postgres, real PermissionsGuard path.
//
// Phát hiện 15/10/2026: `preview` chỉ được khoá bằng bảng metadata decorator
// (places.controller.spec.ts) — đó chứng minh ROUTE KHAI BÁO đúng permission, KHÔNG chứng minh
// PermissionsGuard/AuthorizationContext THỰC SỰ chặn một actor quản lý place A đọc preview của
// place B ngoài phạm vi quản lý. Test này đóng đúng khoảng trống đó: gọi route thật, qua guard
// thật, trên DB thật.
describe('Places preview over HTTP: managed scope — live Postgres', () => {
  let app: INestApplication;
  let ds: DataSource;
  let jwt: JwtService;
  let config: ConfigService;
  let categoryId: string;

  async function createUser(label: string): Promise<{ accessToken: string; userId: string }> {
    const email = `e2e_preview_${label}_${Date.now()}_${Math.random().toString(36).slice(2)}@phuquochub.test`;
    const rows: Array<{ id: string }> = await ds.query(
      `INSERT INTO users (email, display_name) VALUES ($1, $2) RETURNING id`,
      [email, `Preview E2E ${label}`],
    );
    const userId = rows[0].id;
    const accessToken = await jwt.signAsync(
      { sub: userId, email, type: 'access' },
      { secret: config.get<string>('jwt.accessSecret'), expiresIn: config.get<number>('jwt.accessTtl') ?? 900 },
    );
    return { accessToken, userId };
  }

  async function mkPlace(label: string, verificationStatus: 'pending' | 'trusted' = 'pending'): Promise<{ id: string }> {
    const slug = `e2e-preview-${label}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const [row]: Array<{ id: string }> = await ds.query(
      `INSERT INTO places (name, slug, category_id, location, status, verification_status)
       VALUES ($1, $2, $3, ST_SetSRID(ST_MakePoint(104.03, 10.05), 4326)::geography, 'draft', $4)
       RETURNING id`,
      [`E2E preview ${label}`, slug, categoryId, verificationStatus],
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

  it('manager của place A: preview A → 200; preview B (ngoài phạm vi quản lý) → 403', async () => {
    const a = await mkPlace('scope-a');
    const b = await mkPlace('scope-b');
    const mgr = await createUser('mgr-a');
    await grantManaged(mgr.userId, a.id);

    const previewA = await request(app.getHttpServer())
      .get(`/api/places/${a.id}/preview`)
      .set('Authorization', `Bearer ${mgr.accessToken}`);
    expect(previewA.status).toBe(200);
    expect(previewA.body.data.id).toBe(a.id);

    const previewB = await request(app.getHttpServer())
      .get(`/api/places/${b.id}/preview`)
      .set('Authorization', `Bearer ${mgr.accessToken}`);
    expect(previewB.status).toBe(403);
  });

  it('không có grant nào trên place: preview → 403', async () => {
    const a = await mkPlace('nogrant');
    const outsider = await createUser('outsider');

    const previewA = await request(app.getHttpServer())
      .get(`/api/places/${a.id}/preview`)
      .set('Authorization', `Bearer ${outsider.accessToken}`);
    expect(previewA.status).toBe(403);
  });

  it('không có token: preview → 401 (route KHÔNG công khai)', async () => {
    const a = await mkPlace('noauth');

    const previewA = await request(app.getHttpServer()).get(`/api/places/${a.id}/preview`);
    expect(previewA.status).toBe(401);
  });
});
