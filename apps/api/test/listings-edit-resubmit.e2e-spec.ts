import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { TransformInterceptor } from '../src/common/interceptors/transform.interceptor';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';

// Gói B (17/10/2026) — "Sửa và gửi đăng lại" qua request thật (không chỉ unit mock service), cho
// MỘT tin tuyển dụng bị từ chối: PATCH (sửa nội dung + hạn mới) → POST submit (gửi lại) → PATCH
// decide (moderator duyệt) → GET công khai (xác nhận hiện đúng nội dung MỚI, hạn MỚI). Đồng thời
// kiểm owner yêu cầu rõ:
//   - "chọn hạn mới hợp lệ": hạn ở quá khứ bị chặn 400 NGAY TẠI update(), không tới được submit().
//   - "giữ nội dung, chủ tin và lịch sử": cùng id/created_by/created_at suốt vòng sửa→gửi lại→duyệt
//     (không tạo bản ghi mới, không đổi chủ tin).
//   - "qua duyệt trước khi công khai": PATCH không tự publish — vẫn phải qua decide() của moderator.
describe('Job listing "Sửa và gửi đăng lại" (e2e)', () => {
  let app: INestApplication;
  let ds: DataSource;
  let posterToken: string;
  let posterUserId: string;
  let moderatorToken: string;
  let moderatorUserId: string;
  let userRoleId: string | null = null;
  let jobId: string;

  const posterEmail = `e2e_resubmit_poster_${Date.now()}@phuquochub.test`;
  const moderatorEmail = `e2e_resubmit_moderator_${Date.now()}@phuquochub.test`;
  const password = 'password123';

  function vnToday(): string {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date());
  }
  function addDays(ymd: string, days: number): string {
    const d = new Date(`${ymd}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
  }

  const baseJob = {
    employer_name: 'E2E Resubmit Co',
    title: 'Tin gốc',
    job_category: 'F&B',
    work_location: 'An Thới, Phú Quốc',
    employment_type: 'full_time',
    contact_method: 'phone',
    contact_value: '0900000000',
  };

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
      .send({ email: posterEmail, password, display_name: 'E2E Resubmit Poster' });
    posterToken = reg1.body.data.access_token;
    posterUserId = reg1.body.data.user.id;

    const reg2 = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ email: moderatorEmail, password, display_name: 'E2E Resubmit Moderator' });
    moderatorToken = reg2.body.data.access_token;
    moderatorUserId = reg2.body.data.user.id;

    const granted: Array<{ id: string }> = await ds.query(
      `INSERT INTO user_roles (user_id, role_id) SELECT $1, r.id FROM roles r WHERE r.code = 'moderator' RETURNING id`,
      [moderatorUserId],
    );
    userRoleId = granted[0]?.id ?? null;

    const create = await request(app.getHttpServer())
      .post('/api/job-listings')
      .set('Authorization', `Bearer ${posterToken}`)
      .send({ ...baseJob, expires_at: addDays(vnToday(), 30) });
    jobId = create.body.data.id;

    await request(app.getHttpServer())
      .post(`/api/job-listings/${jobId}/submit`)
      .set('Authorization', `Bearer ${posterToken}`);
    await request(app.getHttpServer())
      .post(`/api/job-listings/${jobId}/decide`)
      .set('Authorization', `Bearer ${moderatorToken}`)
      .send({ decision: 'reject', note: 'Thiếu thông tin liên hệ rõ ràng' });
  }, 30_000);

  afterAll(async () => {
    try {
      if (ds?.isInitialized && jobId) {
        await ds.query(`DELETE FROM job_listings WHERE id = $1`, [jobId]);
        const ids = [posterUserId, moderatorUserId];
        await ds.query(`DELETE FROM audit_logs WHERE actor_id = ANY($1)`, [ids]);
        if (userRoleId) await ds.query(`DELETE FROM user_roles WHERE id = $1`, [userRoleId]);
        await ds.query(`DELETE FROM users WHERE id = ANY($1)`, [ids]);
      }
    } finally {
      if (app) await app.close();
    }
  }, 30_000);

  it('fixture: tin đã ở trạng thái rejected, có lý do từ chối', async () => {
    const mine = await request(app.getHttpServer())
      .get(`/api/job-listings/mine/${jobId}`)
      .set('Authorization', `Bearer ${posterToken}`);
    expect(mine.body.data.status).toBe('rejected');
    expect(mine.body.data.review_note).toMatch(/Thiếu thông tin/);
  });

  it('sửa với hạn mới ở QUÁ KHỨ → 400, KHÔNG đổi gì (vẫn rejected với nội dung cũ)', async () => {
    const res = await request(app.getHttpServer())
      .patch(`/api/job-listings/${jobId}`)
      .set('Authorization', `Bearer ${posterToken}`)
      .send({ ...baseJob, title: 'Tin đã sửa (không nên lưu)', expires_at: '2000-01-01' });
    expect(res.status).toBe(400);

    const mine = await request(app.getHttpServer())
      .get(`/api/job-listings/mine/${jobId}`)
      .set('Authorization', `Bearer ${posterToken}`);
    expect(mine.body.data.title).toBe('Tin gốc');
    expect(mine.body.data.status).toBe('rejected');
  });

  it('người khác (không phải chủ tin) không sửa được → 404 (không lộ tồn tại)', async () => {
    const res = await request(app.getHttpServer())
      .patch(`/api/job-listings/${jobId}`)
      .set('Authorization', `Bearer ${moderatorToken}`)
      .send({ ...baseJob, title: 'Tin bị người khác sửa', expires_at: addDays(vnToday(), 30) });
    expect(res.status).toBe(404);
  });

  it('sửa nội dung + hạn mới HỢP LỆ → lưu được, vẫn rejected (chưa tự gửi lại), giữ nguyên id/created_by', async () => {
    const newExpiry = addDays(vnToday(), 45);
    const res = await request(app.getHttpServer())
      .patch(`/api/job-listings/${jobId}`)
      .set('Authorization', `Bearer ${posterToken}`)
      .send({ ...baseJob, title: 'Tin đã sửa — bổ sung liên hệ', contact_value: '0911111111', expires_at: newExpiry });
    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(jobId);
    expect(res.body.data.status).toBe('rejected');
    expect(res.body.data.title).toBe('Tin đã sửa — bổ sung liên hệ');
    expect(res.body.data.expires_at).toBe(newExpiry);

    // Chưa gửi lại (submit) → vẫn KHÔNG công khai.
    const pub = await request(app.getHttpServer()).get(`/api/job-listings/${jobId}`);
    expect(pub.status).toBe(404);
  });

  it('gửi lại (submit) → pending; moderator duyệt → published; công khai hiện ĐÚNG nội dung mới, giữ created_by', async () => {
    const submit = await request(app.getHttpServer())
      .post(`/api/job-listings/${jobId}/submit`)
      .set('Authorization', `Bearer ${posterToken}`);
    expect(submit.body.data.status).toBe('pending');

    // Vẫn pending → chưa công khai (qua duyệt trước khi công khai, không tự publish khi gửi lại).
    const stillHidden = await request(app.getHttpServer()).get(`/api/job-listings/${jobId}`);
    expect(stillHidden.status).toBe(404);

    const decide = await request(app.getHttpServer())
      .post(`/api/job-listings/${jobId}/decide`)
      .set('Authorization', `Bearer ${moderatorToken}`)
      .send({ decision: 'approve' });
    expect(decide.body.data.status).toBe('published');
    expect(decide.body.data.created_by).toBe(posterUserId);

    const pub = await request(app.getHttpServer()).get(`/api/job-listings/${jobId}`);
    expect(pub.status).toBe(200);
    expect(pub.body.data.title).toBe('Tin đã sửa — bổ sung liên hệ');
    expect(pub.body.data.contact_value).toBe('0911111111');

    const mine = await request(app.getHttpServer())
      .get(`/api/job-listings/mine/${jobId}`)
      .set('Authorization', `Bearer ${posterToken}`);
    expect(mine.body.data.id).toBe(jobId); // cùng bản ghi suốt luồng — không tạo bản sao.
  });
});
