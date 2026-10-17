import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { TransformInterceptor } from '../src/common/interceptors/transform.interceptor';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';

// Gói B (17/10/2026) — owner xác nhận "hàng chờ duyệt" (GET .../pending, status=pending CỨNG)
// KHÔNG phải màn hình quản lý tổng thể: không có cách nào trước đây để admin tìm tin đã
// published/closed/rejected/draft của NGƯỜI KHÁC, hay lọc theo người đăng. File này kiểm ĐÚNG hai
// điều owner yêu cầu, bằng request thật qua app (không chỉ unit mock):
//   1. Quyền chặn ở SERVER (không chỉ ẩn nút phía web) — thường (không quyền) → 403, có
//      JobListing.Moderate/RealEstateListing.Moderate → 200.
//   2. Endpoint `admin` thật trả về MỌI status (không chỉ pending), kèm danh tính người đăng đọc
//      được, và lọc đúng theo status/created_by — khác hẳn `pending` (xem *.repository.ts).
describe('Listings admin "quản lý tất cả tin" (e2e)', () => {
  let app: INestApplication;
  let ds: DataSource;
  let memberToken: string;
  let memberUserId: string;
  let moderatorToken: string;
  let moderatorUserId: string;

  const jobIds: string[] = [];
  const reIds: string[] = [];
  const userRoleIds: string[] = [];
  const posterUserIds: string[] = [];

  const memberEmail = `e2e_ladmin_member_${Date.now()}@phuquochub.test`;
  const moderatorEmail = `e2e_ladmin_moderator_${Date.now()}@phuquochub.test`;
  const password = 'password123';

  let posterA: string;
  let posterB: string;

  async function createPoster(label: string): Promise<string> {
    const email = `e2e_ladmin_poster_${label}_${Date.now()}_${Math.random().toString(36).slice(2)}@phuquochub.test`;
    const rows: Array<{ id: string }> = await ds.query(
      `INSERT INTO users (email, display_name) VALUES ($1, $2) RETURNING id`,
      [email, `Poster ${label}`],
    );
    posterUserIds.push(rows[0].id);
    return rows[0].id;
  }

  async function mkJob(status: string, createdBy: string): Promise<string> {
    const rows: Array<{ id: string }> = await ds.query(
      `INSERT INTO job_listings
         (created_by, employer_name, title, job_category, work_location, employment_type,
          contact_method, contact_value, status, published_at)
       VALUES ($1,'E2E Admin Co','E2E Admin Job','F&B','An Thoi','full_time','phone','0900000000',$2::job_listing_status,
         CASE WHEN $2 IN ('published','closed') THEN now() ELSE NULL END)
       RETURNING id`,
      [createdBy, status],
    );
    jobIds.push(rows[0].id);
    return rows[0].id;
  }

  async function mkRealEstate(status: string, createdBy: string): Promise<string> {
    const rows: Array<{ id: string }> = await ds.query(
      `INSERT INTO real_estate_listings
         (created_by, poster_role, transaction_type, property_type, title, address_precision,
          contact_method, contact_value, status, deal_status, published_at)
       VALUES ($1,'owner','rent','room','E2E Admin Listing','area','phone','0900000000',$2::real_estate_listing_status,'available',
         CASE WHEN $2 IN ('published','closed') THEN now() ELSE NULL END)
       RETURNING id`,
      [createdBy, status],
    );
    reIds.push(rows[0].id);
    return rows[0].id;
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    app.useGlobalInterceptors(new TransformInterceptor());
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();
    ds = app.get<DataSource>(getDataSourceToken());

    const reg1 = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ email: memberEmail, password, display_name: 'E2E LAdmin Member' });
    memberToken = reg1.body.data.access_token;
    memberUserId = reg1.body.data.user.id;

    const reg2 = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ email: moderatorEmail, password, display_name: 'E2E LAdmin Moderator' });
    moderatorToken = reg2.body.data.access_token;
    moderatorUserId = reg2.body.data.user.id;

    const granted: Array<{ id: string }> = await ds.query(
      `INSERT INTO user_roles (user_id, role_id)
       SELECT $1, r.id FROM roles r WHERE r.code = 'moderator'
       RETURNING id`,
      [moderatorUserId],
    );
    userRoleIds.push(...granted.map((r) => r.id));

    posterA = await createPoster('A');
    posterB = await createPoster('B');

    // Trộn status + hai người đăng khác nhau — đủ để kiểm "mọi status" (không chỉ pending) và
    // "lọc theo người đăng" trong CÙNG một bộ fixture, không cần nhiều round riêng.
    await mkJob('draft', posterA);
    await mkJob('pending', posterA);
    await mkJob('published', posterA);
    await mkJob('closed', posterB);
    await mkJob('rejected', posterB);

    await mkRealEstate('draft', posterA);
    await mkRealEstate('published', posterA);
    await mkRealEstate('closed', posterB);
  }, 30_000);

  afterAll(async () => {
    try {
      if (ds?.isInitialized) {
        if (jobIds.length) await ds.query(`DELETE FROM job_listings WHERE id = ANY($1)`, [jobIds]);
        if (reIds.length) await ds.query(`DELETE FROM real_estate_listings WHERE id = ANY($1)`, [reIds]);
        if (userRoleIds.length) await ds.query(`DELETE FROM user_roles WHERE id = ANY($1)`, [userRoleIds]);
        const allUserIds = [memberUserId, moderatorUserId, ...posterUserIds];
        await ds.query(`DELETE FROM audit_logs WHERE actor_id = ANY($1)`, [allUserIds]);
        await ds.query(`DELETE FROM users WHERE id = ANY($1)`, [allUserIds]);
      }
    } finally {
      if (app) await app.close();
    }
  }, 30_000);

  describe('quyền chặn ở server (không chỉ ẩn nút phía web)', () => {
    it('GET /job-listings/admin không token → 401', async () => {
      const res = await request(app.getHttpServer()).get('/api/job-listings/admin');
      expect(res.status).toBe(401);
    });

    it('GET /job-listings/admin với tài khoản thường (không JobListing.Moderate) → 403', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/job-listings/admin')
        .set('Authorization', `Bearer ${memberToken}`);
      expect(res.status).toBe(403);
    });

    it('GET /real-estate-listings/admin với tài khoản thường → 403', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/real-estate-listings/admin')
        .set('Authorization', `Bearer ${memberToken}`);
      expect(res.status).toBe(403);
    });
  });

  describe('job-listings: khác hẳn "hàng chờ duyệt" — mọi status, kèm danh tính người đăng, lọc được', () => {
    it('moderator không lọc gì → thấy CẢ published/closed/rejected/draft (không chỉ pending)', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/job-listings/admin?limit=50')
        .set('Authorization', `Bearer ${moderatorToken}`);
      expect(res.status).toBe(200);
      const ids = res.body.data.map((j: { id: string }) => j.id);
      for (const id of jobIds) expect(ids).toContain(id);
    });

    it('mỗi tin có creator_email/creator_display_name ĐÚNG theo created_by của chính nó (không phải một giá trị cố định)', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/job-listings/admin?limit=50')
        .set('Authorization', `Bearer ${moderatorToken}`);
      const byId = new Map(res.body.data.map((j: { id: string }) => [j.id, j]));
      const [draftA, pendingA, publishedA, closedB, rejectedB] = jobIds;
      for (const id of [draftA, pendingA, publishedA]) {
        expect((byId.get(id) as { creator_display_name: string }).creator_display_name).toBe('Poster A');
      }
      for (const id of [closedB, rejectedB]) {
        expect((byId.get(id) as { creator_display_name: string }).creator_display_name).toBe('Poster B');
      }
    });

    it('lọc status=closed → CHỈ tin closed, loại cả published/draft/pending/rejected', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/job-listings/admin?status=closed&limit=50')
        .set('Authorization', `Bearer ${moderatorToken}`);
      const ids: string[] = res.body.data.map((j: { id: string }) => j.id);
      expect(ids).toContain(jobIds[3]); // closed (posterB)
      expect(ids).not.toContain(jobIds[0]); // draft
      expect(ids).not.toContain(jobIds[1]); // pending
      expect(ids).not.toContain(jobIds[2]); // published
      expect(ids).not.toContain(jobIds[4]); // rejected
    });

    it('lọc created_by=posterB → CHỈ tin của posterB (closed+rejected), không lộ tin posterA', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/job-listings/admin?created_by=${posterB}&limit=50`)
        .set('Authorization', `Bearer ${moderatorToken}`);
      const ids: string[] = res.body.data.map((j: { id: string }) => j.id);
      expect(ids.sort()).toEqual([jobIds[3], jobIds[4]].sort());
    });
  });

  describe('real-estate-listings: cùng hành vi (mọi status, lọc theo người đăng)', () => {
    it('moderator không lọc gì → thấy cả published/closed/draft', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/real-estate-listings/admin?limit=50')
        .set('Authorization', `Bearer ${moderatorToken}`);
      expect(res.status).toBe(200);
      const ids = res.body.data.map((r: { id: string }) => r.id);
      for (const id of reIds) expect(ids).toContain(id);
    });

    it('lọc created_by=posterA → chỉ tin của posterA (draft+published), kèm đúng tên hiển thị', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/real-estate-listings/admin?created_by=${posterA}&limit=50`)
        .set('Authorization', `Bearer ${moderatorToken}`);
      const ids: string[] = res.body.data.map((r: { id: string }) => r.id);
      expect(ids.sort()).toEqual([reIds[0], reIds[1]].sort());
      expect(res.body.data.every((r: { creator_display_name: string }) => r.creator_display_name === 'Poster A')).toBe(true);
    });
  });
});
