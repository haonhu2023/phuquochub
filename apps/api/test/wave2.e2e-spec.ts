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

  it.each([['/api/hotels'], ['/api/restaurants'], ['/api/tours'], ['/api/events'], ['/api/events/calendar']])(
    'GET %s → 200 envelope',
    async (path) => {
      const res = await request(app.getHttpServer()).get(path);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    },
  );

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
