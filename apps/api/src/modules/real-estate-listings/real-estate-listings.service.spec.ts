import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { RealEstateListingsService } from './real-estate-listings.service';
import { RealEstateListing } from './entities/real-estate-listing.entity';
import {
  RealEstateAddressPrecision,
  RealEstateDealStatus,
  RealEstateListingStatus,
  RealEstatePosterRole,
  RealEstatePropertyType,
  RealEstateTransactionType,
} from './real-estate-listings.enums';
import { UpsertRealEstateListingDto } from './dto/real-estate-listings.dto';
import { createMock, LooseMock } from '../../../test/helpers/create-mock';

function rentDto(): UpsertRealEstateListingDto {
  return {
    poster_role: RealEstatePosterRole.OWNER,
    transaction_type: RealEstateTransactionType.RENT,
    property_type: RealEstatePropertyType.ROOM,
    title: 'Phòng trọ gần biển',
    contact_method: 'phone',
    contact_value: '0909xxxxxx',
  };
}

function saleDto(): UpsertRealEstateListingDto {
  return {
    poster_role: RealEstatePosterRole.BROKER,
    transaction_type: RealEstateTransactionType.SALE,
    property_type: RealEstatePropertyType.LAND,
    title: 'Lô đất mặt tiền',
    contact_method: 'phone',
    contact_value: '0909xxxxxx',
  };
}

function row(overrides: Partial<RealEstateListing> = {}): RealEstateListing {
  const r = new RealEstateListing();
  r.id = 'rel-1';
  r.createdBy = 'owner-1';
  r.status = RealEstateListingStatus.DRAFT;
  r.dealStatus = RealEstateDealStatus.AVAILABLE;
  r.posterRole = RealEstatePosterRole.OWNER;
  r.transactionType = RealEstateTransactionType.RENT;
  r.propertyType = RealEstatePropertyType.ROOM;
  r.title = 'T';
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
  r.utilitiesNote = null;
  r.furnitureStatus = null;
  r.moveInDate = null;
  r.leaseTermMonths = null;
  r.legalStatusNote = null;
  r.description = null;
  r.contactMethod = 'phone';
  r.contactValue = '0909';
  r.reviewNote = null;
  r.reviewerId = null;
  r.reviewedAt = null;
  r.expiresAt = null;
  r.publishedAt = null;
  r.createdAt = new Date('2026-10-07T00:00:00Z');
  r.updatedAt = new Date('2026-10-07T00:00:00Z');
  Object.assign(r, overrides);
  return r;
}

describe('RealEstateListingsService', () => {
  type Deps = ConstructorParameters<typeof RealEstateListingsService>;
  let repo: LooseMock<Deps[0]>;
  let authz: LooseMock<Deps[1]>;
  let service: RealEstateListingsService;

  beforeEach(() => {
    repo = createMock<Deps[0]>({
      create: jest.fn((entity: RealEstateListing) => {
        entity.createdAt = entity.createdAt ?? new Date('2026-10-07T00:00:00Z');
        entity.updatedAt = entity.updatedAt ?? new Date('2026-10-07T00:00:00Z');
        return Promise.resolve(entity);
      }),
      save: jest.fn((entity: RealEstateListing) => Promise.resolve(entity)),
      findById: jest.fn(),
      listMine: jest.fn(),
      listPublic: jest.fn(),
      countPublic: jest.fn(),
      getPublicById: jest.fn(),
      listPending: jest.fn(),
      listAllForAdmin: jest.fn(),
      countAllForAdmin: jest.fn(),
      findCreatorSummaries: jest.fn().mockResolvedValue(new Map()),
    });
    authz = createMock<Deps[1]>({ can: jest.fn() });
    service = new RealEstateListingsService(repo, authz);
  });

  afterEach(() => jest.clearAllMocks());

  describe('validate theo giao dịch', () => {
    it('tin thuê mang sale_price_basis → BadRequestException', async () => {
      await expect(
        service.create({ ...rentDto(), sale_price_basis: 'total' as never }, 'u1'),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('tin thuê mang legal_status_note → BadRequestException', async () => {
      await expect(service.create({ ...rentDto(), legal_status_note: 'sổ hồng riêng' }, 'u1')).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('tin bán mang rent_period → BadRequestException', async () => {
      await expect(service.create({ ...saleDto(), rent_period: 'month' as never }, 'u1')).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('tin bán mang deposit_amount → BadRequestException', async () => {
      await expect(service.create({ ...saleDto(), deposit_amount: 1000000 }, 'u1')).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('có price nhưng thiếu price_currency → BadRequestException', async () => {
      await expect(service.create({ ...rentDto(), price: 3000000 }, 'u1')).rejects.toBeInstanceOf(BadRequestException);
    });

    it('address_precision=exact thiếu cả address_text lẫn lat/lng → BadRequestException', async () => {
      await expect(
        service.create({ ...rentDto(), address_precision: 'exact' as never }, 'u1'),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('address_precision=exact có address_text → hợp lệ', async () => {
      await expect(
        service.create({ ...rentDto(), address_precision: 'exact' as never, address_text: '123 Trần Hưng Đạo' }, 'u1'),
      ).resolves.toBeDefined();
    });

    it('tin thuê hợp lệ với đủ field rent-only', async () => {
      const result = await service.create(
        { ...rentDto(), rent_period: 'month' as never, price: 3000000, price_currency: 'VND' },
        'u1',
      );
      expect(result.status).toBe(RealEstateListingStatus.DRAFT);
    });
  });

  describe('bảng chuyển trạng thái (status) — cùng job_listings', () => {
    it('update tin không thuộc về mình → NotFoundException', async () => {
      repo.findById.mockResolvedValue(row({ createdBy: 'someone-else' }));
      await expect(service.update('rel-1', rentDto(), 'u1')).rejects.toBeInstanceOf(NotFoundException);
    });

    // "Sửa và gửi đăng lại" — cùng lý do JobListingsService (xem ghi chú ở đó): kiểm quyền này ở
    // SERVER cho bước "gửi đăng lại" (submit), không chỉ bước "sửa" (update) đã có test ở trên.
    it('submit tin không thuộc về mình → NotFoundException (không lộ tồn tại, chặn ở server)', async () => {
      repo.findById.mockResolvedValue(row({ status: RealEstateListingStatus.DRAFT, createdBy: 'someone-else' }));
      await expect(service.submit('rel-1', 'u1')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('submit draft → pending', async () => {
      repo.findById.mockResolvedValue(row({ status: RealEstateListingStatus.DRAFT, createdBy: 'u1' }));
      const result = await service.submit('rel-1', 'u1');
      expect(result.status).toBe(RealEstateListingStatus.PENDING);
    });

    it('submit từ rejected → pending trực tiếp', async () => {
      repo.findById.mockResolvedValue(row({ status: RealEstateListingStatus.REJECTED, createdBy: 'u1' }));
      const result = await service.submit('rel-1', 'u1');
      expect(result.status).toBe(RealEstateListingStatus.PENDING);
    });

    it('update khi published đẩy ngay về pending, xoá published_at', async () => {
      repo.findById.mockResolvedValue(
        row({ status: RealEstateListingStatus.PUBLISHED, createdBy: 'u1', publishedAt: new Date() }),
      );
      const result = await service.update('rel-1', rentDto(), 'u1');
      expect(result.status).toBe(RealEstateListingStatus.PENDING);
      expect(result.published_at).toBeNull();
    });

    it('update khi closed → ConflictException', async () => {
      repo.findById.mockResolvedValue(row({ status: RealEstateListingStatus.CLOSED, createdBy: 'u1' }));
      await expect(service.update('rel-1', rentDto(), 'u1')).rejects.toBeInstanceOf(ConflictException);
    });

    it('decide approve → published', async () => {
      repo.findById.mockResolvedValue(row({ status: RealEstateListingStatus.PENDING }));
      const result = await service.decide('rel-1', { decision: 'approve' }, 'mod-1');
      expect(result.status).toBe(RealEstateListingStatus.PUBLISHED);
      expect(result.published_at).not.toBeNull();
    });

    it('decide reject → rejected, review_note lộ cho chủ tin', async () => {
      repo.findById.mockResolvedValue(row({ status: RealEstateListingStatus.PENDING }));
      const result = await service.decide('rel-1', { decision: 'reject', note: 'thiếu ảnh thật' }, 'mod-1');
      expect(result.status).toBe(RealEstateListingStatus.REJECTED);
      expect(result.review_note).toBe('thiếu ảnh thật');
    });

    it('close: chủ tin tự đóng published → closed', async () => {
      repo.findById.mockResolvedValue(row({ status: RealEstateListingStatus.PUBLISHED, createdBy: 'u1' }));
      const result = await service.close('rel-1', 'u1');
      expect(result.status).toBe(RealEstateListingStatus.CLOSED);
    });

    it('close: người lạ không có quyền Moderate → ForbiddenException', async () => {
      repo.findById.mockResolvedValue(row({ status: RealEstateListingStatus.PUBLISHED, createdBy: 'owner-1' }));
      authz.can.mockResolvedValue(false);
      await expect(service.close('rel-1', 'stranger')).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('reopen: closed → pending, không nhảy thẳng published', async () => {
      repo.findById.mockResolvedValue(row({ status: RealEstateListingStatus.CLOSED, createdBy: 'u1' }));
      const result = await service.reopen('rel-1', 'u1');
      expect(result.status).toBe(RealEstateListingStatus.PENDING);
    });
  });

  describe('deal_status — ĐỘC LẬP với status (mục VI "phân biệt kiểm duyệt với còn giao dịch")', () => {
    it('markRented khi published → rented, status KHÔNG đổi (không kéo về pending)', async () => {
      repo.findById.mockResolvedValue(row({ status: RealEstateListingStatus.PUBLISHED, createdBy: 'u1' }));
      const result = await service.markRented('rel-1', 'u1');
      expect(result.deal_status).toBe(RealEstateDealStatus.RENTED);
      expect(result.status).toBe(RealEstateListingStatus.PUBLISHED);
    });

    it('markSold khi draft (chưa từng published) → ConflictException', async () => {
      repo.findById.mockResolvedValue(row({ status: RealEstateListingStatus.DRAFT, createdBy: 'u1' }));
      await expect(service.markSold('rel-1', 'u1')).rejects.toBeInstanceOf(ConflictException);
    });

    it('markAvailable sau khi đã markRented → về available', async () => {
      repo.findById.mockResolvedValue(
        row({ status: RealEstateListingStatus.PUBLISHED, createdBy: 'u1', dealStatus: RealEstateDealStatus.RENTED }),
      );
      const result = await service.markAvailable('rel-1', 'u1');
      expect(result.deal_status).toBe(RealEstateDealStatus.AVAILABLE);
    });

    it('moderator (không sở hữu) cũng đánh dấu được nhờ RealEstateListing.Moderate', async () => {
      repo.findById.mockResolvedValue(row({ status: RealEstateListingStatus.PUBLISHED, createdBy: 'owner-1' }));
      authz.can.mockResolvedValue(true);
      const result = await service.markRented('rel-1', 'mod-1');
      expect(result.deal_status).toBe(RealEstateDealStatus.RENTED);
      expect(authz.can).toHaveBeenCalledWith('mod-1', 'RealEstateListing.Moderate');
    });
  });

  describe('vị trí/quyền riêng tư — public KHÔNG trả địa chỉ/toạ độ khi address_precision=area', () => {
    it('getPublicById: area → address_text/lat/lng là null dù DB có giá trị', async () => {
      repo.getPublicById.mockResolvedValue(
        row({
          status: RealEstateListingStatus.PUBLISHED,
          addressPrecision: RealEstateAddressPrecision.AREA,
          addressText: '123 Đường Bí Mật',
          lat: '10.123456',
          lng: '103.987654',
          ward: 'Dương Đông',
        }),
      );
      const result = await service.getPublicById('rel-1');
      expect(result.ward).toBe('Dương Đông');
      expect(result.address_text).toBeNull();
      expect(result.lat).toBeNull();
      expect(result.lng).toBeNull();
    });

    it('getPublicById: exact → trả đủ address_text/lat/lng', async () => {
      repo.getPublicById.mockResolvedValue(
        row({
          status: RealEstateListingStatus.PUBLISHED,
          addressPrecision: RealEstateAddressPrecision.EXACT,
          addressText: '123 Đường Rõ Ràng',
          lat: '10.123456',
          lng: '103.987654',
        }),
      );
      const result = await service.getPublicById('rel-1');
      expect(result.address_text).toBe('123 Đường Rõ Ràng');
      expect(result.lat).toBeCloseTo(10.123456);
      expect(result.lng).toBeCloseTo(103.987654);
    });

    it('getMine: chủ tin thấy đủ vị trí NGAY CẢ KHI address_precision=area (xem lại/sửa dữ liệu của mình)', async () => {
      repo.findById.mockResolvedValue(
        row({ createdBy: 'u1', addressPrecision: RealEstateAddressPrecision.AREA, addressText: 'địa chỉ riêng', lat: '10.1', lng: '103.9' }),
      );
      const result = await service.getMine('rel-1', 'u1');
      expect(result.address_text).toBe('địa chỉ riêng');
    });
  });

  describe('đọc công khai — chỉ published + available + chưa hết hạn', () => {
    it('getPublicById: null (chưa publish/đã thuê-bán/hết hạn/không tồn tại) → NotFoundException đồng nhất', async () => {
      repo.getPublicById.mockResolvedValue(null);
      await expect(service.getPublicById('rel-1')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('listPublic: chuyển query thành filter + phân trang', async () => {
      repo.listPublic.mockResolvedValue([row({ status: RealEstateListingStatus.PUBLISHED })]);
      repo.countPublic.mockResolvedValue(1);
      const result = await service.listPublic({ transaction_type: 'rent' as never, page: 1, limit: 10 });
      expect(repo.listPublic).toHaveBeenCalledWith(
        { transactionType: 'rent', propertyType: undefined, ward: undefined },
        10,
        0,
      );
      expect(result.data).toHaveLength(1);
    });
  });

  // Gói B (17/10/2026) — cùng lý do/mẫu JobListingsService (xem ghi chú đầy đủ ở đó).
  // "Sửa và gửi đăng lại" (Gói B, 17/10/2026) — cùng lý do/mẫu JobListingsService (xem ghi chú đầy
  // đủ ở đó). KHÔNG phải chính sách 30/60/90 ngày (chưa duyệt).
  describe('assertValidExpiry (hạn mới hợp lệ khi sửa/gửi đăng lại)', () => {
    it('create với expires_at ở quá khứ → BadRequestException', async () => {
      await expect(service.create({ ...rentDto(), expires_at: '2000-01-01' }, 'u1')).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('update (sửa+gửi đăng lại) với expires_at ở quá khứ → BadRequestException, KHÔNG gọi repo.save', async () => {
      repo.findById.mockResolvedValue(row({ status: RealEstateListingStatus.REJECTED, createdBy: 'u1' }));
      await expect(
        service.update('rel-1', { ...rentDto(), expires_at: '2000-01-01' }, 'u1'),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(repo.save).not.toHaveBeenCalled();
    });

    it('expires_at không đặt (null/undefined) → luôn hợp lệ', async () => {
      await expect(service.create(rentDto(), 'u1')).resolves.toBeDefined();
    });
  });

  describe('listAllForAdmin (màn hình quản lý toàn bộ tin)', () => {
    it('có status/created_by → truyền đúng xuống repository (phân biệt với listPending chỉ-pending)', async () => {
      repo.listAllForAdmin.mockResolvedValue([]);
      repo.countAllForAdmin.mockResolvedValue(0);
      await service.listAllForAdmin({ status: RealEstateListingStatus.CLOSED, created_by: 'owner-1', page: 2, limit: 10 });
      expect(repo.listAllForAdmin).toHaveBeenCalledWith(
        { status: RealEstateListingStatus.CLOSED, createdBy: 'owner-1' },
        10,
        10,
      );
    });

    it('ghép đúng tên/email người đăng theo created_by của MỖI tin', async () => {
      repo.listAllForAdmin.mockResolvedValue([
        row({ id: 'rel-1', createdBy: 'owner-1', status: RealEstateListingStatus.PUBLISHED }),
        row({ id: 'rel-2', createdBy: 'owner-2', status: RealEstateListingStatus.CLOSED }),
      ]);
      repo.countAllForAdmin.mockResolvedValue(2);
      repo.findCreatorSummaries.mockResolvedValue(
        new Map([
          ['owner-1', { email: 'owner1@test.com', display_name: 'Chủ tin 1' }],
          ['owner-2', { email: 'owner2@test.com', display_name: 'Chủ tin 2' }],
        ]),
      );
      const result = await service.listAllForAdmin({});
      expect(result.data[0]).toMatchObject({ id: 'rel-1', creator_email: 'owner1@test.com', creator_display_name: 'Chủ tin 1' });
      expect(result.data[1]).toMatchObject({ id: 'rel-2', creator_email: 'owner2@test.com', creator_display_name: 'Chủ tin 2' });
    });

    it('người đăng đã bị xoá (không có trong map) → creator_email/creator_display_name null, KHÔNG throw', async () => {
      repo.listAllForAdmin.mockResolvedValue([row({ id: 'rel-1', createdBy: 'ghost' })]);
      repo.countAllForAdmin.mockResolvedValue(1);
      repo.findCreatorSummaries.mockResolvedValue(new Map());
      const result = await service.listAllForAdmin({});
      expect(result.data[0]).toMatchObject({ creator_email: null, creator_display_name: null });
    });
  });
});
