import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { TransformInterceptor } from '../src/common/interceptors/transform.interceptor';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';

// PLACE-024 (B4 / OD-B4 / F-35): GET /api/search must NOT expose the internal Postgres ts_rank
// (`score`) in its public payload, while server-side relevance ordering (ts_rank DESC, id ASC in
// places.repository.ts) stays exactly as before. This spec proves: no score/rank key anywhere in
// the response, the same result-id order as the pre-change baseline, and unchanged pagination
// metadata + empty-result shape. Needs Postgres(+PostGIS) + Redis with migrations + seed applied.
describe('Public search contract — no internal rank leaked (e2e, F-35)', () => {
  let app: INestApplication;

  // Captured against the pre-PLACE-024 build (score present, same seed data, same query/params).
  // The mapping/service change is ordering-preserving: this is the exact id sequence the OLD code
  // returned for `q=bien&limit=20`, `q=phu quoc&limit=20`, and `q=bien&page=2&limit=3`.
  const BASELINE_BIEN_IDS = [
    'cad1a614-f8b1-4905-8408-fbe40b7684be',
    'f54bfea4-34c4-4f76-95e8-579419d7e92b',
    '0f710d41-84ea-4725-bac7-bc1e918fd8bf',
    '10a8462d-fe5c-41fb-aff6-7613ac2741bb',
    '20090df6-b82f-494d-94e5-26384e4787f8',
    '2897f9df-4be0-4717-99c7-fcdc121183a4',
    '4674c727-f4a5-4132-bf63-eb9260f4d8c7',
    '48cb94e7-2f4c-4bbe-a222-537c1af0848a',
    '5237d5ff-6e8d-4aa9-a369-0eb1b014cc8a',
    '5b04e6e9-7dae-45b2-bc7f-3bbc9222d5f6',
    '5f85b3c0-f911-4cc6-8b64-d42f449d2ea2',
    '74ec766b-497a-4083-94e4-23200867526a',
    '89402b36-596e-4b70-b289-9b8fcca0f98e',
    '8a8f2cfc-ee46-43a1-b79d-9cb82ce00d1e',
    'bf3af8da-7013-4db4-8818-73b7b5d50167',
    'cea3ff98-2e98-419d-a0fc-185214354514',
    'd02f712e-a8ae-4ffe-8f05-2da6f6c170b4',
    'd99e2203-abfc-4a66-954c-eeef272f66f7',
    'f40b31d4-4d2f-475b-8598-77c86989acbf',
    'fa5fd3c3-56e5-4d73-8ae3-3d1a3cb20167',
  ];
  const BASELINE_PHUQUOC_IDS = [
    '1115e9a3-f5b7-4858-bb69-76ee2c74f1ad',
    '5ed95ac9-363f-4a37-8cbd-f78a5771016f',
    '74ec766b-497a-4083-94e4-23200867526a',
    'febcdf13-aacc-411e-8ace-b8ca6f7102a7',
    '0849e982-eea9-42c6-ba4d-14cba72569f0',
    '0f710d41-84ea-4725-bac7-bc1e918fd8bf',
    '10a8462d-fe5c-41fb-aff6-7613ac2741bb',
    '8a8f2cfc-ee46-43a1-b79d-9cb82ce00d1e',
    '4d446fc7-c461-44c9-8be1-98c8430b9817',
    'bf3af8da-7013-4db4-8818-73b7b5d50167',
    'f7a11563-fe3d-4c4c-8fbe-7e5f00c99ea5',
    '9e877034-1c64-4684-9402-ab7187f47d97',
    '01d0211b-9977-4839-a033-3cb14c1a2fe5',
    '312a978d-3aa9-4c27-8047-5cf866f70fce',
    '5237d5ff-6e8d-4aa9-a369-0eb1b014cc8a',
    '5f85b3c0-f911-4cc6-8b64-d42f449d2ea2',
    '93366fb7-ff69-48de-9819-fb6e01c3bb4e',
    'b85b5d98-39fb-4cf1-974f-6a92c86392fc',
    'cad1a614-f8b1-4905-8408-fbe40b7684be',
    'd089446f-3823-438e-9c12-1961305d6e61',
  ];
  const BASELINE_PAGE2_IDS = [
    '10a8462d-fe5c-41fb-aff6-7613ac2741bb',
    '20090df6-b82f-494d-94e5-26384e4787f8',
    '2897f9df-4be0-4717-99c7-fcdc121183a4',
  ];

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
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

  // Recursively assert no key named score/rank/ts_rank/searchRank appears anywhere in the payload,
  // at any nesting depth — not just the top level of each result object.
  function assertNoRankKeyDeep(value: unknown, path = 'root'): void {
    if (value === null || typeof value !== 'object') return;
    if (Array.isArray(value)) {
      value.forEach((v, i) => assertNoRankKeyDeep(v, `${path}[${i}]`));
      return;
    }
    for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
      const leaked = /^(score|rank|ts_rank|searchrank)$/i.test(key);
      expect({ path: `${path}.${key}`, leaked }).toEqual({ path: `${path}.${key}`, leaked: false });
      assertNoRankKeyDeep(v, `${path}.${key}`);
    }
  }

  it('normal query: no score/rank key anywhere; id order matches the pre-change baseline', async () => {
    const res = await request(app.getHttpServer()).get('/api/search').query({ q: 'bien', limit: 20 });
    expect(res.status).toBe(200);
    assertNoRankKeyDeep(res.body);
    expect(res.body.data.map((r: { id: string }) => r.id)).toEqual(BASELINE_BIEN_IDS);
    expect(res.body.data.every((r: object) => Object.keys(r).sort().join(',') === 'id,slug,snippet,title,type')).toBe(true);
  });

  it('second query (unaccent): no score/rank key; id order matches the pre-change baseline', async () => {
    const res = await request(app.getHttpServer()).get('/api/search').query({ q: 'phu quoc', limit: 20 });
    expect(res.status).toBe(200);
    assertNoRankKeyDeep(res.body);
    expect(res.body.data.map((r: { id: string }) => r.id)).toEqual(BASELINE_PHUQUOC_IDS);
  });

  it('explicit pagination (page 2, limit 3): no score/rank key; order + meta match the baseline', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/search')
      .query({ q: 'bien', page: 2, limit: 3 });
    expect(res.status).toBe(200);
    assertNoRankKeyDeep(res.body);
    expect(res.body.data.map((r: { id: string }) => r.id)).toEqual(BASELINE_PAGE2_IDS);
    expect(res.body.meta).toMatchObject({ page: 2, pageSize: 3, total: 20, totalPages: 7 });
  });

  it('no-result query: preserves the existing empty-response shape', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/search')
      .query({ q: 'zzzznoresultzzzz' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toEqual([]);
    expect(res.body.meta).toMatchObject({ page: 1, pageSize: 20, total: 0, totalPages: 0 });
    assertNoRankKeyDeep(res.body);
  });

  it('repeated identical query returns byte-identical output (no nondeterminism introduced)', async () => {
    const a = await request(app.getHttpServer()).get('/api/search').query({ q: 'bien', limit: 20 });
    const b = await request(app.getHttpServer()).get('/api/search').query({ q: 'bien', limit: 20 });
    const c = await request(app.getHttpServer()).get('/api/search').query({ q: 'bien', limit: 20 });
    const strip = (r: { body: unknown }) => JSON.stringify((r.body as { data: unknown }).data);
    expect(new Set([strip(a), strip(b), strip(c)]).size).toBe(1);
  });

  it('suggest endpoint also has no score/rank key (shares the same repository row)', async () => {
    const res = await request(app.getHttpServer()).get('/api/search/suggest').query({ q: 'bien' });
    expect(res.status).toBe(200);
    assertNoRankKeyDeep(res.body);
  });
});
