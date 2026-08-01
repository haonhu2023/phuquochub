import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { TransformInterceptor } from '../src/common/interceptors/transform.interceptor';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';

// CẦN Postgres(+PostGIS) + Redis + migration Wave-2 đã chạy.
describe('Wave 2 — Hotel/Restaurant/Tour/Event (e2e smoke)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    app.useGlobalInterceptors(new TransformInterceptor());
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  // /api/transports + /api/transport-types thêm ở đây (không phải "Wave 2") vì đây là harness
  // e2e sẵn có rẻ nhất — ADR-017 chưa cần một describe block riêng cho hai route đọc tối thiểu.
  it.each([
    ['/api/hotels'],
    ['/api/restaurants'],
    ['/api/tours'],
    ['/api/events'],
    ['/api/events/calendar'],
    ['/api/transports'],
    ['/api/transport-types'],
  ])('GET %s → 200 envelope', async (path) => {
    const res = await request(app.getHttpServer()).get(path);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('GET /api/transports/khong-ton-tai → 404 envelope (slug không hợp lệ)', async () => {
    const res = await request(app.getHttpServer()).get('/api/transports/khong-ton-tai');
    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });

  // Transport Browse Filters (2026-07-30) — transport_type/ward/pricing_model/booking_required/
  // airport_transfer nay ĐÃ hỗ trợ (trước đây từ chối 400, xem báo cáo TRANSPORT-BROWSE-FILTERS).
  it('GET /api/transports?transport_type=taxi → 200 (đã hỗ trợ, không còn hoãn)', async () => {
    const res = await request(app.getHttpServer()).get('/api/transports?transport_type=taxi');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('GET /api/transports?ward=Dương Đông&booking_required=false&airport_transfer=true → 200, kết hợp nhiều filter', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/transports')
      .query({ ward: 'Dương Đông', booking_required: 'false', airport_transfer: 'true' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('GET /api/transports?pricing_model=per_minute → 400 (ngoài enum pricing_model)', async () => {
    const res = await request(app.getHttpServer()).get('/api/transports?pricing_model=per_minute');
    expect(res.status).toBe(400);
  });

  it('GET /api/transports?booking_required=yes → 400 (không phải "true"/"false", không âm thầm coerce)', async () => {
    const res = await request(app.getHttpServer()).get('/api/transports?booking_required=yes');
    expect(res.status).toBe(400);
  });

  it('GET /api/transports?category=hotel → 400 (vẫn hoãn/không hỗ trợ — đã là chính endpoint này)', async () => {
    const res = await request(app.getHttpServer()).get('/api/transports?category=hotel');
    expect(res.status).toBe(400);
  });

  it('POST /api/events không token → 401 (deny-by-default, Event.Create)', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/events')
      .send({ title: 'X', start_at: '2026-08-01T00:00:00Z', end_at: '2026-08-02T00:00:00Z' });
    expect(res.status).toBe(401);
  });

  it('POST /api/tours không token → 401 (Place.Create)', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/tours')
      .send({ name: 'X', location: { lat: 10, lng: 104 }, tour_type: 'sightseeing' });
    expect(res.status).toBe(401);
  });
});
