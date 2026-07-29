import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { TransformInterceptor } from '../src/common/interceptors/transform.interceptor';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';

// CẦN Postgres + Redis + migration đã chạy (gồm InitBooking/SeedBookingPermissions + ≥1 place
// published thuộc category hotel/restaurant/tour/event/transport — seed hiện có, ví dụ Hotel).
// Nếu không tìm thấy place khớp, các test phụ thuộc place bị bỏ qua (cùng quy ước
// places.e2e-spec.ts đã dùng cho "seed B7 chưa chạy").
describe('Bookings (e2e)', () => {
  let app: INestApplication;
  let ds: DataSource;
  let accessToken: string;
  let otherAccessToken: string;
  let placeId: string | null = null;
  const email = `e2e_booking_${Date.now()}@phuquochub.test`;
  const otherEmail = `e2e_booking_other_${Date.now()}@phuquochub.test`;
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

    const rows: Array<{ id: string }> = await ds.query(
      `SELECT p.id FROM places p JOIN categories c ON c.id = p.category_id
       WHERE c.slug = 'hotel' AND p.deleted_at IS NULL AND p.status = 'published'
       ORDER BY p.id ASC LIMIT 1`,
    );
    placeId = rows[0]?.id ?? null;

    const reg = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ email, password, display_name: 'E2E Booking User' });
    accessToken = reg.body.data.access_token;

    const reg2 = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ email: otherEmail, password, display_name: 'E2E Booking Other User' });
    otherAccessToken = reg2.body.data.access_token;
    // Timeout mặc định của Jest cho hook (5000ms) không đủ cho: compile+init toàn bộ AppModule
    // (kết nối Postgres+Redis thật) CỘNG hai lần register thật (mỗi lần băm bcrypt) — khác các
    // e2e-spec khác vốn chỉ compile+init trong beforeAll rồi register() bên trong từng `it`
    // riêng. Tăng timeout là cách Jest chính thức khuyến nghị cho việc setup hợp lệ chậm hơn
    // mặc định, KHÔNG phải che giấu lỗi.
  }, 30_000);

  afterAll(async () => {
    if (app) await app.close();
  });

  function validBody(overrides: Record<string, unknown> = {}) {
    return {
      entity_type: 'hotel',
      entity_id: placeId,
      place_id: placeId,
      party_size: 2,
      items: [{ label: 'Phòng Deluxe 1 đêm', quantity: 1, unit_price: 1500000 }],
      ...overrides,
    };
  }

  describe('POST /api/bookings', () => {
    it('không token → 401 (deny-by-default)', async () => {
      const res = await request(app.getHttpServer()).post('/api/bookings').send(validBody());
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('tạo booking với 1 item → 201, trạng thái ban đầu do server đặt, không lộ id/internal_note/customer_user_id', async () => {
      if (!placeId) return; // không có place hotel published nào trong seed hiện tại
      const res = await request(app.getHttpServer())
        .post('/api/bookings')
        .set('Authorization', `Bearer ${accessToken}`)
        .send(validBody());

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      const b = res.body.data;
      expect(b.booking_code).toEqual(expect.any(String));
      expect(b.booking_code.length).toBe(8);
      expect(b.booking_status).toBe('pending');
      expect(b.payment_status).toBe('unpaid');
      expect(b.fulfillment_status).toBe('pending');
      expect(b.subtotal).toBe(1500000);
      expect(b.grand_total).toBe(1500000);
      expect(b.items).toHaveLength(1);
      expect(b).not.toHaveProperty('id');
      expect(b).not.toHaveProperty('internal_note');
      expect(b).not.toHaveProperty('customer_user_id');
    });

    it('tạo booking với nhiều items → subtotal là tổng tất cả dòng', async () => {
      if (!placeId) return;
      const res = await request(app.getHttpServer())
        .post('/api/bookings')
        .set('Authorization', `Bearer ${accessToken}`)
        .send(
          validBody({
            items: [
              { label: 'Phòng Deluxe 1 đêm', quantity: 2, unit_price: 1500000 },
              { label: 'Phụ thu giường phụ', quantity: 1, unit_price: 200000 },
            ],
          }),
        );

      expect(res.status).toBe(201);
      expect(res.body.data.items).toHaveLength(2);
      expect(res.body.data.subtotal).toBe(3200000);
      expect(res.body.data.grand_total).toBe(3200000);
    });

    it('items rỗng → 400', async () => {
      if (!placeId) return;
      const res = await request(app.getHttpServer())
        .post('/api/bookings')
        .set('Authorization', `Bearer ${accessToken}`)
        .send(validBody({ items: [] }));
      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('quantity = 0 → 400', async () => {
      if (!placeId) return;
      const res = await request(app.getHttpServer())
        .post('/api/bookings')
        .set('Authorization', `Bearer ${accessToken}`)
        .send(validBody({ items: [{ label: 'X', quantity: 0, unit_price: 1000 }] }));
      expect(res.status).toBe(400);
    });

    it('service_end_at trước service_start_at → 400', async () => {
      if (!placeId) return;
      const res = await request(app.getHttpServer())
        .post('/api/bookings')
        .set('Authorization', `Bearer ${accessToken}`)
        .send(
          validBody({
            service_start_at: '2026-08-02T00:00:00Z',
            service_end_at: '2026-08-01T00:00:00Z',
          }),
        );
      expect(res.status).toBe(400);
    });

    it('unit_price âm → 400', async () => {
      if (!placeId) return;
      const res = await request(app.getHttpServer())
        .post('/api/bookings')
        .set('Authorization', `Bearer ${accessToken}`)
        .send(validBody({ items: [{ label: 'X', quantity: 1, unit_price: -1 }] }));
      expect(res.status).toBe(400);
    });

    it('client tự gửi booking_status → 400 (trạng thái do server kiểm soát, không có trên DTO)', async () => {
      if (!placeId) return;
      const res = await request(app.getHttpServer())
        .post('/api/bookings')
        .set('Authorization', `Bearer ${accessToken}`)
        .send(validBody({ booking_status: 'confirmed' }));
      expect(res.status).toBe(400);
    });

    it('entity_type không khớp category thật của place_id → 422', async () => {
      if (!placeId) return;
      const res = await request(app.getHttpServer())
        .post('/api/bookings')
        .set('Authorization', `Bearer ${accessToken}`)
        .send(validBody({ entity_type: 'tour' }));
      expect(res.status).toBe(422);
    });
  });

  describe('GET /api/bookings/:bookingCode', () => {
    it('không token → 401', async () => {
      const res = await request(app.getHttpServer()).get('/api/bookings/ABCD2345');
      expect(res.status).toBe(401);
    });

    it('mã không tồn tại (đúng định dạng) → 404 envelope', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/bookings/ABCD2345')
        .set('Authorization', `Bearer ${accessToken}`);
      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });

    it('mã sai định dạng → 400 (validate trước khi chạm DB)', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/bookings/not-a-valid-code')
        .set('Authorization', `Bearer ${accessToken}`);
      expect(res.status).toBe(400);
    });

    // Tạo DUY NHẤT 1 booking dùng chung cho cả hai test dưới đây (thay vì mỗi test tự POST) —
    // POST /api/bookings bị throttle 10/phút (bookings.controller.ts); tạo lại thêm ở đây từng
    // đẩy tổng số POST trong suite vượt hạn mức, khiến create thứ 11 nhận 429 thay vì 201
    // (đúng hành vi throttle, không phải lỗi endpoint — bài học từ lần chạy trước).
    let sharedBookingCode: string;

    it('đúng chủ booking → 200, trả lại đúng booking vừa tạo', async () => {
      if (!placeId) return;
      const created = await request(app.getHttpServer())
        .post('/api/bookings')
        .set('Authorization', `Bearer ${accessToken}`)
        .send(validBody());
      expect(created.status).toBe(201);
      sharedBookingCode = created.body.data.booking_code;

      const res = await request(app.getHttpServer())
        .get(`/api/bookings/${sharedBookingCode}`)
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.booking_code).toBe(sharedBookingCode);
    });

    it('booking thuộc người khác → 404 (không lộ tồn tại)', async () => {
      if (!placeId) return;

      const res = await request(app.getHttpServer())
        .get(`/api/bookings/${sharedBookingCode}`)
        .set('Authorization', `Bearer ${otherAccessToken}`);

      expect(res.status).toBe(404);
    });
  });
});
