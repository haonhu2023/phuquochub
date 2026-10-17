import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { RealEstateListingTranslationsService } from './real-estate-listing-translations.service';
import { RealEstateListing } from './entities/real-estate-listing.entity';
import { RealEstateListingTranslation } from './entities/real-estate-listing-translation.entity';
import {
  RealEstateAddressPrecision,
  RealEstateDealStatus,
  RealEstateListingStatus,
  RealEstateListingTranslationStatus,
  RealEstatePosterRole,
  RealEstatePropertyType,
  RealEstateTransactionType,
} from './real-estate-listings.enums';
import { createMock, LooseMock } from '../../../test/helpers/create-mock';
import { computeRealEstateListingSourceHash } from './real-estate-listing-translation-hash';

function listingRow(overrides: Partial<RealEstateListing> = {}): RealEstateListing {
  const r = new RealEstateListing();
  r.id = 'rel-1';
  r.createdBy = 'owner-1';
  r.status = RealEstateListingStatus.DRAFT;
  r.dealStatus = RealEstateDealStatus.AVAILABLE;
  r.posterRole = RealEstatePosterRole.OWNER;
  r.transactionType = RealEstateTransactionType.RENT;
  r.propertyType = RealEstatePropertyType.ROOM;
  r.title = 'Tiêu đề gốc';
  r.ward = null;
  r.addressPrecision = RealEstateAddressPrecision.AREA;
  r.addressText = null;
  r.lat = null;
  r.lng = null;
  r.areaSqm = null;
  r.price = null;
  r.priceCurrency = null;
  r.rentPeriod = null;
  r.salePriceBasis = null;
  r.depositAmount = null;
  r.utilitiesNote = 'Tiện ích gốc';
  r.furnitureStatus = null;
  r.moveInDate = null;
  r.leaseTermMonths = null;
  r.legalStatusNote = 'Pháp lý gốc';
  r.description = 'Mô tả gốc';
  r.contactMethod = 'phone';
  r.contactValue = '0909';
  Object.assign(r, overrides);
  return r;
}

function translationRow(overrides: Partial<RealEstateListingTranslation> = {}): RealEstateListingTranslation {
  const t = new RealEstateListingTranslation();
  t.id = 'tr-1';
  t.realEstateListingId = 'rel-1';
  t.locale = 'en';
  t.title = 'EN title';
  t.description = 'EN description';
  t.utilitiesNote = null;
  t.legalStatusNote = null;
  t.status = RealEstateListingTranslationStatus.DRAFT;
  t.reviewNote = null;
  t.reviewerId = null;
  t.reviewedAt = null;
  t.sourceContentHash = computeRealEstateListingSourceHash(listingRow());
  t.publishedTitle = null;
  t.publishedDescription = null;
  t.publishedUtilitiesNote = null;
  t.publishedLegalStatusNote = null;
  t.publishedSourceContentHash = null;
  t.publishedAt = null;
  t.contentVersion = 1;
  t.createdAt = new Date('2026-10-17T00:00:00Z');
  t.updatedAt = new Date('2026-10-17T00:00:00Z');
  Object.assign(t, overrides);
  return t;
}

// Gói C phần 2/2 — cùng mẫu JobListingTranslationsService.spec.ts (xem ghi chú đầy đủ ở đó).
describe('RealEstateListingTranslationsService', () => {
  type Deps = ConstructorParameters<typeof RealEstateListingTranslationsService>;
  let translationsRepo: LooseMock<Deps[0]>;
  let listingsRepo: LooseMock<Deps[1]>;
  let audit: LooseMock<Deps[2]>;
  let service: RealEstateListingTranslationsService;

  beforeEach(() => {
    translationsRepo = createMock<Deps[0]>({
      findByRealEstateListingId: jest.fn(),
      insertNew: jest.fn((entity: RealEstateListingTranslation) => {
        entity.id = entity.id || 'tr-new';
        entity.contentVersion = entity.contentVersion ?? 1;
        entity.createdAt = entity.createdAt ?? new Date('2026-10-17T00:00:00Z');
        entity.updatedAt = entity.updatedAt ?? new Date('2026-10-17T00:00:00Z');
        return Promise.resolve(entity);
      }),
      create: jest.fn((realEstateListingId: string) => {
        const t = new RealEstateListingTranslation();
        t.realEstateListingId = realEstateListingId;
        t.locale = 'en';
        t.status = RealEstateListingTranslationStatus.DRAFT;
        return t;
      }),
      updateWithCas: jest.fn().mockResolvedValue(true),
      listPending: jest.fn(),
    });
    listingsRepo = createMock<Deps[1]>({ findById: jest.fn() });
    audit = createMock<Deps[2]>({ record: jest.fn().mockResolvedValue(undefined) });
    service = new RealEstateListingTranslationsService(translationsRepo, listingsRepo, audit);
  });

  afterEach(() => jest.clearAllMocks());

  describe('quyền sở hữu', () => {
    it('save: tin không thuộc về mình → NotFoundException, KHÔNG ghi gì', async () => {
      listingsRepo.findById.mockResolvedValue(listingRow({ createdBy: 'someone-else' }));
      await expect(service.save('rel-1', { title: 'x' }, 'u1')).rejects.toBeInstanceOf(NotFoundException);
      expect(translationsRepo.insertNew).not.toHaveBeenCalled();
      expect(translationsRepo.updateWithCas).not.toHaveBeenCalled();
    });

    it('submit: tin không thuộc về mình → NotFoundException', async () => {
      listingsRepo.findById.mockResolvedValue(listingRow({ createdBy: 'someone-else' }));
      await expect(service.submit('rel-1', 'u1')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('save (lưu nháp) — KHÔNG BAO GIỜ đụng published*', () => {
    it('chưa có bản dịch nào → INSERT mới, status=draft', async () => {
      listingsRepo.findById.mockResolvedValue(listingRow({ createdBy: 'u1' }));
      translationsRepo.findByRealEstateListingId.mockResolvedValue(null);
      const result = await service.save('rel-1', { title: 'EN title' }, 'u1');
      expect(result.status).toBe(RealEstateListingTranslationStatus.DRAFT);
    });

    it('đã có bản dịch, KHÔNG gửi expected_content_version → BadRequestException', async () => {
      listingsRepo.findById.mockResolvedValue(listingRow({ createdBy: 'u1' }));
      translationsRepo.findByRealEstateListingId.mockResolvedValue(translationRow());
      await expect(service.save('rel-1', { title: 'x' }, 'u1')).rejects.toBeInstanceOf(BadRequestException);
    });

    it('CAS lỗi thời → ConflictException, KHÔNG audit', async () => {
      listingsRepo.findById.mockResolvedValue(listingRow({ createdBy: 'u1' }));
      translationsRepo.findByRealEstateListingId.mockResolvedValue(translationRow({ contentVersion: 3 }));
      translationsRepo.updateWithCas.mockResolvedValue(false);
      await expect(service.save('rel-1', { title: 'x', expected_content_version: 2 }, 'u1')).rejects.toBeInstanceOf(ConflictException);
      expect(audit.record).not.toHaveBeenCalled();
    });

    it('CAS khớp → cập nhật VÙNG NHÁP, KHÔNG đụng published* (bản đã duyệt vẫn còn nguyên)', async () => {
      listingsRepo.findById.mockResolvedValue(listingRow({ createdBy: 'u1' }));
      translationsRepo.findByRealEstateListingId.mockResolvedValue(
        translationRow({
          status: RealEstateListingTranslationStatus.PUBLISHED,
          contentVersion: 2,
          publishedTitle: 'Bản ĐÃ DUYỆT — không được đụng',
          publishedSourceContentHash: 'hash-cu',
        }),
      );
      const result = await service.save('rel-1', { title: 'Đang sửa tiếp', expected_content_version: 2 }, 'u1');
      expect(result.title).toBe('Đang sửa tiếp');
      expect(result.status).toBe(RealEstateListingTranslationStatus.DRAFT);
      const patch = translationsRepo.updateWithCas.mock.calls[0][1];
      expect(patch).not.toHaveProperty('publishedTitle');
      expect(result.has_published).toBe(true);
    });
  });

  describe('submit', () => {
    it('thiếu title/description → BadRequestException', async () => {
      listingsRepo.findById.mockResolvedValue(listingRow({ createdBy: 'u1' }));
      translationsRepo.findByRealEstateListingId.mockResolvedValue(translationRow({ title: 'EN title', description: null }));
      await expect(service.submit('rel-1', 'u1')).rejects.toBeInstanceOf(BadRequestException);
    });

    it('draft với đủ title+description → pending', async () => {
      listingsRepo.findById.mockResolvedValue(listingRow({ createdBy: 'u1' }));
      translationsRepo.findByRealEstateListingId.mockResolvedValue(translationRow({ status: RealEstateListingTranslationStatus.DRAFT }));
      const result = await service.submit('rel-1', 'u1');
      expect(result.status).toBe(RealEstateListingTranslationStatus.PENDING);
    });

    it('đang pending/published → ConflictException', async () => {
      listingsRepo.findById.mockResolvedValue(listingRow({ createdBy: 'u1' }));
      translationsRepo.findByRealEstateListingId.mockResolvedValue(translationRow({ status: RealEstateListingTranslationStatus.PUBLISHED }));
      await expect(service.submit('rel-1', 'u1')).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('decide (CAS bắt buộc)', () => {
    it('KHÔNG gửi expected_content_version → BadRequestException', async () => {
      translationsRepo.findByRealEstateListingId.mockResolvedValue(translationRow({ status: RealEstateListingTranslationStatus.PENDING }));
      await expect(service.decide('rel-1', { decision: 'approve' }, 'mod-1')).rejects.toBeInstanceOf(BadRequestException);
      expect(translationsRepo.updateWithCas).not.toHaveBeenCalled();
    });

    it('CAS lỗi thời → ConflictException', async () => {
      translationsRepo.findByRealEstateListingId.mockResolvedValue(
        translationRow({ status: RealEstateListingTranslationStatus.PENDING, contentVersion: 4 }),
      );
      translationsRepo.updateWithCas.mockResolvedValue(false);
      listingsRepo.findById.mockResolvedValue(listingRow());
      await expect(service.decide('rel-1', { decision: 'approve', expected_content_version: 3 }, 'mod-1')).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('approve từ pending → published, CHỤP SNAPSHOT nháp vào published*', async () => {
      const listing = listingRow();
      listingsRepo.findById.mockResolvedValue(listing);
      translationsRepo.findByRealEstateListingId.mockResolvedValue(
        translationRow({ status: RealEstateListingTranslationStatus.PENDING, title: 'EN mới', contentVersion: 1 }),
      );
      const result = await service.decide('rel-1', { decision: 'approve', expected_content_version: 1 }, 'mod-1');
      expect(result.status).toBe(RealEstateListingTranslationStatus.PUBLISHED);
      const patch = translationsRepo.updateWithCas.mock.calls[0][1];
      expect(patch.publishedTitle).toBe('EN mới');
    });

    it('reject → rejected, published* KHÔNG đổi', async () => {
      listingsRepo.findById.mockResolvedValue(listingRow());
      translationsRepo.findByRealEstateListingId.mockResolvedValue(
        translationRow({ status: RealEstateListingTranslationStatus.PENDING, contentVersion: 1, publishedTitle: 'Bản cũ vẫn còn' }),
      );
      const result = await service.decide('rel-1', { decision: 'reject', note: 'dịch sai', expected_content_version: 1 }, 'mod-1');
      expect(result.status).toBe(RealEstateListingTranslationStatus.REJECTED);
      const patch = translationsRepo.updateWithCas.mock.calls[0][1];
      expect(patch).not.toHaveProperty('publishedTitle');
    });
  });

  describe('listPending', () => {
    it('ghép đúng ngữ cảnh tin gốc', async () => {
      translationsRepo.listPending.mockResolvedValue([translationRow({ id: 'tr-1', realEstateListingId: 'rel-1' })]);
      listingsRepo.findById.mockResolvedValue(listingRow({ id: 'rel-1', title: 'Tiêu đề gốc tiếng Việt' }));
      const result = await service.listPending();
      expect(result[0].source_title).toBe('Tiêu đề gốc tiếng Việt');
    });
  });
});
