import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { TransformInterceptor } from '../src/common/interceptors/transform.interceptor';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';

// PLACE-023 (B3 / F-34): GET /api/geo/bbox clusters are truncated with LIMIT 500. After adding
// `ORDER BY cnt DESC, sample_id ASC` before LIMIT, the truncation — and therefore the whole result
// — must be DETERMINISTIC. This spec proves it against the real DB: repeated executions return
// byte-identical output, densest-first ordering (cnt DESC), and a unique tie-break (sample_id ASC).
// Needs Postgres(+PostGIS) + Redis with migrations + seed applied.
//
// CROSS-SUITE RACE (found + fixed, 2026-08-11): the bbox below covers ~all of Phú Quốc, and a dozen
// OTHER e2e files (business-claims*, business-managers, business-transfer, verifications*,
// authz-scoped-*, moderation-review-decision) insert/delete their own throwaway `published` places
// at the exact same point (103.9, 10.2) — squarely inside this envelope — as part of their own
// fixtures. `bboxClusters()` itself is provably deterministic for a FIXED snapshot (stable
// `ORDER BY cnt DESC, sample_id ASC`, sample_id = min place id per cell — see
// PlacesRepository.bboxClusters()); the flakiness was the INPUT changing mid-test, not the query:
// under Jest's default parallel-file execution, one of those other suites can insert/delete a place
// inside this bbox between two of this test's five sequential requests, changing which cells exist
// for exactly one of the five snapshots. `ward` narrows the query to ONLY real seed places (all
// versioned in SeedInitialPlaces/SeedPlacesExpansion, `ward` always set) — none of the throwaway
// e2e fixtures across the whole repo ever set `ward` (confirmed: `INSERT INTO places (name, slug,
// category_id, location, status) ...` never includes it, so it's NULL), so this filter makes the
// dataset immune to ALL of that noise while still exercising the real deterministic-clustering
// behavior end-to-end. Chosen ward (14 real places) still yields multi-point clusters at zoom=9 and
// a mix of singleton/tied cells at zoom=14 — verified directly against the seed data before this
// change (2 cells at zoom=9: 13+1; 7 cells at zoom=14 incl. a cnt=2 tie and four cnt=1 singletons).
const SEED_WARD = 'Dương Đông';

describe('Geo bbox clusters — deterministic truncation (e2e, F-34)', () => {
  let app: INestApplication;
  // Envelope over Phú Quốc seed coordinates (lng ~103.85–104.05, lat ~10.02–10.33).
  const BBOX = { minLng: 103.4, minLat: 9.8, maxLng: 104.2, maxLat: 10.5, ward: SEED_WARD };

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

  type Item =
    | { type: 'cluster'; count: number; lng: number; lat: number }
    | { type: 'place'; id: string; slug: string; title: string; lng: number; lat: number };

  async function fetchBbox(zoom: number): Promise<Item[]> {
    const res = await request(app.getHttpServer())
      .get('/api/geo/bbox')
      .query({ ...BBOX, zoom });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    return res.body.data as Item[];
  }

  // Reconstruct the per-item cluster count: cluster→count, place→1 (single-point cell).
  const cntOf = (it: Item): number => (it.type === 'cluster' ? it.count : 1);

  // Run at a coarse zoom (some multi-point clusters) and a fine zoom (mostly single-point cells,
  // i.e. many cnt=1 ties broken by sample_id).
  it.each([9, 14])('zoom=%s: 5 consecutive runs return byte-identical output (deterministic)', async (zoom) => {
    const runs: string[] = [];
    for (let i = 0; i < 5; i++) {
      runs.push(JSON.stringify(await fetchBbox(zoom)));
    }
    // All five runs identical ⇒ deterministic ordering + identical counts + identical contents.
    expect(new Set(runs).size).toBe(1);
  });

  it('ordering is densest-first (cnt non-increasing across the returned sequence)', async () => {
    const data = await fetchBbox(14);
    const counts = data.map(cntOf);
    for (let i = 1; i < counts.length; i++) {
      expect(counts[i]).toBeLessThanOrEqual(counts[i - 1]);
    }
  });

  it('tie handling: within equal-cnt single-point cells, ids are strictly ascending (sample_id ASC)', async () => {
    const data = await fetchBbox(14);
    // Among cnt=1 cells the id IS the exposed sample_id; its order must be strictly ascending.
    const singleIds = data.filter((it): it is Extract<Item, { type: 'place' }> => it.type === 'place').map((it) => it.id);
    const ascending = [...singleIds].sort();
    expect(singleIds).toEqual(ascending);
    // And no duplicate cell survives (sample_id is unique per cell).
    expect(new Set(singleIds).size).toBe(singleIds.length);
  });

  it('identical total count of clusters across repeated runs (no arbitrary survivor drift)', async () => {
    const a = await fetchBbox(14);
    const b = await fetchBbox(14);
    expect(a.length).toBe(b.length);
  });
});
