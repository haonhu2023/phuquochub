import { BadRequestException } from '@nestjs/common';
import { PlaceExternalIdentifiersService } from './place-external-identifiers.service';
import { PlaceExternalIdentifiersRepository } from './repositories/place-external-identifiers.repository';
import { PlaceExternalIdentifier } from './entities/place-external-identifier.entity';
import { PlaceExternalIdentifierProvider } from './place-external-identifiers.enums';

function makeIdentifier(overrides: Partial<PlaceExternalIdentifier> = {}): PlaceExternalIdentifier {
  const row = new PlaceExternalIdentifier();
  Object.assign(row, {
    id: 'ext-1',
    placeId: 'place-1',
    provider: PlaceExternalIdentifierProvider.GOOGLE_PLACES,
    externalId: 'ChIJ-existing',
    isPrimary: true,
    sourceId: null,
    evidenceId: null,
    verifiedAt: null,
    ...overrides,
  });
  return row;
}

describe('PlaceExternalIdentifiersService', () => {
  let service: PlaceExternalIdentifiersService;
  let repo: jest.Mocked<PlaceExternalIdentifiersRepository>;

  beforeEach(() => {
    repo = {
      findByProviderAndExternalId: jest.fn(),
      findByPlaceAndProvider: jest.fn(),
      listByPlace: jest.fn(),
      create: jest.fn((data) => Object.assign(new PlaceExternalIdentifier(), data)),
      save: jest.fn(async (row) => row),
    } as unknown as jest.Mocked<PlaceExternalIdentifiersRepository>;
    service = new PlaceExternalIdentifiersService(repo);
  });

  describe('ensureIdentifier', () => {
    it('inserts a new row when the (provider, externalId) pair does not exist', async () => {
      repo.findByProviderAndExternalId.mockResolvedValue(null);

      const result = await service.ensureIdentifier({
        placeId: 'place-vinwonders',
        provider: PlaceExternalIdentifierProvider.GOOGLE_PLACES,
        externalId: 'ChIJ-vinwonders',
        sourceId: 'src-1',
        evidenceId: null,
      });

      expect(repo.save).toHaveBeenCalledTimes(1);
      expect(result.placeId).toBe('place-vinwonders');
      expect(result.externalId).toBe('ChIJ-vinwonders');
    });

    it('is idempotent — same place, same provider, same external id returns the existing row without a second write', async () => {
      const existing = makeIdentifier({ placeId: 'place-vinwonders', externalId: 'ChIJ-vinwonders' });
      repo.findByProviderAndExternalId.mockResolvedValue(existing);

      const result = await service.ensureIdentifier({
        placeId: 'place-vinwonders',
        provider: PlaceExternalIdentifierProvider.GOOGLE_PLACES,
        externalId: 'ChIJ-vinwonders',
      });

      expect(result).toBe(existing);
      expect(repo.save).not.toHaveBeenCalled();
    });

    it('rejects mapping the same external id to a different place (identity conflict, not silent overwrite)', async () => {
      const existing = makeIdentifier({ placeId: 'place-vinwonders', externalId: 'ChIJ-shared' });
      repo.findByProviderAndExternalId.mockResolvedValue(existing);

      await expect(
        service.ensureIdentifier({
          placeId: 'place-honthom',
          provider: PlaceExternalIdentifierProvider.GOOGLE_PLACES,
          externalId: 'ChIJ-shared',
        }),
      ).rejects.toThrow(BadRequestException);
      expect(repo.save).not.toHaveBeenCalled();
    });

    it('defaults isPrimary to true and stores null source/evidence when not provided', async () => {
      repo.findByProviderAndExternalId.mockResolvedValue(null);
      const result = await service.ensureIdentifier({
        placeId: 'place-1',
        provider: PlaceExternalIdentifierProvider.GOOGLE_PLACES,
        externalId: 'ChIJ-new',
      });
      expect(result.isPrimary).toBe(true);
      expect(result.sourceId).toBeNull();
      expect(result.evidenceId).toBeNull();
    });
  });

  describe('listByPlace', () => {
    it('delegates to the repository', async () => {
      const rows = [makeIdentifier()];
      repo.listByPlace.mockResolvedValue(rows);
      await expect(service.listByPlace('place-1')).resolves.toBe(rows);
      expect(repo.listByPlace).toHaveBeenCalledWith('place-1');
    });
  });
});
