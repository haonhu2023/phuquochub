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
