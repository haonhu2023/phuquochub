import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { TransformInterceptor } from '../src/common/interceptors/transform.interceptor';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';

// CẦN Postgres(+PostGIS) + Redis + migration đã chạy (gồm InitPlaces + immutable_unaccent).
describe('Places/Geo/Search (e2e smoke)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.useGlobalInterceptors(new TransformInterceptor());
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  it('GET /api/places → envelope phân trang', async () => {
    const res = await request(app.getHttpServer()).get('/api/places');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(typeof res.body.meta.total).toBe('number');
  });

  it('GET /api/search?q=bien → FTS chạy (không lỗi 500)', async () => {
    const res = await request(app.getHttpServer()).get('/api/search').query({ q: 'bien' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('GET /api/geo/nearby → ST_DWithin chạy', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/geo/nearby')
      .query({ lat: 10.0, lng: 104.0, radius: 2000 });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('GET /api/places/:slug → chi tiết đủ contract (media/faqs/contacts/prices + scalar)', async () => {
    const res = await request(app.getHttpServer()).get('/api/places/bai-sao');
    if (res.status === 404) return; // seed B7 chưa chạy → bỏ qua
    expect(res.status).toBe(200);
    const d = res.body.data;
    expect(Array.isArray(d.media)).toBe(true);
    expect(Array.isArray(d.faqs)).toBe(true);
    expect(Array.isArray(d.contacts)).toBe(true);
    expect(Array.isArray(d.prices)).toBe(true);
    expect(d).toHaveProperty('address');
    expect(d).toHaveProperty('opening_hours');
    expect(d).toHaveProperty('osm_id');
  });

  it('GET /api/geo/bbox → điểm gom cụm (type cluster|place)', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/geo/bbox')
      .query({ minLng: 103.4, minLat: 9.8, maxLng: 104.2, maxLat: 10.5, zoom: 9 });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    for (const m of res.body.data) {
      expect(['cluster', 'place']).toContain(m.type);
    }
  });

  it('unaccent: search "phu quoc" ≡ "phú quốc" (cùng số kết quả)', async () => {
    const a = await request(app.getHttpServer()).get('/api/search').query({ q: 'phu quoc' });
    const b = await request(app.getHttpServer()).get('/api/search').query({ q: 'phú quốc' });
    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
    expect(a.body.data.length).toBe(b.body.data.length);
  });

  it('POST /api/places không token → 401 (deny-by-default)', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/places')
      .send({ name: 'X', category_id: '00000000-0000-0000-0000-000000000000', location: { lat: 10, lng: 104 } });
    expect(res.status).toBe(401);
  });
});
