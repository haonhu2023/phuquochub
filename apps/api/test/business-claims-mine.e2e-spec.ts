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

// GET /business-claims/mine (live Postgres) — file RIÊNG khỏi business-claims.e2e-spec.ts để không
// tranh phần ngân sách `@Throttle 10/60s` của POST /business-claims đã dùng gần hết ở đó (9/10).
// Trọng tâm: KHÔNG rò rỉ claim của người khác (IDOR) + response KHÔNG có evidence/reviewer_id/
// decision_note — hai thứ business-claims.service.spec.ts (unit, mock) không thể chứng minh trên
// dữ liệu Postgres thật.
describe('GET /business-claims/mine (live Postgres)', () => {
  let app: INestApplication;
  let ds: DataSource;
  let jwt: JwtService;
  let config: ConfigService;

  const userIds: string[] = [];
  const placeIds: string[] = [];
  let placeId: string;

  async function createUser(label: string): Promise<{ accessToken: string; userId: string }> {
    const email = `e2e_biz_mine_${label}_${Date.now()}_${Math.random().toString(36).slice(2)}@phuquochub.test`;
    const rows: Array<{ id: string }> = await ds.query(
      `INSERT INTO users (email, display_name) VALUES ($1, $2) RETURNING id`,
      [email, `Business Mine E2E ${label}`],
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

  async function assignRole(userId: string, roleCode: string): Promise<void> {
    const roleRows: Array<{ id: string }> = await ds.query(`SELECT id FROM roles WHERE code = $1`, [roleCode]);
    if (!roleRows[0]) throw new Error(`role not seeded: ${roleCode}`);
    await ds.query(`INSERT INTO user_roles (user_id, role_id, scope_type, business_id) VALUES ($1, $2, 'global', NULL)`, [
      userId,
      roleRows[0].id,
    ]);
  }

  async function createMember(label: string) {
    const u = await createUser(label);
    await assignRole(u.userId, 'member');
    return u;
  }

  async function createModerator(label: string) {
    const u = await createUser(label);
    await assignRole(u.userId, 'moderator');
    return u;
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

    const [{ id: categoryId }] = await ds.query(`SELECT id FROM categories LIMIT 1`);
    const rows: Array<{ id: string }> = await ds.query(
      `INSERT INTO places (name, slug, category_id, location, status)
       VALUES ($1, $2, $3, ST_SetSRID(ST_MakePoint(103.9, 10.2), 4326)::geography, 'published')
       RETURNING id`,
      ['E2E Business Claim Mine Place', `e2e-claim-mine-place-${Date.now()}`, categoryId],
    );
    placeId = rows[0].id;
    placeIds.push(placeId);
  }, 60_000);

  afterAll(async () => {
    try {
      if (ds?.isInitialized) {
        if (userIds.length) await ds.query(`DELETE FROM user_roles WHERE user_id = ANY($1)`, [userIds]);
        if (placeIds.length) await ds.query(`DELETE FROM places WHERE id = ANY($1)`, [placeIds]);
        if (userIds.length) {
          await ds.query(`DELETE FROM audit_logs WHERE actor_id = ANY($1) AND event LIKE 'business.claim_%'`, [
            userIds,
          ]);
        }
        if (userIds.length) await ds.query(`DELETE FROM users WHERE id = ANY($1)`, [userIds]);
      }
    } finally {
      if (app) await app.close();
    }
  }, 30_000);

  it('anonymous -> 401', async () => {
    const res = await request(app.getHttpServer()).get('/api/business-claims/mine');
    expect(res.status).toBe(401);
  });

  it('chưa có claim nào -> 200 mảng rỗng', async () => {
    const { accessToken } = await createMember('empty');
    const res = await request(app.getHttpServer())
      .get('/api/business-claims/mine')
      .set('Authorization', `Bearer ${accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
  });

  it('CHỈ thấy claim của chính mình — claim của người khác trên CÙNG place KHÔNG xuất hiện (IDOR)', async () => {
    const { accessToken: aToken, userId: aId } = await createMember('isolation_a');
    const { accessToken: bToken, userId: bId } = await createMember('isolation_b');

    // Hai claim pending khác requester trên CÙNG một place — hợp lệ vì uq_claim_pending là
    // (place_id, requester_id), không phải (place_id) một mình.
    const [claimA]: Array<{ id: string }> = await ds.query(
      `INSERT INTO business_claims (place_id, requester_id, evidence, status)
       VALUES ($1, $2, $3, 'pending') RETURNING id`,
      [placeId, aId, JSON.stringify([{ type: 'business_license', reference: 'ref-a' }])],
    );
    await ds.query(
      `INSERT INTO business_claims (place_id, requester_id, evidence, status) VALUES ($1, $2, $3, 'pending')`,
      [placeId, bId, JSON.stringify([{ type: 'business_license', reference: 'ref-b' }])],
    );

    const resA = await request(app.getHttpServer())
      .get('/api/business-claims/mine')
      .set('Authorization', `Bearer ${aToken}`);
    expect(resA.status).toBe(200);
    expect(resA.body.data).toHaveLength(1);
    expect(resA.body.data[0].id).toBe(claimA.id);
    expect(resA.body.data[0].place_id).toBe(placeId);
    expect(resA.body.data[0].place_name).toBe('E2E Business Claim Mine Place');

    const resB = await request(app.getHttpServer())
      .get('/api/business-claims/mine')
      .set('Authorization', `Bearer ${bToken}`);
    expect(resB.status).toBe(200);
    expect(resB.body.data).toHaveLength(1);
    expect(resB.body.data[0].id).not.toBe(claimA.id);

    // Không có cách nào (id/query/path) để A đọc được claim của B qua route này — chỉ một mình
    // requesterId từ JWT quyết định tập kết quả trả về, xác nhận bằng response TOÀN VĂN của A.
    expect(JSON.stringify(resA.body.data)).not.toContain(resB.body.data[0].id);
  });

  it('response KHÔNG có evidence/reviewer_id/decision_note dưới bất kỳ hình thức nào (kể cả sau khi reject)', async () => {
    const { accessToken: reqToken } = await createMember('safe_fields_req');
    const { accessToken: modToken } = await createModerator('safe_fields_mod');

    const submit = await request(app.getHttpServer())
      .post('/api/business-claims')
      .set('Authorization', `Bearer ${reqToken}`)
      .send({ place_id: placeId, evidence: [{ type: 'business_license', reference: 'secret-license-number' }] });
    expect(submit.status).toBe(201);
    const claimId = submit.body.data.id;

    const decide = await request(app.getHttpServer())
      .post(`/api/business-claims/${claimId}/decide`)
      .set('Authorization', `Bearer ${modToken}`)
      .send({ decision: 'reject', reason_code: 'insufficient_evidence', decision_note: 'ghi chú nội bộ moderator' });
    expect(decide.status).toBe(200);

    const mine = await request(app.getHttpServer())
      .get('/api/business-claims/mine')
      .set('Authorization', `Bearer ${reqToken}`);
    expect(mine.status).toBe(200);
    const own = mine.body.data.find((c: { id: string }) => c.id === claimId);
    expect(own).toBeDefined();
    expect(own.status).toBe('rejected');
    expect(own.reason_code).toBe('insufficient_evidence');
    expect(own).not.toHaveProperty('evidence');
    expect(own).not.toHaveProperty('reviewer_id');
    expect(own).not.toHaveProperty('decision_note');
    expect(own).not.toHaveProperty('requester_id');
    expect(JSON.stringify(mine.body)).not.toContain('secret-license-number');
    expect(JSON.stringify(mine.body)).not.toContain('ghi chú nội bộ moderator');
  });

  it('sắp xếp mới nhất trước (createdAt DESC)', async () => {
    const { accessToken, userId } = await createMember('order');
    const [older]: Array<{ id: string }> = await ds.query(
      `INSERT INTO business_claims (place_id, requester_id, evidence, status, created_at)
       VALUES ($1, $2, $3, 'withdrawn', now() - interval '2 days') RETURNING id`,
      [placeId, userId, JSON.stringify([{ type: 'other', reference: 'r1' }])],
    );
    const [newer]: Array<{ id: string }> = await ds.query(
      `INSERT INTO business_claims (place_id, requester_id, evidence, status, created_at)
       VALUES ($1, $2, $3, 'pending', now()) RETURNING id`,
      [placeId, userId, JSON.stringify([{ type: 'other', reference: 'r2' }])],
    );

    const res = await request(app.getHttpServer())
      .get('/api/business-claims/mine')
      .set('Authorization', `Bearer ${accessToken}`);
    expect(res.status).toBe(200);
    const ids = res.body.data.map((c: { id: string }) => c.id);
    expect(ids.indexOf(newer.id)).toBeLessThan(ids.indexOf(older.id));
  });
});
