import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { TransformInterceptor } from '../src/common/interceptors/transform.interceptor';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';

// PLACE-021 (B1 / GAP-05 / GAP-10): contract tests for the RATIFIED offset pagination of
// GET /api/places. The pipe config MIRRORS production (main.ts): whitelist + transform +
// forbidNonWhitelisted — so deprecated/unknown params are rejected with 400 exactly as deployed.
// Needs Postgres(+PostGIS) + Redis with migrations applied.
describe('Places list — offset pagination contract (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    // Production-equivalent pipe (main.ts:19-21).
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }),
    );
    app.useGlobalInterceptors(new TransformInterceptor());
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  it('default pagination: no params → 200, meta.page=1, meta.pageSize=20', async () => {
    const res = await request(app.getHttpServer()).get('/api/places');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.meta.page).toBe(1);
    expect(res.body.meta.pageSize).toBe(20);
  });

  it('pagination metadata shape: page, pageSize, total, totalPages, timestamp', async () => {
    const res = await request(app.getHttpServer()).get('/api/places');
    expect(res.status).toBe(200);
    const m = res.body.meta;
    expect(typeof m.page).toBe('number');
    expect(typeof m.pageSize).toBe('number');
    expect(typeof m.total).toBe('number');
    expect(typeof m.totalPages).toBe('number');
    expect(typeof m.timestamp).toBe('string');
    // totalPages = ceil(total / pageSize) — the documented invariant.
    expect(m.totalPages).toBe(m.pageSize > 0 ? Math.ceil(m.total / m.pageSize) : 0);
    // data length never exceeds the page size.
    expect(res.body.data.length).toBeLessThanOrEqual(m.pageSize);
  });

  it('explicit valid page & limit → 200, meta reflects them', async () => {
    const res = await request(app.getHttpServer()).get('/api/places').query({ page: 2, limit: 5 });
    expect(res.status).toBe(200);
    expect(res.body.meta.page).toBe(2);
    expect(res.body.meta.pageSize).toBe(5);
    expect(res.body.data.length).toBeLessThanOrEqual(5);
  });

  it('limit > 100 is clamped to 100 (200, not rejected)', async () => {
    const res = await request(app.getHttpServer()).get('/api/places').query({ limit: 500 });
    expect(res.status).toBe(200);
    expect(res.body.meta.pageSize).toBe(100);
  });

  it('invalid page (0) → 400 VALIDATION_ERROR', async () => {
    const res = await request(app.getHttpServer()).get('/api/places').query({ page: 0 });
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('invalid page (non-integer) → 400', async () => {
    const res = await request(app.getHttpServer()).get('/api/places').query({ page: 'abc' });
    expect(res.status).toBe(400);
  });

  it('invalid limit (0) → 400', async () => {
    const res = await request(app.getHttpServer()).get('/api/places').query({ limit: 0 });
    expect(res.status).toBe(400);
  });

  // Deprecated / unimplemented params (OD-B1 / ADR-010): documented deprecated, rejected 400.
  it.each(['status', 'sort', 'cursor'])('deprecated param "%s" → 400 (forbidNonWhitelisted)', async (p) => {
    const res = await request(app.getHttpServer())
      .get('/api/places')
      .query({ [p]: p === 'status' ? 'published' : 'x' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('valid filter param (category) is accepted → 200', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/places')
      .query({ category: '00000000-0000-0000-0000-000000000000' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});
