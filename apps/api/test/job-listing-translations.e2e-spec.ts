import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { TransformInterceptor } from '../src/common/interceptors/transform.interceptor';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';

// Gói C phần 1/2 (17/10/2026) — bản dịch tiếng Anh cho job_listings, qua request HTTP thật (không
// chỉ unit mock): viết draft → gửi duyệt → moderator duyệt → chi tiết công khai `?locale=en` trả
// ĐÚNG nội dung tiếng Anh, `?locale=vi` (hoặc không truyền) vẫn trả tiếng Việt — hai bản SONG SONG,
// không cái nào ghi đè cái kia (owner yêu cầu rõ: "không đổi VI khi sửa EN và ngược lại").
describe('Job listing translations (en) — e2e', () => {
  let app: INestApplication;
  let ds: DataSource;
  let posterToken: string;
  let posterUserId: string;
  let strangerToken: string;
  let strangerUserId: string;
  let moderatorToken: string;
  let moderatorUserId: string;
  let userRoleId: string | null = null;
  let jobId: string;

  const posterEmail = `e2e_jltrans_poster_${Date.now()}@phuquochub.test`;
  const strangerEmail = `e2e_jltrans_stranger_${Date.now()}@phuquochub.test`;
  const moderatorEmail = `e2e_jltrans_moderator_${Date.now()}@phuquochub.test`;
  const password = 'password123';

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
      .send({ email: posterEmail, password, display_name: 'E2E JLTrans Poster' });
    posterToken = reg1.body.data.access_token;
    posterUserId = reg1.body.data.user.id;

    const reg2 = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ email: strangerEmail, password, display_name: 'E2E JLTrans Stranger' });
    strangerToken = reg2.body.data.access_token;
    strangerUserId = reg2.body.data.user.id;

    const reg3 = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ email: moderatorEmail, password, display_name: 'E2E JLTrans Moderator' });
    moderatorToken = reg3.body.data.access_token;
    moderatorUserId = reg3.body.data.user.id;

    const granted: Array<{ id: string }> = await ds.query(
      `INSERT INTO user_roles (user_id, role_id) SELECT $1, r.id FROM roles r WHERE r.code = 'moderator' RETURNING id`,
      [moderatorUserId],
    );
    userRoleId = granted[0]?.id ?? null;

    const create = await request(app.getHttpServer())
      .post('/api/job-listings')
      .set('Authorization', `Bearer ${posterToken}`)
      .send({
        employer_name: 'E2E JLTrans Co',
        title: 'Tiêu đề tiếng Việt',
        job_category: 'F&B',
        work_location: 'An Thới',
        employment_type: 'full_time',
        contact_method: 'phone',
        contact_value: '0900000000',
        description: 'Mô tả tiếng Việt gốc',
      });
    jobId = create.body.data.id;
    await request(app.getHttpServer()).post(`/api/job-listings/${jobId}/submit`).set('Authorization', `Bearer ${posterToken}`);
    await request(app.getHttpServer())
      .post(`/api/job-listings/${jobId}/decide`)
      .set('Authorization', `Bearer ${moderatorToken}`)
      .send({ decision: 'approve' });
  }, 30_000);

  afterAll(async () => {
    try {
      if (ds?.isInitialized && jobId) {
        await ds.query(`DELETE FROM job_listing_translations WHERE job_listing_id = $1`, [jobId]);
        await ds.query(`DELETE FROM job_listings WHERE id = $1`, [jobId]);
        const ids = [posterUserId, strangerUserId, moderatorUserId];
        await ds.query(`DELETE FROM audit_logs WHERE actor_id = ANY($1)`, [ids]);
        if (userRoleId) await ds.query(`DELETE FROM user_roles WHERE id = $1`, [userRoleId]);
        await ds.query(`DELETE FROM users WHERE email = ANY($1)`, [[posterEmail, strangerEmail, moderatorEmail]]);
      }
    } finally {
      if (app) await app.close();
    }
  }, 30_000);

  it('fixture: tin đã published tiếng Việt, chi tiết công khai (không locale) trả tiếng Việt + locale="vi"', async () => {
    const res = await request(app.getHttpServer()).get(`/api/job-listings/${jobId}`);
    expect(res.body.data.title).toBe('Tiêu đề tiếng Việt');
    expect(res.body.data.locale).toBe('vi');
  });

  it('?locale=en TRƯỚC KHI có bản dịch nào → vẫn tiếng Việt, locale="vi" (KHÔNG nhận vơ là tiếng Anh)', async () => {
    const res = await request(app.getHttpServer()).get(`/api/job-listings/${jobId}?locale=en`);
    expect(res.body.data.title).toBe('Tiêu đề tiếng Việt');
    expect(res.body.data.locale).toBe('vi');
  });

  it('GET bản dịch của tôi khi chưa từng lưu → null (không tự tạo row rỗng)', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/job-listings/${jobId}/translations/en`)
      .set('Authorization', `Bearer ${posterToken}`);
    expect(res.body.data).toBeNull();
  });

  it('người lạ không lưu được bản dịch cho tin không phải của mình → 404', async () => {
    const res = await request(app.getHttpServer())
      .put(`/api/job-listings/${jobId}/translations/en`)
      .set('Authorization', `Bearer ${strangerToken}`)
      .send({ title: 'Hacked title' });
    expect(res.status).toBe(404);
  });

  it('chủ tin lưu draft bản dịch → 200, status=draft; public vẫn tiếng Việt (chưa duyệt)', async () => {
    const save = await request(app.getHttpServer())
      .put(`/api/job-listings/${jobId}/translations/en`)
      .set('Authorization', `Bearer ${posterToken}`)
      .send({ title: 'English title', description: 'English description' });
    expect(save.status).toBe(200);
    expect(save.body.data.status).toBe('draft');

    const pub = await request(app.getHttpServer()).get(`/api/job-listings/${jobId}?locale=en`);
    expect(pub.body.data.title).toBe('Tiêu đề tiếng Việt'); // draft chưa duyệt → chưa công khai.
    expect(pub.body.data.locale).toBe('vi');
  });

  it('gửi duyệt (submit) → pending; public vẫn tiếng Việt (đang chờ duyệt, chưa published)', async () => {
    const submit = await request(app.getHttpServer())
      .post(`/api/job-listings/${jobId}/translations/en/submit`)
      .set('Authorization', `Bearer ${posterToken}`);
    expect(submit.body.data.status).toBe('pending');

    const pub = await request(app.getHttpServer()).get(`/api/job-listings/${jobId}?locale=en`);
    expect(pub.body.data.locale).toBe('vi');
  });

  it('người thường (không JobListing.Moderate) không duyệt được bản dịch → 403', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/job-listings/${jobId}/translations/en/decide`)
      .set('Authorization', `Bearer ${strangerToken}`)
      .send({ decision: 'approve' });
    expect(res.status).toBe(403);
  });

  it('moderator xem được hàng chờ duyệt bản dịch, thấy đúng ngữ cảnh tin gốc', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/job-listings/translations/en/pending')
      .set('Authorization', `Bearer ${moderatorToken}`);
    const mine = res.body.data.find((t: { job_listing_id: string }) => t.job_listing_id === jobId);
    expect(mine).toBeDefined();
    expect(mine.source_title).toBe('Tiêu đề tiếng Việt');
  });

  it('moderator duyệt → published; public `?locale=en` nay trả tiếng Anh, `?locale=vi`/không truyền vẫn trả tiếng Việt KHÔNG đổi', async () => {
    const decide = await request(app.getHttpServer())
      .post(`/api/job-listings/${jobId}/translations/en/decide`)
      .set('Authorization', `Bearer ${moderatorToken}`)
      .send({ decision: 'approve' });
    expect(decide.body.data.status).toBe('published');

    const en = await request(app.getHttpServer()).get(`/api/job-listings/${jobId}?locale=en`);
    expect(en.body.data.title).toBe('English title');
    expect(en.body.data.description).toBe('English description');
    expect(en.body.data.locale).toBe('en');

    const vi = await request(app.getHttpServer()).get(`/api/job-listings/${jobId}?locale=vi`);
    expect(vi.body.data.title).toBe('Tiêu đề tiếng Việt'); // KHÔNG bị bản dịch ghi đè.
    expect(vi.body.data.locale).toBe('vi');

    const noLocale = await request(app.getHttpServer()).get(`/api/job-listings/${jobId}`);
    expect(noLocale.body.data.title).toBe('Tiêu đề tiếng Việt'); // mặc định vẫn tiếng Việt.
  });

  it('sửa tiếng Việt gốc SAU KHI bản dịch đã duyệt → bản dịch is_stale=true (báo cho chủ tin, KHÔNG tự xoá/tự ẩn bản dịch)', async () => {
    // update() trên tin published đẩy NGAY về pending (luồng CHÍNH, không liên quan gì tới bản
    // dịch — xem JobListingsService.update()) — nên public (cả hai locale) tạm ẩn vì tin gốc chưa
    // published lại, KHÔNG phải vì bản dịch bị huỷ: bản dịch vẫn còn nguyên, chỉ đánh dấu is_stale.
    await request(app.getHttpServer())
      .patch(`/api/job-listings/${jobId}`)
      .set('Authorization', `Bearer ${posterToken}`)
      .send({
        employer_name: 'E2E JLTrans Co',
        title: 'Tiêu đề tiếng Việt ĐÃ SỬA',
        job_category: 'F&B',
        work_location: 'An Thới',
        employment_type: 'full_time',
        contact_method: 'phone',
        contact_value: '0900000000',
        description: 'Mô tả tiếng Việt ĐÃ SỬA',
      });

    const mine = await request(app.getHttpServer())
      .get(`/api/job-listings/${jobId}/translations/en`)
      .set('Authorization', `Bearer ${posterToken}`);
    expect(mine.body.data.is_stale).toBe(true);
    expect(mine.body.data.status).toBe('published'); // bản dịch TỰ NÓ không đổi status — chỉ tin gốc đổi.
    expect(mine.body.data.title).toBe('English title'); // nội dung bản dịch vẫn còn, chưa ai xoá/sửa.

    const pub = await request(app.getHttpServer()).get(`/api/job-listings/${jobId}?locale=en`);
    expect(pub.status).toBe(404); // tin gốc đang pending (chưa duyệt lại) → 404 đồng nhất, bất kể bản dịch.
  });
});
