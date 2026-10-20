import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { TransformInterceptor } from '../src/common/interceptors/transform.interceptor';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';

// Gói C phần 1/2 (17/10/2026, thiết kế lại sau phản hồi owner) — bản dịch tiếng Anh cho
// job_listings, qua request HTTP thật. Tập trung ĐÚNG vào các điểm owner chỉ ra ở bản thiết kế
// đầu: (1) bản đã duyệt KHÔNG mất khi chủ tin lưu nháp sửa tiếp, (2) CAS content_version chặn ghi
// đè khi hai tab cùng sửa hoặc moderator duyệt trong lúc owner sửa, (3) bản dịch không "vượt qua"
// được tin gốc đóng/hết hạn, (4) stale theo dữ kiện rộng hơn 4 trường dịch, vẫn phục vụ nhưng báo rõ.
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

  const baseJob = {
    employer_name: 'E2E JLTrans Co',
    title: 'Tiêu đề tiếng Việt',
    job_category: 'F&B',
    work_location: 'An Thới',
    employment_type: 'full_time',
    contact_method: 'phone',
    contact_value: '0900000000',
    description: 'Mô tả tiếng Việt gốc',
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
      .send(baseJob);
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
    expect(res.body.data.is_translation_stale).toBe(false);
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

  it('chủ tin lưu draft lần ĐẦU (chưa có bản dịch nào) → 200, content_version=1, KHÔNG cần expected_content_version; public vẫn tiếng Việt', async () => {
    const save = await request(app.getHttpServer())
      .put(`/api/job-listings/${jobId}/translations/en`)
      .set('Authorization', `Bearer ${posterToken}`)
      .send({ title: 'English title', description: 'English description' });
    expect(save.status).toBe(200);
    expect(save.body.data.status).toBe('draft');
    expect(save.body.data.content_version).toBe(1);
    expect(save.body.data.has_published).toBe(false);

    const pub = await request(app.getHttpServer()).get(`/api/job-listings/${jobId}?locale=en`);
    expect(pub.body.data.title).toBe('Tiêu đề tiếng Việt');
    expect(pub.body.data.locale).toBe('vi');
  });

  it('lưu tiếp (đã có bản dịch) mà KHÔNG gửi expected_content_version → 400', async () => {
    const res = await request(app.getHttpServer())
      .put(`/api/job-listings/${jobId}/translations/en`)
      .set('Authorization', `Bearer ${posterToken}`)
      .send({ title: 'English title v2' });
    expect(res.status).toBe(400);
  });

  it('CAS: gửi expected_content_version SAI (stale) → 409, nội dung KHÔNG đổi', async () => {
    const res = await request(app.getHttpServer())
      .put(`/api/job-listings/${jobId}/translations/en`)
      .set('Authorization', `Bearer ${posterToken}`)
      .send({ title: 'Bị chặn vì version sai', expected_content_version: 999 });
    expect(res.status).toBe(409);

    const mine = await request(app.getHttpServer())
      .get(`/api/job-listings/${jobId}/translations/en`)
      .set('Authorization', `Bearer ${posterToken}`);
    expect(mine.body.data.title).toBe('English title'); // vẫn giá trị cũ, không bị đè.
  });

  it('CAS: gửi ĐÚNG expected_content_version → 200, content_version tăng lên', async () => {
    const mineBefore = await request(app.getHttpServer())
      .get(`/api/job-listings/${jobId}/translations/en`)
      .set('Authorization', `Bearer ${posterToken}`);
    const version = mineBefore.body.data.content_version;

    const save = await request(app.getHttpServer())
      .put(`/api/job-listings/${jobId}/translations/en`)
      .set('Authorization', `Bearer ${posterToken}`)
      .send({ title: 'English title', description: 'English description', expected_content_version: version });
    expect(save.status).toBe(200);
    expect(save.body.data.content_version).toBe(version + 1);
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

  it('moderator duyệt KHÔNG gửi expected_content_version → 400 ("phải duyệt đúng phiên bản đã đọc")', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/job-listings/${jobId}/translations/en/decide`)
      .set('Authorization', `Bearer ${moderatorToken}`)
      .send({ decision: 'approve' });
    expect(res.status).toBe(400);
  });

  it('CAS decide: gửi expected_content_version SAI → 409, trạng thái KHÔNG đổi', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/job-listings/${jobId}/translations/en/decide`)
      .set('Authorization', `Bearer ${moderatorToken}`)
      .send({ decision: 'approve', expected_content_version: 999 });
    expect(res.status).toBe(409);

    const mine = await request(app.getHttpServer())
      .get(`/api/job-listings/${jobId}/translations/en`)
      .set('Authorization', `Bearer ${posterToken}`);
    expect(mine.body.data.status).toBe('pending'); // vẫn pending, chưa bị duyệt nhầm.
  });

  it('moderator duyệt ĐÚNG version → published; public `?locale=en` nay trả tiếng Anh ĐÃ DUYỆT, `?locale=vi` KHÔNG đổi, is_translation_stale=false', async () => {
    const pending = await request(app.getHttpServer())
      .get(`/api/job-listings/${jobId}/translations/en`)
      .set('Authorization', `Bearer ${posterToken}`);
    const version = pending.body.data.content_version;

    const decide = await request(app.getHttpServer())
      .post(`/api/job-listings/${jobId}/translations/en/decide`)
      .set('Authorization', `Bearer ${moderatorToken}`)
      .send({ decision: 'approve', expected_content_version: version });
    expect(decide.body.data.status).toBe('published');
    expect(decide.body.data.has_published).toBe(true);

    const en = await request(app.getHttpServer()).get(`/api/job-listings/${jobId}?locale=en`);
    expect(en.body.data.title).toBe('English title');
    expect(en.body.data.description).toBe('English description');
    expect(en.body.data.locale).toBe('en');
    expect(en.body.data.is_translation_stale).toBe(false);

    const vi = await request(app.getHttpServer()).get(`/api/job-listings/${jobId}?locale=vi`);
    expect(vi.body.data.title).toBe('Tiêu đề tiếng Việt'); // KHÔNG bị bản dịch ghi đè.

    const noLocale = await request(app.getHttpServer()).get(`/api/job-listings/${jobId}`);
    expect(noLocale.body.data.title).toBe('Tiêu đề tiếng Việt');
  });

  // Điểm owner yêu cầu sửa trực tiếp (bug thật ở thiết kế đầu): sau khi published, chủ tin lưu
  // nháp sửa tiếp — bản ĐÃ DUYỆT không được mất trong lúc chờ duyệt lại.
  it('chủ tin sửa tiếp bản ĐÃ DUYỆT (lưu nháp mới) → draft, nhưng public EN VẪN phục vụ bản đã duyệt CŨ, không rớt về VI', async () => {
    const mineBefore = await request(app.getHttpServer())
      .get(`/api/job-listings/${jobId}/translations/en`)
      .set('Authorization', `Bearer ${posterToken}`);
    const version = mineBefore.body.data.content_version;

    const save = await request(app.getHttpServer())
      .put(`/api/job-listings/${jobId}/translations/en`)
      .set('Authorization', `Bearer ${posterToken}`)
      .send({ title: 'English title DRAFT EDIT — chưa duyệt', description: 'English description', expected_content_version: version });
    expect(save.body.data.status).toBe('draft');
    expect(save.body.data.has_published).toBe(true); // vẫn còn bản đã duyệt từ trước.

    const en = await request(app.getHttpServer()).get(`/api/job-listings/${jobId}?locale=en`);
    expect(en.body.data.title).toBe('English title'); // bản CŨ đã duyệt, KHÔNG phải bản nháp vừa lưu.
    expect(en.body.data.locale).toBe('en');
  });

  // Gói D điểm 4 (18/10/2026, owner yêu cầu rõ sau khi xem bản đầu) — hành vi CHO DỮ KIỆN QUAN
  // TRỌNG (lương nằm trong nhóm "giá") nay KHÁC với trước: "không coi một cảnh báo chung là đủ" —
  // KHÔNG còn "vẫn phục vụ bản dịch cũ kèm cảnh báo" nữa, mà FALLBACK hẳn về tiếng Việt
  // (translation_hidden_reason='critical_fact_mismatch'). Bản dịch KHÔNG bị xoá (vẫn has_published,
  // moderator vẫn thấy được) — chỉ KHÔNG được chọn phục vụ public cho tới khi ai đó duyệt lại bản
  // dịch khớp dữ kiện mới. Case "chỉ văn xuôi đổi, dữ kiện quan trọng không đổi" (cảnh báo chung,
  // vẫn phục vụ) đã có test riêng ở job-listings.service.spec.ts, không lặp lại ở e2e này.
  it('sửa tiếng Việt gốc (LƯƠNG — dữ kiện QUAN TRỌNG) SAU KHI bản dịch đã duyệt → public EN fallback hẳn về tiếng Việt, không chỉ cảnh báo chung', async () => {
    await request(app.getHttpServer())
      .patch(`/api/job-listings/${jobId}`)
      .set('Authorization', `Bearer ${posterToken}`)
      .send({ ...baseJob, salary_min: 15000000, salary_currency: 'VND' });

    // update() trên tin published đẩy về pending — public tạm ẩn CẢ HAI locale (tin gốc chưa
    // published lại), KHÔNG liên quan gì tới bản dịch bị huỷ.
    const pubHidden = await request(app.getHttpServer()).get(`/api/job-listings/${jobId}?locale=en`);
    expect(pubHidden.status).toBe(404);

    const mine = await request(app.getHttpServer())
      .get(`/api/job-listings/${jobId}/translations/en`)
      .set('Authorization', `Bearer ${posterToken}`);
    expect(mine.body.data.is_published_stale).toBe(true); // lương đổi, chưa ai cập nhật lại câu chữ.
    expect(mine.body.data.has_published).toBe(true); // bản dịch KHÔNG bị xoá — chủ tin vẫn thấy, vẫn sửa được.

    // Duyệt lại tin gốc (không đổi gì về bản dịch) để public lại.
    await request(app.getHttpServer())
      .post(`/api/job-listings/${jobId}/decide`)
      .set('Authorization', `Bearer ${moderatorToken}`)
      .send({ decision: 'approve' });

    const en = await request(app.getHttpServer()).get(`/api/job-listings/${jobId}?locale=en`);
    expect(en.status).toBe(200);
    expect(en.body.data.locale).toBe('vi'); // FALLBACK — không phục vụ bản dịch cũ kèm cảnh báo nữa.
    expect(en.body.data.title).toBe('Tiêu đề tiếng Việt');
    expect(en.body.data.translation_hidden_reason).toBe('critical_fact_mismatch');

    // Khôi phục lại lương về trạng thái gốc (baseJob không có lương) để không ảnh hưởng test khác
    // chạy sau — cùng kỷ luật "khôi phục sau khi mutate fixture dùng chung" như describe block bên
    // dưới. update() lại đẩy published→pending; phải duyệt lại để public trở lại trước test kế tiếp.
    await request(app.getHttpServer())
      .patch(`/api/job-listings/${jobId}`)
      .set('Authorization', `Bearer ${posterToken}`)
      .send({ ...baseJob, salary_min: null, salary_currency: null });
    await request(app.getHttpServer())
      .post(`/api/job-listings/${jobId}/decide`)
      .set('Authorization', `Bearer ${moderatorToken}`)
      .send({ decision: 'approve' });
  });

  it('?locale=en trên DANH SÁCH công khai cũng overlay title (không chỉ chi tiết)', async () => {
    const res = await request(app.getHttpServer()).get('/api/job-listings?locale=en&limit=50');
    const mine = res.body.data.find((j: { id: string }) => j.id === jobId);
    expect(mine).toBeDefined();
    expect(mine.title).toBe('English title');
    expect(mine.locale).toBe('en');

    const viList = await request(app.getHttpServer()).get('/api/job-listings?limit=50');
    const mineVi = viList.body.data.find((j: { id: string }) => j.id === jobId);
    expect(mineVi.title).toBe('Tiêu đề tiếng Việt');
  });

  // Owner: "Bản dịch chỉ public khi chính listing đang được phép public và còn hạn. Translation
  // published không được vượt qua listing pending/rejected/closed/expired/deleted." Kiểm TRỰC TIẾP
  // bằng SQL thật (ép tin gốc sang từng trạng thái đó trong lúc bản dịch VẪN `published`) — không
  // chỉ tin vào luồng service bình thường (luồng đó không BAO GIỜ tạo ra tổ hợp này, nhưng đây là
  // một bất biến phải đúng ở TẦNG ĐỌC, không phụ thuộc việc service có cố tạo ra tổ hợp đó hay không).
  describe('Bản dịch KHÔNG BAO GIỜ vượt qua cổng công khai của tin gốc', () => {
    it('tin gốc bị đóng (closed) trong khi bản dịch vẫn published → 404 cho CẢ HAI locale', async () => {
      await ds.query(`UPDATE job_listings SET status = 'closed' WHERE id = $1`, [jobId]);
      const en = await request(app.getHttpServer()).get(`/api/job-listings/${jobId}?locale=en`);
      const vi = await request(app.getHttpServer()).get(`/api/job-listings/${jobId}`);
      expect(en.status).toBe(404);
      expect(vi.status).toBe(404);
      // Khôi phục lại published để không ảnh hưởng gì tới test khác chạy sau (an toàn, không cần nhưng rõ ràng).
      await ds.query(`UPDATE job_listings SET status = 'published' WHERE id = $1`, [jobId]);
    });

    it('tin gốc đã hết hạn (expires_at ở quá khứ) trong khi bản dịch vẫn published → 404 cho locale=en', async () => {
      await ds.query(`UPDATE job_listings SET expires_at = '2000-01-01' WHERE id = $1`, [jobId]);
      const en = await request(app.getHttpServer()).get(`/api/job-listings/${jobId}?locale=en`);
      expect(en.status).toBe(404);
      await ds.query(`UPDATE job_listings SET expires_at = NULL WHERE id = $1`, [jobId]);
    });

    it('tin gốc đang rejected trong khi bản dịch vẫn published → 404 cho locale=en', async () => {
      await ds.query(`UPDATE job_listings SET status = 'rejected', published_at = NULL WHERE id = $1`, [jobId]);
      const en = await request(app.getHttpServer()).get(`/api/job-listings/${jobId}?locale=en`);
      expect(en.status).toBe(404);
      await ds.query(`UPDATE job_listings SET status = 'published', published_at = now() WHERE id = $1`, [jobId]);
    });
  });
});
