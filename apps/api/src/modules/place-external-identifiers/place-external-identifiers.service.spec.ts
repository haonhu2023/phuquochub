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

  describe('findVerifiedPrimaryGooglePlaceId — quy tắc "đủ điều kiện công khai"', () => {
    it('không có identifier nào cho place → null (record chưa có ID vẫn hoạt động)', async () => {
      repo.findByPlaceAndProvider.mockResolvedValue(null);
      await expect(service.findVerifiedPrimaryGooglePlaceId('place-1')).resolves.toBeNull();
    });

    it('CÓ identifier nhưng verifiedAt=null (vừa nhập qua dashboard, chưa ai xác minh) → null, KHÔNG coi là đã xác minh', async () => {
      repo.findByPlaceAndProvider.mockResolvedValue(makeIdentifier({ verifiedAt: null }));
      await expect(service.findVerifiedPrimaryGooglePlaceId('place-1')).resolves.toBeNull();
    });

    it('CÓ identifier, verifiedAt khác null nhưng isPrimary=false → null', async () => {
      repo.findByPlaceAndProvider.mockResolvedValue(makeIdentifier({ verifiedAt: new Date('2026-10-16'), isPrimary: false }));
      await expect(service.findVerifiedPrimaryGooglePlaceId('place-1')).resolves.toBeNull();
    });

    it('identifier đủ điều kiện (isPrimary=true, verifiedAt khác null) → trả externalId thật', async () => {
      repo.findByPlaceAndProvider.mockResolvedValue(
        makeIdentifier({ externalId: 'ChIJ-qualified', isPrimary: true, verifiedAt: new Date('2026-10-16') }),
      );
      await expect(service.findVerifiedPrimaryGooglePlaceId('place-1')).resolves.toBe('ChIJ-qualified');
    });
  });

  describe('upsertPrimaryGooglePlaceId — đường ghi dashboard (KHÁC ensureIdentifier)', () => {
    it('place chưa có identifier nào → tạo mới, verifiedAt luôn null', async () => {
      repo.findByPlaceAndProvider.mockResolvedValue(null);
      repo.findByProviderAndExternalId.mockResolvedValue(null);

      const result = await service.upsertPrimaryGooglePlaceId({ placeId: 'place-1', externalId: 'ChIJ-new', sourceId: 'src-1' });

      expect(repo.save).toHaveBeenCalledTimes(1);
      expect(result.externalId).toBe('ChIJ-new');
      expect(result.verifiedAt).toBeNull();
      expect(result.isPrimary).toBe(true);
    });

    it('lưu lặp CÙNG giá trị cho CÙNG place → no-op, không tạo hàng mới (idempotent)', async () => {
      const existing = makeIdentifier({ placeId: 'place-1', externalId: 'ChIJ-same' });
      repo.findByPlaceAndProvider.mockResolvedValue(existing);

      const result = await service.upsertPrimaryGooglePlaceId({ placeId: 'place-1', externalId: 'ChIJ-same' });

      expect(result).toBe(existing);
      expect(repo.save).not.toHaveBeenCalled();
      expect(repo.findByProviderAndExternalId).not.toHaveBeenCalled();
    });

    it('sửa sang ID KHÁC cho CÙNG place → UPDATE hàng đã có tại chỗ, KHÔNG insert hàng thứ hai, verifiedAt reset về null', async () => {
      const existing = makeIdentifier({ id: 'ext-1', placeId: 'place-1', externalId: 'ChIJ-old', verifiedAt: new Date('2026-10-01') });
      repo.findByPlaceAndProvider.mockResolvedValue(existing);
      repo.findByProviderAndExternalId.mockResolvedValue(null); // ID mới chưa ai dùng

      const result = await service.upsertPrimaryGooglePlaceId({ placeId: 'place-1', externalId: 'ChIJ-corrected' });

      expect(repo.create).not.toHaveBeenCalled(); // KHÔNG tạo hàng mới
      expect(repo.save).toHaveBeenCalledTimes(1);
      expect(repo.save).toHaveBeenCalledWith(existing); // cùng instance, chỉ sửa field tại chỗ
      expect(result.id).toBe('ext-1'); // vẫn là hàng cũ, không phải hàng mới
      expect(result.externalId).toBe('ChIJ-corrected');
      expect(result.verifiedAt).toBeNull(); // xác minh cũ gắn với ID cũ, không tự áp dụng cho ID mới
    });

    it('ID mới đã thuộc place KHÁC → từ chối, không ghi gì (không áp định danh của Bãi Sao cho địa điểm khác)', async () => {
      repo.findByPlaceAndProvider.mockResolvedValue(null);
      repo.findByProviderAndExternalId.mockResolvedValue(makeIdentifier({ placeId: 'place-other', externalId: 'ChIJ-taken' }));

      await expect(
        service.upsertPrimaryGooglePlaceId({ placeId: 'place-1', externalId: 'ChIJ-taken' }),
      ).rejects.toThrow(BadRequestException);
      expect(repo.save).not.toHaveBeenCalled();
      expect(repo.create).not.toHaveBeenCalled();
    });
  });
});
