import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { TransformInterceptor } from '../src/common/interceptors/transform.interceptor';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';

// Gói B (17/10/2026), điểm hẹp #1 owner chỉ ra: listings-edit-resubmit.e2e-spec.ts dùng tin
// REJECTED làm fixture — KHÔNG phải tình huống thật owner cần kiểm ("hết hạn → đăng lại"). File
// này dùng ĐÚNG tình huống: tin đã PUBLISHED nhưng `expires_at` đã qua (status cột không tự đổi,
// đúng thiết kế — chủ tin vẫn thấy ở "Tin của tôi", public thì KHÔNG). Hai nhánh:
//   A. published+hết hạn → SỬA được NGAY (không cần Đóng tin trước — update() đẩy published→pending
//      trực tiếp, xem job-listings.service.ts) → duyệt → public lại.
//   B. closed (đã đóng tay) → PHẢI Mở lại trước mới sửa được (update() chặn CLOSED) — xác nhận
//      đường đó hoạt động đúng, không giả định.
describe('Listing published-nhưng-hết-hạn → sửa+đăng lại (e2e, KHÔNG dùng fixture rejected)', () => {
  let app: INestApplication;
  let ds: DataSource;
  let posterToken: string;
  let posterUserId: string;
  let moderatorToken: string;
  let moderatorUserId: string;
  let userRoleId: string | null = null;
  const jobIds: string[] = [];
  const reIds: string[] = [];

  const posterEmail = `e2e_expired_poster_${Date.now()}@phuquochub.test`;
  const moderatorEmail = `e2e_expired_moderator_${Date.now()}@phuquochub.test`;
  const password = 'password123';

  function vnToday(): string {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date());
  }
  function addDays(ymd: string, days: number): string {
    const d = new Date(`${ymd}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
  }
  const yesterday = () => addDays(vnToday(), -1);
  const future = () => addDays(vnToday(), 30);

  async function mkPublishedExpiredJob(): Promise<string> {
    const rows: Array<{ id: string }> = await ds.query(
      `INSERT INTO job_listings
         (created_by, employer_name, title, job_category, work_location, employment_type,
          contact_method, contact_value, status, expires_at, published_at)
       VALUES ($1,'E2E Expired Co','Tin đã hết hạn','F&B','An Thới','full_time','phone','0900000000',
         'published'::job_listing_status, $2, now())
       RETURNING id`,
      [posterUserId, yesterday()],
    );
    jobIds.push(rows[0].id);
    return rows[0].id;
  }

  async function mkClosedJob(): Promise<string> {
    const rows: Array<{ id: string }> = await ds.query(
      `INSERT INTO job_listings
         (created_by, employer_name, title, job_category, work_location, employment_type,
          contact_method, contact_value, status, published_at)
       VALUES ($1,'E2E Closed Co','Tin đã đóng','F&B','An Thới','full_time','phone','0900000000',
         'closed'::job_listing_status, now())
       RETURNING id`,
      [posterUserId],
    );
    jobIds.push(rows[0].id);
    return rows[0].id;
  }

  async function mkPublishedExpiredRealEstate(): Promise<string> {
    const rows: Array<{ id: string }> = await ds.query(
      `INSERT INTO real_estate_listings
         (created_by, poster_role, transaction_type, property_type, title, address_precision,
          contact_method, contact_value, status, deal_status, expires_at, published_at)
       VALUES ($1,'owner','rent','room','Tin BĐS đã hết hạn','area','phone','0900000000',
         'published'::real_estate_listing_status,'available', $2, now())
       RETURNING id`,
      [posterUserId, yesterday()],
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
      .send({ email: posterEmail, password, display_name: 'E2E Expired Poster' });
    posterToken = reg1.body.data.access_token;
    posterUserId = reg1.body.data.user.id;

    const reg2 = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ email: moderatorEmail, password, display_name: 'E2E Expired Moderator' });
    moderatorToken = reg2.body.data.access_token;
    moderatorUserId = reg2.body.data.user.id;

    const granted: Array<{ id: string }> = await ds.query(
      `INSERT INTO user_roles (user_id, role_id) SELECT $1, r.id FROM roles r WHERE r.code = 'moderator' RETURNING id`,
      [moderatorUserId],
    );
    userRoleId = granted[0]?.id ?? null;
  }, 30_000);

  afterAll(async () => {
    try {
      if (ds?.isInitialized) {
        if (jobIds.length) await ds.query(`DELETE FROM job_listings WHERE id = ANY($1)`, [jobIds]);
        if (reIds.length) await ds.query(`DELETE FROM real_estate_listings WHERE id = ANY($1)`, [reIds]);
        const ids = [posterUserId, moderatorUserId];
        await ds.query(`DELETE FROM audit_logs WHERE actor_id = ANY($1)`, [ids]);
        if (userRoleId) await ds.query(`DELETE FROM user_roles WHERE id = $1`, [userRoleId]);
        await ds.query(`DELETE FROM users WHERE id = ANY($1)`, [ids]);
      }
    } finally {
      if (app) await app.close();
    }
  }, 30_000);

  describe('A. Job listing: published + expires_at đã qua — KHÔNG cần Đóng tin trước khi sửa', () => {
    let jobId: string;

    it('fixture: published+hết hạn → KHÔNG công khai (404), vẫn thấy ở "Tin của tôi" với status published', async () => {
      jobId = await mkPublishedExpiredJob();
      const pub = await request(app.getHttpServer()).get(`/api/job-listings/${jobId}`);
      expect(pub.status).toBe(404);

      const mine = await request(app.getHttpServer())
        .get(`/api/job-listings/mine/${jobId}`)
        .set('Authorization', `Bearer ${posterToken}`);
      expect(mine.body.data.status).toBe('published'); // cột status KHÔNG tự đổi — đúng thiết kế.
      expect(mine.body.data.expires_at).toBe(yesterday());
    });

    it('admin tìm thấy đúng tin này qua GET .../admin?status=published (nhóm "đang đăng" nhưng đã hết hạn)', async () => {
      const admin = await request(app.getHttpServer())
        .get('/api/job-listings/admin?status=published&limit=50')
        .set('Authorization', `Bearer ${moderatorToken}`);
      const ids: string[] = admin.body.data.map((j: { id: string }) => j.id);
      expect(ids).toContain(jobId);
    });

    it('sửa (PATCH) NGAY — không cần đóng tin trước — nội dung+hạn mới lưu được, status chuyển THẲNG sang pending', async () => {
      const newExpiry = future();
      const res = await request(app.getHttpServer())
        .patch(`/api/job-listings/${jobId}`)
        .set('Authorization', `Bearer ${posterToken}`)
        .send({
          employer_name: 'E2E Expired Co',
          title: 'Tin đã sửa — còn hàng, gia hạn lại',
          job_category: 'F&B',
          work_location: 'An Thới',
          employment_type: 'full_time',
          contact_method: 'phone',
          contact_value: '0911111111',
          expires_at: newExpiry,
        });
      expect(res.status).toBe(200);
      expect(res.body.data.id).toBe(jobId);
      expect(res.body.data.status).toBe('pending'); // published --update--> pending TRỰC TIẾP, không cần submit() riêng.
      expect(res.body.data.expires_at).toBe(newExpiry);

      // Vẫn KHÔNG công khai trong lúc pending (chưa duyệt lại).
      const pub = await request(app.getHttpServer()).get(`/api/job-listings/${jobId}`);
      expect(pub.status).toBe(404);
    });

    it('moderator duyệt → published lại, public hiện ĐÚNG nội dung/hạn mới, giữ nguyên id/created_by', async () => {
      const decide = await request(app.getHttpServer())
        .post(`/api/job-listings/${jobId}/decide`)
        .set('Authorization', `Bearer ${moderatorToken}`)
        .send({ decision: 'approve' });
      expect(decide.status).toBe(201);
      expect(decide.body.data.status).toBe('published');
      expect(decide.body.data.created_by).toBe(posterUserId);

      const pub = await request(app.getHttpServer()).get(`/api/job-listings/${jobId}`);
      expect(pub.status).toBe(200);
      expect(pub.body.data.title).toBe('Tin đã sửa — còn hàng, gia hạn lại');
      expect(pub.body.data.contact_value).toBe('0911111111');

      const mine = await request(app.getHttpServer())
        .get(`/api/job-listings/mine/${jobId}`)
        .set('Authorization', `Bearer ${posterToken}`);
      expect(mine.body.data.id).toBe(jobId); // cùng bản ghi suốt luồng, không tạo bản sao.
    });
  });

  describe('B. Job listing: ĐÃ ĐÓNG (closed) — PHẢI Mở lại trước, không sửa trực tiếp được', () => {
    let closedJobId: string;

    it('fixture: tin closed', async () => {
      closedJobId = await mkClosedJob();
    });

    it('PATCH trực tiếp khi đang closed → 409 (phải Mở lại trước)', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/job-listings/${closedJobId}`)
        .set('Authorization', `Bearer ${posterToken}`)
        .send({
          employer_name: 'E2E Closed Co',
          title: 'Thử sửa khi chưa mở lại',
          job_category: 'F&B',
          work_location: 'An Thới',
          employment_type: 'full_time',
          contact_method: 'phone',
          contact_value: '0900000000',
        });
      expect(res.status).toBe(409);
    });

    it('Mở lại (reopen) → pending; SAU ĐÓ PATCH mới hợp lệ (pending → rút về draft); gửi duyệt lại → pending → duyệt → published, public hiện lại', async () => {
      const reopen = await request(app.getHttpServer())
        .post(`/api/job-listings/${closedJobId}/reopen`)
        .set('Authorization', `Bearer ${posterToken}`);
      expect(reopen.body.data.status).toBe('pending');

      const patch = await request(app.getHttpServer())
        .patch(`/api/job-listings/${closedJobId}`)
        .set('Authorization', `Bearer ${posterToken}`)
        .send({
          employer_name: 'E2E Closed Co',
          title: 'Tin đã mở lại và sửa',
          job_category: 'F&B',
          work_location: 'An Thới',
          employment_type: 'full_time',
          contact_method: 'phone',
          contact_value: '0900000000',
          expires_at: future(),
        });
      expect(patch.body.data.status).toBe('draft'); // update() khi đang pending rút về draft.

      const submit = await request(app.getHttpServer())
        .post(`/api/job-listings/${closedJobId}/submit`)
        .set('Authorization', `Bearer ${posterToken}`);
      expect(submit.body.data.status).toBe('pending');

      const decide = await request(app.getHttpServer())
        .post(`/api/job-listings/${closedJobId}/decide`)
        .set('Authorization', `Bearer ${moderatorToken}`)
        .send({ decision: 'approve' });
      expect(decide.body.data.status).toBe('published');

      const pub = await request(app.getHttpServer()).get(`/api/job-listings/${closedJobId}`);
      expect(pub.status).toBe(200);
      expect(pub.body.data.title).toBe('Tin đã mở lại và sửa');
    });
  });

  describe('C. Real estate listing: cùng nhánh A (published+hết hạn, không cần đóng trước)', () => {
    let relId: string;

    it('published+hết hạn → sửa trực tiếp → pending → duyệt → public lại, giữ id/created_by', async () => {
      relId = await mkPublishedExpiredRealEstate();

      const hiddenBefore = await request(app.getHttpServer()).get(`/api/real-estate-listings/${relId}`);
      expect(hiddenBefore.status).toBe(404);

      const patch = await request(app.getHttpServer())
        .patch(`/api/real-estate-listings/${relId}`)
        .set('Authorization', `Bearer ${posterToken}`)
        .send({
          poster_role: 'owner',
          transaction_type: 'rent',
          property_type: 'room',
          title: 'Tin BĐS đã sửa — còn phòng',
          contact_method: 'phone',
          contact_value: '0922222222',
          expires_at: future(),
        });
      expect(patch.status).toBe(200);
      expect(patch.body.data.status).toBe('pending');

      const decide = await request(app.getHttpServer())
        .post(`/api/real-estate-listings/${relId}/decide`)
        .set('Authorization', `Bearer ${moderatorToken}`)
        .send({ decision: 'approve' });
      expect(decide.body.data.status).toBe('published');
      expect(decide.body.data.created_by).toBe(posterUserId);

      const pub = await request(app.getHttpServer()).get(`/api/real-estate-listings/${relId}`);
      expect(pub.status).toBe(200);
      expect(pub.body.data.title).toBe('Tin BĐS đã sửa — còn phòng');
    });
  });

  describe('D. Gate "hạn còn hiệu lực để đăng lại" tại submit()/decide() — không chỉ ở update()', () => {
    it('hết hạn lúc sửa KHÔNG bị chặn nếu không đổi expires_at (sửa trường khác), nhưng submit() sau đó chặn nếu hạn (không đổi) đã quá khứ', async () => {
      const id = await mkPublishedExpiredJob(); // published, expires_at = hôm qua.
      // Sửa CHỈ title, KHÔNG gửi expires_at mới (giữ nguyên hạn cũ đã qua) — PHẢI lưu được (không
      // vô tình chặn sửa nội dung chỉ vì hạn cũ đã qua).
      const patch = await request(app.getHttpServer())
        .patch(`/api/job-listings/${id}`)
        .set('Authorization', `Bearer ${posterToken}`)
        .send({
          employer_name: 'E2E Expired Co',
          title: 'Chỉ sửa tiêu đề, không đụng hạn',
          job_category: 'F&B',
          work_location: 'An Thới',
          employment_type: 'full_time',
          contact_method: 'phone',
          contact_value: '0900000000',
          expires_at: yesterday(), // giữ NGUYÊN giá trị cũ.
        });
      expect(patch.status).toBe(200); // không bị chặn — đây là điểm owner yêu cầu sửa.
      expect(patch.body.data.status).toBe('pending'); // published --update--> pending (như nhánh A).

      // Giờ ở pending, hạn VẪN là hôm qua (chưa ai sửa) — nếu rejected rồi gửi lại, submit() PHẢI
      // chặn. Mô phỏng bằng reject trước (để test submit() từ rejected với hạn vẫn cũ):
      const reject = await request(app.getHttpServer())
        .post(`/api/job-listings/${id}/decide`)
        .set('Authorization', `Bearer ${moderatorToken}`)
        .send({ decision: 'reject', note: 'cần hạn mới' }); // decide() REJECT không bị gate hạn chặn.
      expect(reject.body.data.status).toBe('rejected');

      const submitAgain = await request(app.getHttpServer())
        .post(`/api/job-listings/${id}/submit`)
        .set('Authorization', `Bearer ${posterToken}`);
      expect(submitAgain.status).toBe(400); // gate THẬT: không gửi duyệt được với hạn đã quá khứ.
    });
  });
});
