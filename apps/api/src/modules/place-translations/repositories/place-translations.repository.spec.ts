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
    expect(params[params.length - 1]).toBe(200); // capped, not the requested 5000
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
    expect(params).toEqual([['PENDING', 'NEEDS_CHANGES'], PLACE_ID, "x'; DROP TABLE places; --", 'vi', 'short_description', 50]);
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
