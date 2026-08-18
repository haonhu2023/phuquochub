import { BadRequestException, NotFoundException } from '@nestjs/common';

// Mapper đã có test riêng (places.mapper.spec / places-detail.mapper.spec) → mock để test
// thuần logic điều phối của service, giống events.service.spec.ts.
jest.mock('./places.mapper', () => ({
  toPlaceCard: (r: { id?: string; status?: string }) => ({ id: r?.id, status: r?.status, mapped: true }),
  toPlaceDetail: (r: { id?: string }) => ({ id: r?.id, mappedDetail: true }),
}));

import { PlacesService } from './places.service';
import { PlaceStatus } from './place.enums';
import { RevisionOrigin, RevisionStatus } from '../revisions/revision.enums';
import { CreatePlaceDto, UpdatePlaceDto } from './dto/places.dto';
import { PHU_QUOC_BOUNDS } from '../../common/geo-bounds';
import { createMock, LooseMock } from '../../../test/helpers/create-mock';

type Ctor = ConstructorParameters<typeof PlacesService>;

const VALID_LOCATION = { lat: 10.05, lng: 104.0 };
const CATEGORY_ID = '11111111-1111-4111-8111-111111111111';

describe('PlacesService — đường ghi & kiểm duyệt', () => {
  let placesRepo: LooseMock<Ctor[0]>;
  let categoriesRepo: LooseMock<Ctor[1]>;
  let contactsRepo: LooseMock<Ctor[2]>;
  let pricesRepo: LooseMock<Ctor[3]>;
  let mediaRepo: LooseMock<Ctor[4]>;
  let revisions: LooseMock<Ctor[5]>;
  let audit: LooseMock<Ctor[6]>;
  let mediaUrl: LooseMock<Ctor[7]>;
  let userRolesRepo: LooseMock<Ctor[8]>;
  let authz: LooseMock<Ctor[9]>;
  let service: PlacesService;

  beforeEach(() => {
    placesRepo = createMock<Ctor[0]>({
      list: jest.fn(),
      createPlace: jest.fn(),
      getCardByIdIncludingInactive: jest.fn(),
      getDetailBySlug: jest.fn(),
      listFaqs: jest.fn(),
      updateScalars: jest.fn(),
      updateLocation: jest.fn(),
      archive: jest.fn(),
      setStatus: jest.fn(),
      existsBySlug: jest.fn(),
    });
    categoriesRepo = createMock<Ctor[1]>({ findById: jest.fn() });
    contactsRepo = createMock<Ctor[2]>({ listByOwner: jest.fn() });
    pricesRepo = createMock<Ctor[3]>({ current: jest.fn() });
    mediaRepo = createMock<Ctor[4]>({ listPublishedByPlace: jest.fn() });
    revisions = createMock<Ctor[5]>({ recordPlaceRevision: jest.fn() });
    audit = createMock<Ctor[6]>({ record: jest.fn() });
    mediaUrl = createMock<Ctor[7]>({ fileUrl: jest.fn() });
    userRolesRepo = createMock<Ctor[8]>({ getScopedGrants: jest.fn() });
    authz = createMock<Ctor[9]>({ canWithGrants: jest.fn() });

    service = new PlacesService(
      placesRepo,
      categoriesRepo,
      contactsRepo,
      pricesRepo,
      mediaRepo,
      revisions,
      audit,
      mediaUrl,
      userRolesRepo,
      authz,
    );
  });

  afterEach(() => jest.clearAllMocks());

  // -------------------------------------------------------------------------
  // list — ranh giới đặc quyền (GAP-04 ở tầng SERVICE, bổ trợ spec tầng repository)
  // -------------------------------------------------------------------------
  describe('list', () => {
    it('KHÔNG chuyển `status` xuống repository từ kênh công khai', async () => {
      placesRepo.list.mockResolvedValue({ items: [], total: 0 });

      // Cố tình nhét status vào query như thể DTO bị bỏ qua — service vẫn không được chuyển tiếp.
      await service.list({ status: PlaceStatus.PENDING } as never);

      const [params] = placesRepo.list.mock.calls[0];
      expect(params).not.toHaveProperty('status');
    });

    it('phân trang: page/limit → offset và meta.total', async () => {
      placesRepo.list.mockResolvedValue({ items: [{ id: 'p1' }], total: 1 });

      const res = await service.list({ page: 2, limit: 10 } as never);

      const [params] = placesRepo.list.mock.calls[0];
      expect(params.limit).toBe(10);
      expect(params.offset).toBe(10);
      expect(res.meta.total).toBe(1);
      expect(res.data[0]).toEqual({ id: 'p1', status: undefined, mapped: true });
    });
  });

  // -------------------------------------------------------------------------
  // create
  // -------------------------------------------------------------------------
  describe('create', () => {
    const dto = {
      name: 'Bãi Sao',
      category_id: CATEGORY_ID,
      location: VALID_LOCATION,
    } as CreatePlaceDto;

    it('category_id không tồn tại → BadRequest, KHÔNG ghi gì', async () => {
      categoriesRepo.findById.mockResolvedValue(null);

      await expect(service.create(dto, 'u1')).rejects.toBeInstanceOf(BadRequestException);
      expect(placesRepo.createPlace).not.toHaveBeenCalled();
      expect(revisions.recordPlaceRevision).not.toHaveBeenCalled();
    });

    it('ép trạng thái PENDING (đóng góp cộng đồng chờ kiểm duyệt — WF-06)', async () => {
      categoriesRepo.findById.mockResolvedValue({ id: CATEGORY_ID });
      placesRepo.existsBySlug.mockResolvedValue(false);
      placesRepo.createPlace.mockResolvedValue('p1');
      placesRepo.getCardByIdIncludingInactive.mockResolvedValue({ id: 'p1', status: PlaceStatus.PENDING });

      await service.create(dto, 'u1');

      const [row] = placesRepo.createPlace.mock.calls[0];
      expect(row.status).toBe(PlaceStatus.PENDING);
      expect(row.createdBy).toBe('u1');
      // Toạ độ đi đúng thứ tự lng/lat xuống repository.
      expect(row.lng).toBe(VALID_LOCATION.lng);
      expect(row.lat).toBe(VALID_LOCATION.lat);
    });

    it('ghi wiki_revision khởi tạo với status PENDING + origin COMMUNITY_EDIT (WF-14)', async () => {
      categoriesRepo.findById.mockResolvedValue({ id: CATEGORY_ID });
      placesRepo.existsBySlug.mockResolvedValue(false);
      placesRepo.createPlace.mockResolvedValue('p1');
      placesRepo.getCardByIdIncludingInactive.mockResolvedValue({ id: 'p1', status: PlaceStatus.PENDING });

      await service.create(dto, 'u1');

      const [revision] = revisions.recordPlaceRevision.mock.calls[0];
      expect(revision.placeId).toBe('p1');
      expect(revision.status).toBe(RevisionStatus.PENDING);
      expect(revision.origin).toBe(RevisionOrigin.COMMUNITY_EDIT);
      expect(revision.editorId).toBe('u1');
      expect(revision.diff).toBeNull();
    });

    it('slug trùng → vòng lặp sinh slug khác base', async () => {
      categoriesRepo.findById.mockResolvedValue({ id: CATEGORY_ID });
      // Lần đầu trùng, lần sau rảnh → phải gọi existsBySlug 2 lần và đổi slug.
      placesRepo.existsBySlug.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
      placesRepo.createPlace.mockResolvedValue('p1');
      placesRepo.getCardByIdIncludingInactive.mockResolvedValue({ id: 'p1', status: PlaceStatus.PENDING });

      await service.create(dto, 'u1');

      expect(placesRepo.existsBySlug).toHaveBeenCalledTimes(2);
      const baseSlug = placesRepo.existsBySlug.mock.calls[0][0];
      const finalSlug = placesRepo.createPlace.mock.calls[0][0].slug;
      expect(finalSlug).not.toBe(baseSlug);
      expect(finalSlug.startsWith(baseSlug)).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // update
  // -------------------------------------------------------------------------
  describe('update', () => {
    beforeEach(() => {
      placesRepo.getCardByIdIncludingInactive.mockResolvedValue({ id: 'p1', status: PlaceStatus.PUBLISHED });
    });

    it('không tìm thấy → NotFound', async () => {
      placesRepo.getCardByIdIncludingInactive.mockResolvedValue(null);

      await expect(service.update('p1', {} as UpdatePlaceDto, 'u1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(placesRepo.updateScalars).not.toHaveBeenCalled();
    });

    it('category_id mới không tồn tại → BadRequest, KHÔNG ghi', async () => {
      categoriesRepo.findById.mockResolvedValue(null);

      await expect(
        service.update('p1', { category_id: CATEGORY_ID } as UpdatePlaceDto, 'u1'),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(placesRepo.updateScalars).not.toHaveBeenCalled();
    });

    it('ánh xạ snake_case (contract) → camelCase (entity) đúng từng trường', async () => {
      categoriesRepo.findById.mockResolvedValue({ id: CATEGORY_ID });

      await service.update(
        'p1',
        {
          category_id: CATEGORY_ID,
          short_description: 'ngắn',
          opening_hours: { is_24h: true },
          price_range: 'low',
        } as UpdatePlaceDto,
        'u1',
      );

      const [, patch] = placesRepo.updateScalars.mock.calls[0];
      expect(patch).toMatchObject({
        categoryId: CATEGORY_ID,
        shortDescription: 'ngắn',
        openingHours: { is_24h: true },
        priceRange: 'low',
        updatedBy: 'u1',
      });
      // Khoá snake_case KHÔNG được lọt xuống ORM.
      expect(patch).not.toHaveProperty('short_description');
      expect(patch).not.toHaveProperty('opening_hours');
      expect(patch).not.toHaveProperty('price_range');
      expect(patch).not.toHaveProperty('category_id');
    });

    it('updateLocation CHỈ gọi khi có location', async () => {
      await service.update('p1', { name: 'Tên mới' } as UpdatePlaceDto, 'u1');
      expect(placesRepo.updateLocation).not.toHaveBeenCalled();

      await service.update('p1', { location: VALID_LOCATION } as UpdatePlaceDto, 'u1');
      expect(placesRepo.updateLocation).toHaveBeenCalledWith(
        'p1',
        VALID_LOCATION.lng,
        VALID_LOCATION.lat,
      );
    });

    it('ghi revision khi có trường revisable đổi — status APPROVED, diff liệt kê trường', async () => {
      await service.update('p1', { name: 'Tên mới' } as UpdatePlaceDto, 'u1');

      const [revision] = revisions.recordPlaceRevision.mock.calls[0];
      expect(revision.status).toBe(RevisionStatus.APPROVED);
      expect(revision.diff).toEqual({ fields: ['name'] });
      expect(revision.editorId).toBe('u1');
    });

    // Administrative Data Backfill (2026-08-18) — tham số hoá `origin`, KHÔNG được đổi hành vi mặc
    // định của bất kỳ caller nào hiện có (route PATCH duy nhất gọi 3 tham số, không truyền origin).
    it('KHÔNG truyền origin → mặc định COMMUNITY_EDIT (giữ nguyên hành vi cũ)', async () => {
      await service.update('p1', { name: 'Tên mới' } as UpdatePlaceDto, 'u1');

      const [revision] = revisions.recordPlaceRevision.mock.calls[0];
      expect(revision.origin).toBe(RevisionOrigin.COMMUNITY_EDIT);
    });

    it('truyền origin=IMPORT → revision ghi đúng kênh đó (đợt backfill hành chính)', async () => {
      await service.update('p1', { province: 'An Giang' } as UpdatePlaceDto, 'u1', RevisionOrigin.IMPORT);

      const [revision] = revisions.recordPlaceRevision.mock.calls[0];
      expect(revision.origin).toBe(RevisionOrigin.IMPORT);
      expect(revision.diff).toEqual({ fields: ['province'] });
    });

    it('KHÔNG ghi revision khi patch rỗng (không trường revisable nào đổi)', async () => {
      await service.update('p1', {} as UpdatePlaceDto, 'u1');

      expect(revisions.recordPlaceRevision).not.toHaveBeenCalled();
      // updatedBy vẫn được ghi — dấu vết người sửa không phụ thuộc revision.
      const [, patch] = placesRepo.updateScalars.mock.calls[0];
      expect(patch).toEqual({ updatedBy: 'u1' });
    });
  });

  // -------------------------------------------------------------------------
  // archive / approve — chuyển trạng thái đặc quyền + audit ADR-016
  // -------------------------------------------------------------------------
  describe('archive', () => {
    it('không tìm thấy → NotFound, KHÔNG archive, KHÔNG audit', async () => {
      placesRepo.getCardByIdIncludingInactive.mockResolvedValue(null);

      await expect(service.archive('p1', 'admin1')).rejects.toBeInstanceOf(NotFoundException);
      expect(placesRepo.archive).not.toHaveBeenCalled();
      expect(audit.record).not.toHaveBeenCalled();
    });

    it('ghi audit place.status_changed với permission Place.Archive và from/to đúng', async () => {
      placesRepo.getCardByIdIncludingInactive.mockResolvedValue({ id: 'p1', status: PlaceStatus.PUBLISHED });

      await service.archive('p1', 'admin1');

      expect(placesRepo.archive).toHaveBeenCalledWith('p1');
      const [event] = audit.record.mock.calls[0];
      expect(event).toMatchObject({
        event: 'place.status_changed',
        entityType: 'place',
        entityId: 'p1',
        actorId: 'admin1',
        permission: 'Place.Archive',
        context: { from: PlaceStatus.PUBLISHED, to: PlaceStatus.ARCHIVED },
      });
    });
  });

  describe('approve', () => {
    it('không tìm thấy → NotFound, KHÔNG đổi trạng thái, KHÔNG audit', async () => {
      placesRepo.getCardByIdIncludingInactive.mockResolvedValue(null);

      await expect(service.approve('p1', 'admin1')).rejects.toBeInstanceOf(NotFoundException);
      expect(placesRepo.setStatus).not.toHaveBeenCalled();
      expect(audit.record).not.toHaveBeenCalled();
    });

    it('đặt PUBLISHED và ghi audit với permission Place.Approve, from = trạng thái cũ', async () => {
      placesRepo.getCardByIdIncludingInactive.mockResolvedValue({ id: 'p1', status: PlaceStatus.PENDING });

      await service.approve('p1', 'admin1');

      expect(placesRepo.setStatus).toHaveBeenCalledWith('p1', PlaceStatus.PUBLISHED);
      const [event] = audit.record.mock.calls[0];
      expect(event).toMatchObject({
        permission: 'Place.Approve',
        context: { from: PlaceStatus.PENDING, to: PlaceStatus.PUBLISHED },
      });
    });
  });

  // -------------------------------------------------------------------------
  // getBySlug — chỉ một khẳng định đại diện (satellite mapper có spec riêng)
  // -------------------------------------------------------------------------
  describe('getBySlug', () => {
    it('không tìm thấy (hoặc chưa published) → NotFound', async () => {
      placesRepo.getDetailBySlug.mockResolvedValue(null);

      await expect(service.getBySlug('bai-sao')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('ghép đủ contacts/prices/media/faqs vào payload chi tiết', async () => {
      placesRepo.getDetailBySlug.mockResolvedValue({ id: 'p1' });
      contactsRepo.listByOwner.mockResolvedValue([]);
      pricesRepo.current.mockResolvedValue([]);
      mediaRepo.listPublishedByPlace.mockResolvedValue([]);
      placesRepo.listFaqs.mockResolvedValue([]);

      const res = await service.getBySlug('bai-sao');

      expect(res).toMatchObject({ id: 'p1', contacts: [], prices: [], media: [], faqs: [] });
      // Satellite phải tra theo discriminator đa hình lowercase 'place' (B-3).
      expect(contactsRepo.listByOwner).toHaveBeenCalledWith('place', 'p1');
      expect(pricesRepo.current).toHaveBeenCalledWith('place', 'p1');
    });

    // Secure Private Media (2026-08-10): gallery Place giờ phát URL API ỔN ĐỊNH theo media id, KHÔNG
    // phải URL object storage theo object_key. Resolver nhận id — object_key không bao giờ rời server.
    it('media published có object_key → dựng URL API ổn định qua mediaUrl.fileUrl (toMedia resolver)', async () => {
      placesRepo.getDetailBySlug.mockResolvedValue({ id: 'p1' });
      contactsRepo.listByOwner.mockResolvedValue([]);
      pricesRepo.current.mockResolvedValue([]);
      mediaRepo.listPublishedByPlace.mockResolvedValue([
        { id: 'm1', type: 'image', url: null, status: 'published', objectKey: 'media/m1.jpg' },
      ]);
      placesRepo.listFaqs.mockResolvedValue([]);
      mediaUrl.fileUrl.mockReturnValue('https://phuquochub.com/api/media/m1/file');

      const res = await service.getBySlug('bai-sao');

      expect(mediaUrl.fileUrl).toHaveBeenCalledWith('m1');
      expect(res.media).toEqual([
        expect.objectContaining({ id: 'm1', url: 'https://phuquochub.com/api/media/m1/file' }),
      ]);
    });

    it('SECURITY: gallery KHÔNG BAO GIỜ lộ object_key hay origin object storage ra response', async () => {
      placesRepo.getDetailBySlug.mockResolvedValue({ id: 'p1' });
      contactsRepo.listByOwner.mockResolvedValue([]);
      pricesRepo.current.mockResolvedValue([]);
      mediaRepo.listPublishedByPlace.mockResolvedValue([
        { id: 'm1', type: 'image', url: null, status: 'published', objectKey: 'media/secret-key.jpg' },
      ]);
      placesRepo.listFaqs.mockResolvedValue([]);
      mediaUrl.fileUrl.mockReturnValue('https://phuquochub.com/api/media/m1/file');

      const res = await service.getBySlug('bai-sao');

      const serialized = JSON.stringify(res.media);
      expect(serialized).not.toContain('secret-key.jpg');
      expect(serialized).not.toContain('media.phuquochub.com');
    });

    it('media KHÔNG published → url null, resolver không được gọi (không rò rỉ ảnh chưa duyệt)', async () => {
      placesRepo.getDetailBySlug.mockResolvedValue({ id: 'p1' });
      contactsRepo.listByOwner.mockResolvedValue([]);
      pricesRepo.current.mockResolvedValue([]);
      mediaRepo.listPublishedByPlace.mockResolvedValue([
        { id: 'm1', type: 'image', url: null, status: 'pending', objectKey: 'media/m1.jpg' },
      ]);
      placesRepo.listFaqs.mockResolvedValue([]);

      const res = await service.getBySlug('bai-sao');

      expect(mediaUrl.fileUrl).not.toHaveBeenCalled();
      expect(res.media).toEqual([expect.objectContaining({ id: 'm1', url: null })]);
    });
  });

  // -------------------------------------------------------------------------
  // F-1 / OD-F-1 — toạ độ ngoài hộp PROVISIONAL: CHẤP NHẬN + phát tín hiệu kiểm toán
  // -------------------------------------------------------------------------
  describe('tín hiệu toạ độ ngoài hộp PROVISIONAL (F-1)', () => {
    const OUT_OF_BOX = { lat: 9.3, lng: 103.47 }; // ~Thổ Chu: ngoài cả hai cận dưới

    function spyWarn(): jest.SpyInstance {
      return jest.spyOn(service['logger'], 'warn').mockImplementation(() => undefined);
    }

    function armCreate(): void {
      categoriesRepo.findById.mockResolvedValue({ id: CATEGORY_ID });
      placesRepo.existsBySlug.mockResolvedValue(false);
      placesRepo.createPlace.mockResolvedValue('p1');
      placesRepo.getCardByIdIncludingInactive.mockResolvedValue({ id: 'p1', status: PlaceStatus.PENDING });
    }

    it('create ngoài hộp: KHÔNG ném lỗi, vẫn ghi Place, và phát cảnh báo có cấu trúc', async () => {
      armCreate();
      const warn = spyWarn();

      await expect(
        service.create({ name: 'Bãi Thổ Chu', category_id: CATEGORY_ID, location: OUT_OF_BOX } as CreatePlaceDto, 'u1'),
      ).resolves.toBeDefined();

      // Dữ liệu vẫn được ghi — đây là điểm mấu chốt của OD-F-1.
      expect(placesRepo.createPlace).toHaveBeenCalled();
      expect(warn).toHaveBeenCalledTimes(1);

      const payload = warn.mock.calls[0][0] as Record<string, unknown>;
      expect(payload).toMatchObject({
        event: 'place.coordinate.outside_provisional_bounds',
        finding: 'F-1',
        boundary_status: 'PROVISIONAL',
        accepted: true,
        needs_review: true,
        action: 'create',
        actor_id: 'u1',
        location: OUT_OF_BOX,
      });
      // Nêu đích danh trường nào lệch và hộp nào đang áp — kiểm toán được, không mơ hồ.
      expect(payload.outside_fields).toEqual([
        { field: 'lat', value: 9.3, bounds: [PHU_QUOC_BOUNDS.minLat, PHU_QUOC_BOUNDS.maxLat] },
        { field: 'lng', value: 103.47, bounds: [PHU_QUOC_BOUNDS.minLng, PHU_QUOC_BOUNDS.maxLng] },
      ]);
    });

    it('create TRONG hộp: không phát tín hiệu nào (đường đi phổ biến phải im lặng)', async () => {
      armCreate();
      const warn = spyWarn();

      await service.create({ name: 'Bãi Sao', category_id: CATEGORY_ID, location: VALID_LOCATION } as CreatePlaceDto, 'u1');

      expect(warn).not.toHaveBeenCalled();
    });

    it('chỉ một trường lệch → chỉ trường đó được nêu', async () => {
      armCreate();
      const warn = spyWarn();

      await service.create(
        { name: 'X', category_id: CATEGORY_ID, location: { lat: 10.2, lng: 105.08 } } as CreatePlaceDto,
        'u1',
      );

      const payload = warn.mock.calls[0][0] as { outside_fields: Array<{ field: string }> };
      expect(payload.outside_fields.map((f) => f.field)).toEqual(['lng']);
    });

    it('update ngoài hộp: phát tín hiệu kèm place_id', async () => {
      placesRepo.getCardByIdIncludingInactive.mockResolvedValue({ id: 'p1', status: PlaceStatus.PUBLISHED });
      const warn = spyWarn();

      await service.update('p1', { location: OUT_OF_BOX } as UpdatePlaceDto, 'u2');

      expect(warn).toHaveBeenCalledTimes(1);
      expect(warn.mock.calls[0][0]).toMatchObject({ action: 'update', place_id: 'p1', actor_id: 'u2' });
    });

    it('update KHÔNG đổi location: không phát tín hiệu', async () => {
      placesRepo.getCardByIdIncludingInactive.mockResolvedValue({ id: 'p1', status: PlaceStatus.PUBLISHED });
      const warn = spyWarn();

      await service.update('p1', { name: 'Tên mới' } as UpdatePlaceDto, 'u2');

      expect(warn).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // listMine — PLACE-041 (Place Content Management MVP): "địa điểm tôi quản lý" = business_id
  // nào user có grant Place.Edit.Managed hiệu lực, CÙNG định nghĩa PATCH /places/:id đang dùng.
  // -------------------------------------------------------------------------
  describe('listMine', () => {
    it('không có grant nào → mảng rỗng, không đọc place nào', async () => {
      userRolesRepo.getScopedGrants.mockResolvedValue([]);

      const result = await service.listMine('u1');

      expect(result).toEqual([]);
      expect(placesRepo.getCardByIdIncludingInactive).not.toHaveBeenCalled();
    });

    it('có grant Managed hiệu lực trên một business_id → trả place đó (mapped qua toPlaceDetail)', async () => {
      userRolesRepo.getScopedGrants.mockResolvedValue([
        { code: 'Place.Edit.Managed', effect: 'allow', scopeType: 'managed', businessId: 'p1' },
      ]);
      authz.canWithGrants.mockResolvedValue(true);
      placesRepo.getCardByIdIncludingInactive.mockResolvedValue({ id: 'p1', status: PlaceStatus.PUBLISHED });

      const result = await service.listMine('u1');

      expect(result).toEqual([{ id: 'p1', mappedDetail: true }]);
      expect(placesRepo.getCardByIdIncludingInactive).toHaveBeenCalledWith('p1');
      // PDP thật (canWithGrants) được gọi lại để xác nhận — không tự suy ra "quản lý được" từ
      // riêng bước liệt kê ứng viên.
      expect(authz.canWithGrants).toHaveBeenCalledWith(
        expect.any(Array),
        'u1',
        'Place.Edit.Managed',
        expect.any(Function),
      );
      const ctx = await authz.canWithGrants.mock.calls[0][3]();
      expect(ctx).toEqual({ resourceType: 'place', resourceId: 'p1', businessId: 'p1', ownerId: null });
    });

    it('grant Any/global (businessId null, vd Place.Edit.Any) → KHÔNG phải ứng viên, không gọi PDP', async () => {
      userRolesRepo.getScopedGrants.mockResolvedValue([
        { code: 'Place.Edit.Any', effect: 'allow', scopeType: 'global', businessId: null },
      ]);

      const result = await service.listMine('u1');

      expect(result).toEqual([]);
      expect(authz.canWithGrants).not.toHaveBeenCalled();
      expect(placesRepo.getCardByIdIncludingInactive).not.toHaveBeenCalled();
    });

    it('PDP xác nhận KHÔNG cho quản lý (vd deny) → loại khỏi kết quả dù có grant candidate', async () => {
      userRolesRepo.getScopedGrants.mockResolvedValue([
        { code: 'Place.Edit.Managed', effect: 'allow', scopeType: 'managed', businessId: 'p1' },
      ]);
      authz.canWithGrants.mockResolvedValue(false);

      const result = await service.listMine('u1');

      expect(result).toEqual([]);
      expect(placesRepo.getCardByIdIncludingInactive).not.toHaveBeenCalled();
    });

    it('place đã bị archive/xoá mềm giữa lúc kiểm quyền và lúc đọc (row null) → bỏ qua an toàn', async () => {
      userRolesRepo.getScopedGrants.mockResolvedValue([
        { code: 'Place.Edit.Managed', effect: 'allow', scopeType: 'managed', businessId: 'p1' },
      ]);
      authz.canWithGrants.mockResolvedValue(true);
      placesRepo.getCardByIdIncludingInactive.mockResolvedValue(null);

      const result = await service.listMine('u1');

      expect(result).toEqual([]);
    });

    it('nhiều business_id quản lý được → trả đủ, mỗi id một lần dù grant trùng lặp', async () => {
      userRolesRepo.getScopedGrants.mockResolvedValue([
        { code: 'Place.Edit.Managed', effect: 'allow', scopeType: 'managed', businessId: 'p1' },
        { code: 'Contact.Edit.Managed', effect: 'allow', scopeType: 'managed', businessId: 'p1' },
        { code: 'Place.Edit.Managed', effect: 'allow', scopeType: 'managed', businessId: 'p2' },
      ]);
      authz.canWithGrants.mockResolvedValue(true);
      placesRepo.getCardByIdIncludingInactive.mockImplementation(async (id: string) => ({
        id,
        status: PlaceStatus.PUBLISHED,
      }));

      const result = await service.listMine('u1');

      expect(placesRepo.getCardByIdIncludingInactive).toHaveBeenCalledTimes(2);
      expect(result).toEqual(
        expect.arrayContaining([
          { id: 'p1', mappedDetail: true },
          { id: 'p2', mappedDetail: true },
        ]),
      );
    });
  });
});
