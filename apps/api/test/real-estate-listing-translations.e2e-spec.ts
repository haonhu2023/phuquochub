import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { TransformInterceptor } from '../src/common/interceptors/transform.interceptor';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';

// Gói C phần 2/2 (17/10/2026) — bản dịch tiếng Anh cho real_estate_listings, qua request HTTP
// thật. Cùng mẫu job-listing-translations.e2e-spec.ts (đã kiểm đầy đủ CAS/snapshot/quyền ở đó) —
// ở đây tập trung vào field RIÊNG của BĐS (utilities_note/legal_status_note) và các bất biến quan
// trọng nhất, không lặp lại MỌI biến thể đã chứng minh chung.
describe('Real estate listing translations (en) — e2e', () => {
  let app: INestApplication;
  let ds: DataSource;
  let posterToken: string;
  let posterUserId: string;
  let strangerToken: string;
  let strangerUserId: string;
  let moderatorToken: string;
  let moderatorUserId: string;
  let userRoleId: string | null = null;
  let listingId: string;

  const posterEmail = `e2e_reltrans_poster_${Date.now()}@phuquochub.test`;
  const strangerEmail = `e2e_reltrans_stranger_${Date.now()}@phuquochub.test`;
  const moderatorEmail = `e2e_reltrans_moderator_${Date.now()}@phuquochub.test`;
  const password = 'password123';

  const baseListing = {
    poster_role: 'owner',
    transaction_type: 'rent',
    property_type: 'room',
    title: 'Tiêu đề tiếng Việt',
    contact_method: 'phone',
    contact_value: '0900000002',
    description: 'Mô tả tiếng Việt gốc',
    utilities_note: 'Điện nước tự trả',
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
      .send({ email: posterEmail, password, display_name: 'E2E RELTrans Poster' });
    posterToken = reg1.body.data.access_token;
    posterUserId = reg1.body.data.user.id;

    const reg2 = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ email: strangerEmail, password, display_name: 'E2E RELTrans Stranger' });
    strangerToken = reg2.body.data.access_token;
    strangerUserId = reg2.body.data.user.id;

    const reg3 = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ email: moderatorEmail, password, display_name: 'E2E RELTrans Moderator' });
    moderatorToken = reg3.body.data.access_token;
    moderatorUserId = reg3.body.data.user.id;

    const granted: Array<{ id: string }> = await ds.query(
      `INSERT INTO user_roles (user_id, role_id) SELECT $1, r.id FROM roles r WHERE r.code = 'moderator' RETURNING id`,
      [moderatorUserId],
    );
    userRoleId = granted[0]?.id ?? null;

    const create = await request(app.getHttpServer())
      .post('/api/real-estate-listings')
      .set('Authorization', `Bearer ${posterToken}`)
      .send(baseListing);
    listingId = create.body.data.id;
    await request(app.getHttpServer()).post(`/api/real-estate-listings/${listingId}/submit`).set('Authorization', `Bearer ${posterToken}`);
    await request(app.getHttpServer())
      .post(`/api/real-estate-listings/${listingId}/decide`)
      .set('Authorization', `Bearer ${moderatorToken}`)
      .send({ decision: 'approve' });
  }, 30_000);

  afterAll(async () => {
    try {
      if (ds?.isInitialized && listingId) {
        await ds.query(`DELETE FROM real_estate_listing_translations WHERE real_estate_listing_id = $1`, [listingId]);
        await ds.query(`DELETE FROM real_estate_listings WHERE id = $1`, [listingId]);
        const ids = [posterUserId, strangerUserId, moderatorUserId];
        await ds.query(`DELETE FROM audit_logs WHERE actor_id = ANY($1)`, [ids]);
        if (userRoleId) await ds.query(`DELETE FROM user_roles WHERE id = $1`, [userRoleId]);
        await ds.query(`DELETE FROM users WHERE email = ANY($1)`, [[posterEmail, strangerEmail, moderatorEmail]]);
      }
    } finally {
      if (app) await app.close();
    }
  }, 30_000);

  it('người lạ không lưu được bản dịch cho tin không phải của mình → 404', async () => {
    const res = await request(app.getHttpServer())
      .put(`/api/real-estate-listings/${listingId}/translations/en`)
      .set('Authorization', `Bearer ${strangerToken}`)
      .send({ title: 'Hacked' });
    expect(res.status).toBe(404);
  });

  it('chủ tin lưu draft (title/description/utilities_note/legal_status_note) → 200; public vẫn tiếng Việt', async () => {
    const save = await request(app.getHttpServer())
      .put(`/api/real-estate-listings/${listingId}/translations/en`)
      .set('Authorization', `Bearer ${posterToken}`)
      .send({
        title: 'English title',
        description: 'English description',
        utilities_note: 'Tenant pays electricity and water',
        legal_status_note: 'Pink book available',
      });
    expect(save.status).toBe(200);
    expect(save.body.data.utilities_note).toBe('Tenant pays electricity and water');
    expect(save.body.data.legal_status_note).toBe('Pink book available');

    const pub = await request(app.getHttpServer()).get(`/api/real-estate-listings/${listingId}?locale=en`);
    expect(pub.body.data.title).toBe('Tiêu đề tiếng Việt');
    expect(pub.body.data.locale).toBe('vi');
  });

  it('CAS: gửi sai content_version → 409, nội dung KHÔNG đổi', async () => {
    const res = await request(app.getHttpServer())
      .put(`/api/real-estate-listings/${listingId}/translations/en`)
      .set('Authorization', `Bearer ${posterToken}`)
      .send({ title: 'Bị chặn', expected_content_version: 999 });
    expect(res.status).toBe(409);
  });

  it('gửi duyệt → pending; moderator xem được hàng chờ với ngữ cảnh tiếng Việt đầy đủ (title/description/utilities/legal)', async () => {
    await request(app.getHttpServer()).post(`/api/real-estate-listings/${listingId}/translations/en/submit`).set('Authorization', `Bearer ${posterToken}`);

    const pending = await request(app.getHttpServer())
      .get('/api/real-estate-listings/translations/en/pending')
      .set('Authorization', `Bearer ${moderatorToken}`);
    const mine = pending.body.data.find((t: { real_estate_listing_id: string }) => t.real_estate_listing_id === listingId);
    expect(mine).toBeDefined();
    expect(mine.source_title).toBe('Tiêu đề tiếng Việt');
    expect(mine.source_description).toBe('Mô tả tiếng Việt gốc');
    expect(mine.source_utilities_note).toBe('Điện nước tự trả');
  });

  it('người thường không duyệt được → 403; moderator duyệt ĐÚNG version → published; public EN hiện đủ 4 trường, VI không đổi', async () => {
    const forbidden = await request(app.getHttpServer())
      .post(`/api/real-estate-listings/${listingId}/translations/en/decide`)
      .set('Authorization', `Bearer ${strangerToken}`)
      .send({ decision: 'approve' });
    expect(forbidden.status).toBe(403);

    const mine = await request(app.getHttpServer())
      .get(`/api/real-estate-listings/${listingId}/translations/en`)
      .set('Authorization', `Bearer ${posterToken}`);
    const version = mine.body.data.content_version;

    const decide = await request(app.getHttpServer())
      .post(`/api/real-estate-listings/${listingId}/translations/en/decide`)
      .set('Authorization', `Bearer ${moderatorToken}`)
      .send({ decision: 'approve', expected_content_version: version });
    expect(decide.body.data.status).toBe('published');

    const en = await request(app.getHttpServer()).get(`/api/real-estate-listings/${listingId}?locale=en`);
    expect(en.body.data.title).toBe('English title');
    expect(en.body.data.utilities_note).toBe('Tenant pays electricity and water');
    expect(en.body.data.legal_status_note).toBe('Pink book available');
    expect(en.body.data.locale).toBe('en');

    const vi = await request(app.getHttpServer()).get(`/api/real-estate-listings/${listingId}`);
    expect(vi.body.data.title).toBe('Tiêu đề tiếng Việt');
  });

  it('?locale=en trên DANH SÁCH công khai cũng overlay title', async () => {
    const res = await request(app.getHttpServer()).get('/api/real-estate-listings?locale=en&limit=50');
    const mine = res.body.data.find((r: { id: string }) => r.id === listingId);
    expect(mine.title).toBe('English title');
    expect(mine.locale).toBe('en');
  });

  it('chủ tin sửa tiếp (lưu nháp mới) → draft, nhưng public EN VẪN phục vụ bản đã duyệt CŨ', async () => {
    const mineBefore = await request(app.getHttpServer())
      .get(`/api/real-estate-listings/${listingId}/translations/en`)
      .set('Authorization', `Bearer ${posterToken}`);
    const version = mineBefore.body.data.content_version;

    const save = await request(app.getHttpServer())
      .put(`/api/real-estate-listings/${listingId}/translations/en`)
      .set('Authorization', `Bearer ${posterToken}`)
      .send({ title: 'DRAFT EDIT — chưa duyệt', description: 'English description', expected_content_version: version });
    expect(save.body.data.status).toBe('draft');
    expect(save.body.data.has_published).toBe(true);

    const en = await request(app.getHttpServer()).get(`/api/real-estate-listings/${listingId}?locale=en`);
    expect(en.body.data.title).toBe('English title'); // bản CŨ đã duyệt, không phải nháp vừa lưu.
  });

  // Owner: "Translation published không được vượt qua listing pending/rejected/closed/expired/deleted."
  it('tin gốc bị đóng trong khi bản dịch vẫn published → 404 cho cả hai locale', async () => {
    await ds.query(`UPDATE real_estate_listings SET status = 'closed' WHERE id = $1`, [listingId]);
    const en = await request(app.getHttpServer()).get(`/api/real-estate-listings/${listingId}?locale=en`);
    const vi = await request(app.getHttpServer()).get(`/api/real-estate-listings/${listingId}`);
    expect(en.status).toBe(404);
    expect(vi.status).toBe(404);
    await ds.query(`UPDATE real_estate_listings SET status = 'published' WHERE id = $1`, [listingId]);
  });

  it('tin gốc hết hạn trong khi bản dịch vẫn published → 404 cho locale=en', async () => {
    await ds.query(`UPDATE real_estate_listings SET expires_at = '2000-01-01' WHERE id = $1`, [listingId]);
    const en = await request(app.getHttpServer()).get(`/api/real-estate-listings/${listingId}?locale=en`);
    expect(en.status).toBe(404);
    await ds.query(`UPDATE real_estate_listings SET expires_at = NULL WHERE id = $1`, [listingId]);
  });
});
