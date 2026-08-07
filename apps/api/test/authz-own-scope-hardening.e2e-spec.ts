import { Controller, INestApplication, Injectable, Module, Param, Patch, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { createHash } from 'crypto';
import { AppModule } from '../src/app.module';
import { TransformInterceptor } from '../src/common/interceptors/transform.interceptor';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { RequirePermissions } from '../src/modules/authz/decorators/require-permissions.decorator';
import { AuthorizationContext } from '../src/modules/authz/decorators/authorization-context.decorator';
import { PRINCIPAL_RESOLVER } from '../src/modules/authz/resolvers/principal.resolver';
import type {
  AuthorizationContext as AuthzCtx,
  AuthorizationContextResolver,
  AuthorizationContextResolverInput,
} from '../src/modules/authz/authorization-context';

// ADR-019 M0.3 (Resource-Scoped Authorization — Own-Scope Hardening).
//
// The 3 live `.Own` handlers today (`POST /media/presign`, `POST /media`, `PATCH /users/me`) are
// all principal-only — none accepts a route `:id`, so there is no HTTP-reachable way to point one
// at "someone else's" resource. The vulnerability M0.3 closes is therefore ARCHITECTURAL, not a
// live exploit on today's routes: before M0.3, (a) `PermissionsGuard` never invoked the context
// provider for `.Own` permissions at all (identity was never checked, only the rank of the
// permission suffix), and (b) `AuthorizationBootstrapValidator` (D9) never scanned `.Own` handlers,
// so a FUTURE `.Own` route built with an explicit `:id` (the shape ADR-019 D15 warns about
// verbatim) would boot and silently trust the caller-supplied id as the owner.
//
// Per the M0.3 task's Phase 7 guidance ("do not invent an artificial exploit if the route
// structure already prevents arbitrary IDs... prove the architectural gap through... a focused
// temporary endpoint in a test module"), this suite proves the gap with two throwaway fixtures
// (`OwnFixtureModule`/`OwnMissingContextModule`, registered ONLY inside this test file, never
// mounted on the real app) alongside live coverage of the 3 real `.Own` routes.
//
// CẦN Postgres thật (migration đã chạy, seed RBAC/User/Media permissions).
describe('ADR-019 M0.3 — Own-scope hardening (live Postgres)', () => {
  let app: INestApplication;
  let ds: DataSource;
  let jwt: JwtService;
  let config: ConfigService;

  const userIds: string[] = [];
  const userRoleIds: string[] = [];

  async function createUser(label: string): Promise<{ accessToken: string; userId: string }> {
    const email = `e2e_m03_${label}_${Date.now()}_${Math.random().toString(36).slice(2)}@phuquochub.test`;
    const rows: Array<{ id: string }> = await ds.query(
      `INSERT INTO users (email, display_name) VALUES ($1, $2) RETURNING id`,
      [email, `M0.3 E2E ${label}`],
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
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    app.useGlobalInterceptors(new TransformInterceptor());
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();

    ds = app.get<DataSource>(getDataSourceToken());
    jwt = app.get(JwtService);
    config = app.get(ConfigService);
  }, 30_000);

  // Teardown hang fix (2026-08-07): dọn dẹp trong `try` — nếu một bước ném lỗi, `finally` vẫn đảm
  // bảo `app.close()` chạy (không thì Nest/TypeORM giữ handle mở, Jest treo sau khi in kết quả).
  // KHÔNG nuốt lỗi bằng `.catch()`: lỗi dọn dẹp vẫn nổi lên sau `finally`.
  afterAll(async () => {
    try {
      if (ds?.isInitialized && userIds.length) {
        if (userRoleIds.length) await ds.query(`DELETE FROM user_roles WHERE id = ANY($1)`, [userRoleIds]);
        await ds.query(`DELETE FROM media WHERE uploaded_by = ANY($1)`, [userIds]);
        await ds.query(`DELETE FROM users WHERE id = ANY($1)`, [userIds]);
      }
    } finally {
      if (app) await app.close();
    }
  }, 30_000);

  describe('Live Own routes — real users, real permissions (D16 inventory: 3 handlers)', () => {
    it('PATCH /users/me — member (User.Edit.Own) updates OWN profile -> 200, persisted to exactly that row', async () => {
      const { accessToken, userId } = await createUser('own_update_self');
      await assignRole(userId, 'member', 'global', null);

      const res = await request(app.getHttpServer())
        .patch('/api/users/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ display_name: 'M0.3 updated name' });

      expect(res.status).toBe(200);
      expect(res.body.data.id).toBe(userId);
      expect(res.body.data.display_name).toBe('M0.3 updated name');

      const rows: Array<{ display_name: string }> = await ds.query(
        `SELECT display_name FROM users WHERE id = $1`,
        [userId],
      );
      expect(rows[0].display_name).toBe('M0.3 updated name');
    });

    it('PATCH /users/me — user WITHOUT User.Edit.Own (no roles at all) -> 403, deny-by-default unchanged', async () => {
      const { accessToken } = await createUser('own_no_grant');

      const res = await request(app.getHttpServer())
        .patch('/api/users/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ display_name: 'SHOULD NOT APPLY' });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('PATCH /users/me — super_administrator (wildcard "*") still allowed, Any/wildcard fast path unaffected by M0.3', async () => {
      const { accessToken, userId } = await createUser('own_wildcard');
      await assignRole(userId, 'super_administrator', 'global', null);

      const res = await request(app.getHttpServer())
        .patch('/api/users/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ display_name: 'M0.3 wildcard update' });

      expect(res.status).toBe(200);
    });

    it('POST /media/presign then POST /media — member (Media.Upload.Own) registers media attributed to EXACTLY themselves', async () => {
      const { accessToken, userId } = await createUser('own_media_upload');
      await assignRole(userId, 'member', 'global', null);

      const content = Buffer.from(`m0.3-fixture-${Date.now()}-${Math.random()}`);
      const checksum = createHash('sha256').update(content).digest('hex');

      const presignRes = await request(app.getHttpServer())
        .post('/api/media/presign')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ content_type: 'image/jpeg', size: content.length, checksum_sha256: checksum });
      expect(presignRes.status).toBe(201);

      const { key, upload_url: uploadUrl } = presignRes.body.data;
      const putRes = await fetch(uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': 'image/jpeg' },
        body: content as unknown as BodyInit,
      });
      expect(putRes.status).toBe(200);

      const registerRes = await request(app.getHttpServer())
        .post('/api/media')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ key });
      expect(registerRes.status).toBe(201);

      const rows: Array<{ uploaded_by: string }> = await ds.query(
        `SELECT uploaded_by FROM media WHERE object_key = $1`,
        [key],
      );
      expect(rows[0].uploaded_by).toBe(userId);
    }, 20_000);

    it('POST /media/presign — user WITHOUT Media.Upload.Own -> 403', async () => {
      const { accessToken } = await createUser('own_media_no_grant');

      const res = await request(app.getHttpServer())
        .post('/api/media/presign')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ content_type: 'image/jpeg', size: 100, checksum_sha256: 'a'.repeat(64) });

      expect(res.status).toBe(403);
    });
  });

  describe('Architectural gap proof — temporary fixture endpoint with explicit :id (Phase 7 methodology)', () => {
    // Mô phỏng hình dạng route Own MỚI mà ADR-019 D15 cảnh báo nguyên văn: "route Own đầu tiên
    // được xây kèm tham số :id tường minh sẽ mở lại đúng lỗi này dưới một nhãn scope khác" — resolver
    // đọc ownerId trực tiếp từ route param (không dùng PRINCIPAL_RESOLVER), CHÍNH XÁC như một route
    // Own thật trong tương lai có thể làm khi tài nguyên KHÔNG phải chính người gọi (vd một "draft"
    // sở hữu bởi user khác được truyền qua :id). Module này KHÔNG mount vào app thật — chỉ compile
    // cùng AppModule trong phạm vi test này để chứng minh D6/D2 (matchesScopedContext) tự nó đã chặn
    // giả mạo danh tính, không phụ thuộc PRINCIPAL_RESOLVER cụ thể.
    const FIXTURE_OWN_RESOLVER = Symbol('M03_FIXTURE_OWN_RESOLVER');

    @Injectable()
    class FixtureOwnResolver implements AuthorizationContextResolver {
      async resolve(input: AuthorizationContextResolverInput): Promise<AuthzCtx | null> {
        return { resourceType: 'fixture-own', resourceId: input.resourceId, businessId: null, ownerId: input.resourceId };
      }
    }

    @Controller('__m03-fixture-own')
    class OwnFixtureController {
      @Patch(':id')
      @RequirePermissions('User.Edit.Own')
      @AuthorizationContext({
        resourceType: 'fixture-own',
        resource: { from: 'param', name: 'id' },
        resolver: FIXTURE_OWN_RESOLVER,
      })
      act(@Param('id') id: string) {
        return { id };
      }
    }

    @Module({
      controllers: [OwnFixtureController],
      providers: [{ provide: FIXTURE_OWN_RESOLVER, useClass: FixtureOwnResolver }],
    })
    class OwnFixtureModule {}

    let fixtureApp: INestApplication;
    let fixtureDs: DataSource;
    const fixtureUserIds: string[] = [];

    beforeAll(async () => {
      const moduleRef = await Test.createTestingModule({ imports: [AppModule, OwnFixtureModule] }).compile();
      fixtureApp = moduleRef.createNestApplication();
      fixtureApp.setGlobalPrefix('api');
      fixtureApp.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
      fixtureApp.useGlobalInterceptors(new TransformInterceptor());
      fixtureApp.useGlobalFilters(new AllExceptionsFilter());
      await fixtureApp.init();
      fixtureDs = fixtureApp.get<DataSource>(getDataSourceToken());
    }, 30_000);

    afterAll(async () => {
      if (fixtureDs?.isInitialized && fixtureUserIds.length) {
        await fixtureDs.query(`DELETE FROM users WHERE id = ANY($1)`, [fixtureUserIds]);
      }
      if (fixtureApp) await fixtureApp.close();
    }, 30_000);

    async function createFixtureUser(label: string): Promise<{ accessToken: string; userId: string }> {
      const email = `e2e_m03_fx_${label}_${Date.now()}_${Math.random().toString(36).slice(2)}@phuquochub.test`;
      const rows: Array<{ id: string }> = await fixtureDs.query(
        `INSERT INTO users (email, display_name) VALUES ($1, $2) RETURNING id`,
        [email, `M0.3 Fixture ${label}`],
      );
      const userId = rows[0].id;
      fixtureUserIds.push(userId);
      const fjwt = fixtureApp.get(JwtService);
      const fconfig = fixtureApp.get(ConfigService);
      const accessTtl = fconfig.get<number>('jwt.accessTtl') ?? 900;
      const accessToken = await fjwt.signAsync(
        { sub: userId, email, type: 'access' },
        { secret: fconfig.get<string>('jwt.accessSecret'), expiresIn: accessTtl },
      );
      return { accessToken, userId };
    }

    async function assignFixtureRole(userId: string, roleCode: string): Promise<void> {
      const roleRows: Array<{ id: string }> = await fixtureDs.query(`SELECT id FROM roles WHERE code = $1`, [roleCode]);
      await fixtureDs.query(
        `INSERT INTO user_roles (user_id, role_id, scope_type, business_id) VALUES ($1, $2, 'global', NULL)`,
        [userId, roleRows[0].id],
      );
    }

    it('acting on OWN id -> 200 (ownerId === userId)', async () => {
      const { accessToken, userId } = await createFixtureUser('self');
      await assignFixtureRole(userId, 'member');

      const res = await request(fixtureApp.getHttpServer())
        .patch(`/api/__m03-fixture-own/${userId}`)
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.status).toBe(200);
    });

    it('acting on ANOTHER user\'s id -> 403 (M0.3 closes exactly the gap D15 describes: forged/alternate owner identity denied)', async () => {
      const { accessToken, userId } = await createFixtureUser('attacker');
      await assignFixtureRole(userId, 'member');
      const { userId: victimId } = await createFixtureUser('victim');

      const res = await request(fixtureApp.getHttpServer())
        .patch(`/api/__m03-fixture-own/${victimId}`)
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });
  });

  describe('Bootstrap validation — D9 now covers .Own (M0.2 staged exception fully removed)', () => {
    @Controller('__m03-fixture-missing-context')
    class OwnMissingContextController {
      @Patch(':id')
      @RequirePermissions('User.Edit.Own')
      act(@Param('id') id: string) {
        return { id };
      }
    }

    @Module({ controllers: [OwnMissingContextController] })
    class OwnMissingContextModule {}

    it('a .Own handler with NO @AuthorizationContext fails app.init() (D9, real NestFactory-driven bootstrap, not just the isolated validator unit test)', async () => {
      const moduleRef = await Test.createTestingModule({
        imports: [AppModule, OwnMissingContextModule],
      }).compile();
      const badApp = moduleRef.createNestApplication();

      await expect(badApp.init()).rejects.toThrow(/OwnMissingContextController.*act.*User\.Edit\.Own/s);
      await badApp.close();
    }, 30_000);
  });
});
