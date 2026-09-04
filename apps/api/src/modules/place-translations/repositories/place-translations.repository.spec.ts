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
  it('listPendingReview: queries isCurrent=true AND humanReviewStatus IN (PENDING, NEEDS_CHANGES), scoped to placeId when given', async () => {
    const find = jest.fn().mockResolvedValue([]);
    const repo = { find } as unknown as Repository<PlaceTranslation>;
    const translationsRepo = new PlaceTranslationsRepository(repo);

    await translationsRepo.listPendingReview(PLACE_ID);

    const callArg = find.mock.calls[0][0];
    expect(callArg.where.placeId).toBe(PLACE_ID);
    expect(callArg.where.isCurrent).toBe(true);
    expect(callArg.where.humanReviewStatus._type).toBe('in');
    expect(callArg.where.humanReviewStatus._value).toEqual(['PENDING', 'NEEDS_CHANGES']);
  });

  it('listPendingReview: omits placeId filter when not given (global queue)', async () => {
    const find = jest.fn().mockResolvedValue([]);
    const repo = { find } as unknown as Repository<PlaceTranslation>;
    const translationsRepo = new PlaceTranslationsRepository(repo);

    await translationsRepo.listPendingReview(undefined);

    const callArg = find.mock.calls[0][0];
    expect(callArg.where.placeId).toBeUndefined();
  });

  it('updateReviewState: updates exactly the five governance columns for the given id', async () => {
    const update = jest.fn().mockResolvedValue(undefined);
    const repo = { update } as unknown as Repository<PlaceTranslation>;
    const translationsRepo = new PlaceTranslationsRepository(repo);

    await translationsRepo.updateReviewState('translation-1', {
      humanReviewStatus: 'APPROVED',
      translationStatus: 'APPROVED',
      isPublic: true,
      isProductionData: true,
      productionEligible: true,
    });

    expect(update).toHaveBeenCalledWith(
      { id: 'translation-1' },
      {
        humanReviewStatus: 'APPROVED',
        translationStatus: 'APPROVED',
        isPublic: true,
        isProductionData: true,
        productionEligible: true,
      },
    );
  });
});
