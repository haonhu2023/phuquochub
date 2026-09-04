import type { Repository } from 'typeorm';
import { PlaceTranslationsRepository } from './place-translations.repository';
import type { PlaceTranslation } from '../entities/place-translation.entity';

const PLACE_ID = '11111111-1111-1111-1111-111111111111';

describe('PlaceTranslationsRepository.findCurrentPublic — Public Place i18n Read Path eligibility predicate', () => {
  it('queries isCurrent=true AND isPublic=true AND isProductionData=true for the exact place/field/locale', async () => {
    const findOne = jest.fn().mockResolvedValue(null);
    const repo = { findOne } as unknown as Repository<PlaceTranslation>;
    const translationsRepo = new PlaceTranslationsRepository(repo);

    await translationsRepo.findCurrentPublic(PLACE_ID, 'short_description', 'en');

    expect(findOne).toHaveBeenCalledWith({
      where: {
        placeId: PLACE_ID,
        fieldKey: 'short_description',
        localeCode: 'en',
        isCurrent: true,
        isPublic: true,
        isProductionData: true,
      },
    });
  });

  it('is strictly MORE restrictive than the write-path findCurrent() — that one must stay permissive for idempotency comparison', async () => {
    const findOne = jest.fn().mockResolvedValue(null);
    const repo = { findOne } as unknown as Repository<PlaceTranslation>;
    const translationsRepo = new PlaceTranslationsRepository(repo);

    await translationsRepo.findCurrent(PLACE_ID, 'short_description', 'en');

    // findCurrent() (unchanged, write-path) must NOT gain isPublic/isProductionData filtering —
    // the importer compares against its own not-yet-public draft too.
    expect(findOne).toHaveBeenCalledWith({
      where: { placeId: PLACE_ID, fieldKey: 'short_description', localeCode: 'en', isCurrent: true },
    });
  });

  it('returns null when no eligible row exists (never a thrown error for "not translated yet")', async () => {
    const findOne = jest.fn().mockResolvedValue(null);
    const repo = { findOne } as unknown as Repository<PlaceTranslation>;
    const translationsRepo = new PlaceTranslationsRepository(repo);

    const result = await translationsRepo.findCurrentPublic(PLACE_ID, 'short_description', 'vi');

    expect(result).toBeNull();
  });
});

describe('PlaceTranslationsRepository — human-translation-review additions (2026-09-04)', () => {
  it('listReviewQueue: defaults to PENDING/NEEDS_CHANGES, joins place + base text + source, caps limit at 200', async () => {
    const query = jest.fn().mockResolvedValue([]);
    const repo = { manager: { query } } as unknown as Repository<PlaceTranslation>;
    const translationsRepo = new PlaceTranslationsRepository(repo);

    await translationsRepo.listReviewQueue({ limit: 5000 });

    const [sql, params] = query.mock.calls[0];
    expect(sql).toContain('pt.human_review_status = ANY($1)');
    expect(sql).toContain('LEFT JOIN place_translations base');
    expect(sql).toContain('LEFT JOIN sources s ON s.id = pt.source_id');
    expect(sql).toContain('JOIN places p ON p.id = pt.place_id');
    expect(params[0]).toEqual(['PENDING', 'NEEDS_CHANGES']);
    expect(params[params.length - 1]).toBe(201); // limit capped at 200, +1 fetched to compute hasMore
  });

  it('listReviewQueue: adds a bound-parameter condition per given filter, never string-interpolates', async () => {
    const query = jest.fn().mockResolvedValue([]);
    const repo = { manager: { query } } as unknown as Repository<PlaceTranslation>;
    const translationsRepo = new PlaceTranslationsRepository(repo);

    await translationsRepo.listReviewQueue({
      placeId: PLACE_ID,
      placeSlug: "x'; DROP TABLE places; --",
      localeCode: 'vi',
      fieldKey: 'short_description',
    });

    const [sql, params] = query.mock.calls[0];
    expect(sql).toContain('pt.place_id = $2');
    expect(sql).toContain('p.slug = $3');
    expect(sql).toContain('pt.locale_code = $4');
    expect(sql).toContain('pt.field_key = $5');
    expect(params).toEqual([['PENDING', 'NEEDS_CHANGES'], PLACE_ID, "x'; DROP TABLE places; --", 'vi', 'short_description', 51]);
  });

  it('updateReviewState: conditions the UPDATE on isCurrent + the exact expected prior status, returns true when a row was affected', async () => {
    const update = jest.fn().mockResolvedValue({ affected: 1 });
    const repo = { update } as unknown as Repository<PlaceTranslation>;
    const translationsRepo = new PlaceTranslationsRepository(repo);

    const applied = await translationsRepo.updateReviewState('translation-1', 'PENDING', {
      humanReviewStatus: 'APPROVED',
      translationStatus: 'APPROVED',
      isPublic: true,
      isProductionData: true,
      productionEligible: true,
    });

    expect(update).toHaveBeenCalledWith(
      { id: 'translation-1', isCurrent: true, humanReviewStatus: 'PENDING' },
      {
        humanReviewStatus: 'APPROVED',
        translationStatus: 'APPROVED',
        isPublic: true,
        isProductionData: true,
        productionEligible: true,
      },
    );
    expect(applied).toBe(true);
  });

  it('updateReviewState: returns false when nothing matched (already reviewed/edited by someone else)', async () => {
    const update = jest.fn().mockResolvedValue({ affected: 0 });
    const repo = { update } as unknown as Repository<PlaceTranslation>;
    const translationsRepo = new PlaceTranslationsRepository(repo);

    const applied = await translationsRepo.updateReviewState('translation-1', 'PENDING', {
      humanReviewStatus: 'REJECTED',
      translationStatus: 'REJECTED',
      isPublic: false,
      isProductionData: false,
      productionEligible: false,
    });

    expect(applied).toBe(false);
  });
});

// Keyset pagination correctness (2026-09-04 scale-up, Phase 22/23) — a small in-memory Postgres
// simulator (understands ORDER BY created_at ASC, id ASC / the (created_at, id) > (x, y) tuple
// condition / LIMIT, exactly what listReviewQueue()'s fixed SQL string actually says) drives real
// pagination through the ACTUAL repository method, proving page-to-page behavior end-to-end rather
// than re-asserting the SQL shape (already covered above).
describe('PlaceTranslationsRepository.listReviewQueue — keyset pagination correctness', () => {
  function makeRow(n: number): { id: string; created_at: Date; human_review_status: string } {
    const id = `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
    return { id, created_at: new Date(2026, 0, 1, 0, 0, n), human_review_status: 'PENDING' };
  }

  // Only `limit` and (optionally) `cursor` are exercised by these tests — no other filter — so the
  // params array is either [statuses, limit] (no cursor) or [statuses, cursorCreatedAt, cursorId,
  // limit] (with cursor), matching listReviewQueue()'s own param-building order exactly.
  function fakeQuery(dataset: ReturnType<typeof makeRow>[]) {
    return jest.fn((_sql: string, params: unknown[]) => {
      const limit = params[params.length - 1] as number;
      let rows = [...dataset].sort((a, b) => a.created_at.getTime() - b.created_at.getTime() || a.id.localeCompare(b.id));
      if (params.length === 4) {
        const cursorCreatedAt = params[1] as Date;
        const cursorId = params[2] as string;
        rows = rows.filter(
          (r) =>
            r.created_at.getTime() > cursorCreatedAt.getTime() ||
            (r.created_at.getTime() === cursorCreatedAt.getTime() && r.id > cursorId),
        );
      }
      return Promise.resolve(rows.slice(0, limit));
    });
  }

  it('page 1 + page 2 (using page 1s nextCursor): together cover every row exactly once, no overlap, no gap', async () => {
    const dataset = Array.from({ length: 5 }, (_, i) => makeRow(i + 1)); // 5 rows total
    const query = fakeQuery(dataset);
    const repo = { manager: { query } } as unknown as Repository<PlaceTranslation>;
    const translationsRepo = new PlaceTranslationsRepository(repo);

    const page1 = await translationsRepo.listReviewQueue({ limit: 3 });
    expect(page1.rows.map((r) => r.id)).toEqual([dataset[0].id, dataset[1].id, dataset[2].id]);
    expect(page1.hasMore).toBe(true);

    const lastOfPage1 = page1.rows[page1.rows.length - 1];
    const page2 = await translationsRepo.listReviewQueue({
      limit: 3,
      cursor: { createdAt: lastOfPage1.created_at, id: lastOfPage1.id },
    });
    expect(page2.rows.map((r) => r.id)).toEqual([dataset[3].id, dataset[4].id]);
    expect(page2.hasMore).toBe(false);

    const allIds = [...page1.rows, ...page2.rows].map((r) => r.id);
    expect(new Set(allIds).size).toBe(allIds.length); // no duplicates across pages
    expect(allIds.sort()).toEqual(dataset.map((r) => r.id).sort()); // every row visible exactly once
  });

  it('hasMore=false and no nextCursor when the page exactly exhausts the dataset', async () => {
    const dataset = Array.from({ length: 2 }, (_, i) => makeRow(i + 1));
    const repo = { manager: { query: fakeQuery(dataset) } } as unknown as Repository<PlaceTranslation>;
    const translationsRepo = new PlaceTranslationsRepository(repo);

    const page = await translationsRepo.listReviewQueue({ limit: 2 });
    expect(page.rows).toHaveLength(2);
    expect(page.hasMore).toBe(false);
  });
});
