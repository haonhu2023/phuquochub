import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { TransformInterceptor } from '../src/common/interceptors/transform.interceptor';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { PlacesRepository } from '../src/modules/places/repositories/places.repository';

// PLACE-024 (B4 / OD-B4 / F-35): GET /api/search must NOT expose the internal Postgres ts_rank
// (`score`) in its public payload, while server-side relevance ordering (ts_rank DESC, id ASC in
// places.repository.ts) stays exactly as before. This spec proves: no score/rank key anywhere in
// the response, that the HTTP layer preserves the repository's row order exactly, and unchanged
// pagination metadata + empty-result shape. Needs Postgres(+PostGIS) + Redis with migrations +
// seed applied.
describe('Public search contract — no internal rank leaked (e2e, F-35)', () => {
  let app: INestApplication;
  let placesRepository: PlacesRepository;

  // Expected ids are read from the repository of the SAME database this spec is running against,
  // never hard-coded.
  //
  // `places.id` is `uuid PRIMARY KEY DEFAULT gen_random_uuid()`
  // (1720000400000-InitPlaces.ts), and neither seed migration passes an id
  // (1720000900000-SeedInitialPlaces.ts, 1720001600000-SeedPlacesExpansion.ts insert explicit
  // column lists without `id`). Every freshly migrated database therefore mints different uuids,
  // so a literal id list captured from one database is meaningless in another — that is exactly
  // why the previous hard-coded baselines failed on CI's fresh Postgres.
  //
  // The public contract never promised particular uuid VALUES; what it promises is ORDER. The
  // invariant worth proving is that the HTTP layer hands back the repository's rows in exactly the
  // sequence the repository produced them (`ORDER BY score DESC, p.id ASC`), dropping only the
  // internal `score`. Comparing HTTP against the repository in the same database proves precisely
  // that, and keeps proving it if the seed data ever changes.
  //
  // Neither side is sorted before comparison: the sequence IS the assertion. Sorting would mask a
  // reordering regression, which is the specific bug this file exists to catch.
  type SearchFilters = Parameters<PlacesRepository['searchFullText']>[3];

  async function expectedSearchIds(
    q: string,
    limit: number,
    offset: number,
    filters?: SearchFilters,
  ): Promise<string[]> {
    const rows = await placesRepository.searchFullText(q, limit, offset, filters);
    return rows.map((row) => row.id);
  }

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
    // Same instance the HTTP request path resolves, so both sides read one database.
    placesRepository = app.get(PlacesRepository);
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

  it('normal query: no score/rank key anywhere; id order matches the repository exactly', async () => {
    const expected = await expectedSearchIds('bien', 20, 0);
    const res = await request(app.getHttpServer())
      .get('/api/search')
      .query({ q: 'bien', limit: 20 });
    expect(res.status).toBe(200);
    assertNoRankKeyDeep(res.body);
    // Guard against a vacuous pass: an empty seed would make any order comparison trivially true.
    expect(expected.length).toBeGreaterThan(0);
    expect(res.body.data.map((r: { id: string }) => r.id)).toEqual(expected);
    expect(
      res.body.data.every(
        (r: object) => Object.keys(r).sort().join(',') === 'id,slug,snippet,title,type',
      ),
    ).toBe(true);
  });

  it('second query (unaccent): no score/rank key; id order matches the repository exactly', async () => {
    const expected = await expectedSearchIds('phu quoc', 20, 0);
    const res = await request(app.getHttpServer())
      .get('/api/search')
      .query({ q: 'phu quoc', limit: 20 });
    expect(res.status).toBe(200);
    assertNoRankKeyDeep(res.body);
    expect(expected.length).toBeGreaterThan(0);
    expect(res.body.data.map((r: { id: string }) => r.id)).toEqual(expected);
  });

  it('explicit pagination (page 2, limit 3): no score/rank key; order + meta match', async () => {
    // `page=2, limit=3` is exactly `limit=3, offset=3` at the repository — the same arithmetic
    // SearchService performs — so this also pins that OFFSET paging is applied to the same order.
    const expected = await expectedSearchIds('bien', 3, 3);
    const res = await request(app.getHttpServer())
      .get('/api/search')
      .query({ q: 'bien', page: 2, limit: 3 });
    expect(res.status).toBe(200);
    assertNoRankKeyDeep(res.body);
    expect(expected).toHaveLength(3);
    expect(res.body.data.map((r: { id: string }) => r.id)).toEqual(expected);
    // Seed-content derived, not uuid derived: the seed inserts a fixed set of rows, so the number
    // of 'bien' matches is stable across fresh databases even though their uuids are not.
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

  // Search Filters (category/ward/price_range) — added on top of the existing FTS contract.
  // Correctness is proven structurally, against an unfiltered baseline read from the same database
  // in the same run: a filtered result set must always be a subset of the unfiltered one, never a
  // superset, must strictly narrow it, and must never leak the ts_rank/score key.
  describe('Search Filters (category/ward/price_range)', () => {
    it('ward filter strictly narrows results: every filtered id is in the unfiltered set, count < unfiltered', async () => {
      // Unfiltered baseline for the SAME query, taken in this run rather than from a literal list.
      const unfiltered = await request(app.getHttpServer())
        .get('/api/search')
        .query({ q: 'bien', limit: 20 });
      expect(unfiltered.status).toBe(200);
      const unfilteredIds: string[] = unfiltered.body.data.map((r: { id: string }) => r.id);
      // The subset check below is only sound if this page holds the WHOLE unfiltered result set;
      // otherwise a filtered row could legitimately sit on a page we never fetched.
      expect(unfilteredIds).toHaveLength(unfiltered.body.meta.total);

      const res = await request(app.getHttpServer())
        .get('/api/search')
        .query({ q: 'bien', limit: 20, ward: 'Dương Đông' });
      expect(res.status).toBe(200);
      assertNoRankKeyDeep(res.body);
      const ids: string[] = res.body.data.map((r: { id: string }) => r.id);

      // Strict `<`, not `<=`: proves the filter actually narrows. A `<=` bound alone would still
      // pass if the filter silently became a no-op. Compared on `meta.total` as well as on the
      // returned page, so the narrowing is asserted about the whole result set, not just one page.
      expect(ids.length).toBeGreaterThan(0);
      expect(res.body.meta.total).toBeLessThan(unfiltered.body.meta.total);
      expect(ids.length).toBeLessThan(unfilteredIds.length);
      const unfilteredSet = new Set(unfilteredIds);
      expect(ids.every((id) => unfilteredSet.has(id))).toBe(true);
    });

    it('invalid price_range value is rejected (400) — same validation boundary as ListPlacesQueryDto', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/search')
        .query({ q: 'bien', price_range: 'ultra-luxury' });
      expect(res.status).toBe(400);
    });

    it('a filter combination matching nothing real returns the existing empty-response shape', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/search')
        .query({ q: 'bien', ward: 'Ward-Does-Not-Exist-XYZ' });
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toEqual([]);
      expect(res.body.meta).toMatchObject({ total: 0, totalPages: 0 });
      assertNoRankKeyDeep(res.body);
    });

    it('omitting all filters still reproduces the unfiltered repository order (backward-compat)', async () => {
      // Adding filter support must not have changed the no-filter path: with every filter omitted
      // the endpoint must still return the plain unfiltered repository sequence, in order.
      const expected = await expectedSearchIds('bien', 20, 0);
      const res = await request(app.getHttpServer())
        .get('/api/search')
        .query({ q: 'bien', limit: 20 });
      expect(res.status).toBe(200);
      expect(expected.length).toBeGreaterThan(0);
      expect(res.body.data.map((r: { id: string }) => r.id)).toEqual(expected);
    });
  });
});
