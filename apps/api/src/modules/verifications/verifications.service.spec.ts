import { ConflictException, ForbiddenException, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { VerificationsService } from './verifications.service';
import { VerificationsRepository, type OverdueVerificationCandidate } from './repositories/verifications.repository';
import { VerificationEventsRepository } from './repositories/verification-events.repository';
import { VerificationVotesRepository } from './repositories/verification-votes.repository';
import { PlacesRepository } from '../places/repositories/places.repository';
import { ContactsRepository } from '../contacts/repositories/contacts.repository';
import { PricesRepository } from '../prices/repositories/prices.repository';
import { SourcesRepository } from '../sources/repositories/sources.repository';
import { AuditService } from '../../core/audit/audit.service';
import { Verification } from './entities/verification.entity';
import { Source } from '../sources/entities/source.entity';
import { VerificationMethod, VerificationTargetType, VerificationVoteChoice } from './verification.enums';
import { VerificationStatus } from '../places/place.enums';
import { SourceType, SourceKind } from '../sources/sources.enums';
import { createMock, LooseMock } from '../../../test/helpers/create-mock';

function makeVerification(overrides: Partial<Verification> = {}): Verification {
  const v = new Verification();
  v.id = 'verif-1';
  v.placeId = 'place-1';
  v.contactId = null;
  v.priceHistoryId = null;
  v.status = VerificationStatus.PENDING;
  v.method = VerificationMethod.MODERATOR;
  v.sourceId = null;
  v.confidence = null;
  v.confirmCount = 0;
  v.disputeCount = 0;
  v.reasonCode = null;
  v.verifiedBy = null;
  v.assignedTo = null;
  v.assignedAt = null;
  v.slaDueAt = null;
  v.priority = 0;
  v.note = null;
  v.rejectedReason = null;
  v.validFrom = null;
  v.expiresAt = null;
  v.lockVersion = 0;
  v.createdBy = 'mod-1';
  v.createdAt = new Date('2026-08-01T00:00:00Z');
  v.updatedAt = new Date('2026-08-01T00:00:00Z');
  return Object.assign(v, overrides);
}

// Hàng `places` tối giản cho `getCardByIdIncludingInactive` — chỉ `verification_status` là thứ
// service thực sự đọc (guard C1); phần còn lại chỉ cần tồn tại để thoả kiểu PlaceCardRow.
function makePlaceCard(verificationStatus: VerificationStatus = VerificationStatus.PENDING) {
  return { id: 'place-1', verification_status: verificationStatus } as unknown as ReturnType<
    PlacesRepository['getCardByIdIncludingInactive']
  > extends Promise<infer T>
    ? T
    : never;
}

function makeSource(overrides: Partial<Source> = {}): Source {
  const s = new Source();
  s.id = 'source-1';
  s.type = SourceType.OFFICIAL_WEBSITE;
  s.kind = SourceKind.URL;
  s.reliability = 90;
  return Object.assign(s, overrides);
}

describe('VerificationsService', () => {
  let verificationsRepo: LooseMock<VerificationsRepository>;
  let eventsRepo: LooseMock<VerificationEventsRepository>;
  let votesRepo: LooseMock<VerificationVotesRepository>;
  let placesRepo: LooseMock<PlacesRepository>;
  let contactsRepo: LooseMock<ContactsRepository>;
  let pricesRepo: LooseMock<PricesRepository>;
  let sourcesRepo: LooseMock<SourcesRepository>;
  let audit: LooseMock<AuditService>;
  let dataSource: LooseMock<DataSource>;
  let manager: EntityManager;
  let service: VerificationsService;

  beforeEach(() => {
    manager = createMock<EntityManager>();
    verificationsRepo = createMock<VerificationsRepository>({
      findById: jest.fn(),
      findActiveByTarget: jest.fn(),
      create: jest.fn(),
      casUpdate: jest.fn(),
      list: jest.fn(),
      findOverdueTrustedBatch: jest.fn(),
    });
    eventsRepo = createMock<VerificationEventsRepository>({
      append: jest.fn(),
      listByVerification: jest.fn(),
    });
    votesRepo = createMock<VerificationVotesRepository>({ cast: jest.fn(), tally: jest.fn() });
    placesRepo = createMock<PlacesRepository>({ getCardByIdIncludingInactive: jest.fn(), updateScalars: jest.fn() });
    contactsRepo = createMock<ContactsRepository>({ findById: jest.fn(), updateScalars: jest.fn() });
    pricesRepo = createMock<PricesRepository>({ findById: jest.fn(), updateScalars: jest.fn() });
    sourcesRepo = createMock<SourcesRepository>({ findById: jest.fn() });
    audit = createMock<AuditService>({ record: jest.fn() });
    dataSource = createMock<DataSource>({
      transaction: jest.fn((cb: (m: EntityManager) => Promise<unknown>) => cb(manager)),
    });
    service = new VerificationsService(
      verificationsRepo,
      eventsRepo,
      votesRepo,
      placesRepo,
      contactsRepo,
      pricesRepo,
      sourcesRepo,
      audit,
      dataSource,
    );
  });

  describe('submit', () => {
    it('target không tồn tại -> NotFoundException, KHÔNG mở transaction ghi gì', async () => {
      placesRepo.getCardByIdIncludingInactive.mockResolvedValue(null);
      await expect(
        service.submit({ target_type: VerificationTargetType.PLACE, target_id: 'missing' }, 'mod-1'),
      ).rejects.toThrow(NotFoundException);
      expect(verificationsRepo.create).not.toHaveBeenCalled();
    });

    it('chưa từng có dòng -> tạo pending mới, ghi event (from=null), đồng bộ cache pending', async () => {
      placesRepo.getCardByIdIncludingInactive.mockResolvedValue(makePlaceCard());
      verificationsRepo.findActiveByTarget.mockResolvedValue(null);
      verificationsRepo.create.mockResolvedValue(makeVerification());

      const result = await service.submit(
        { target_type: VerificationTargetType.PLACE, target_id: 'place-1', note: 'ghi chú' },
        'mod-1',
      );

      expect(verificationsRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ placeId: 'place-1', method: VerificationMethod.MODERATOR, createdBy: 'mod-1' }),
        manager,
      );
      expect(eventsRepo.append).toHaveBeenCalledWith(
        expect.objectContaining({ fromStatus: null, toStatus: VerificationStatus.PENDING, actorId: 'mod-1' }),
        manager,
      );
      expect(placesRepo.updateScalars).toHaveBeenCalledWith(
        'place-1',
        { verificationStatus: VerificationStatus.PENDING },
        manager,
      );
      expect(result.status).toBe(VerificationStatus.PENDING);
      expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ event: 'verification.submitted' }));
    });

    it('đã có dòng đang pending -> ConflictException (KHÔNG resubmit được, chưa expired/rejected)', async () => {
      placesRepo.getCardByIdIncludingInactive.mockResolvedValue(makePlaceCard());
      verificationsRepo.findActiveByTarget.mockResolvedValue(makeVerification({ status: VerificationStatus.PENDING }));

      await expect(
        service.submit({ target_type: VerificationTargetType.PLACE, target_id: 'place-1' }, 'mod-1'),
      ).rejects.toThrow(UnprocessableEntityException);
    });

    it('dòng đã expired -> gửi lại (CAS về pending), ghi event fromStatus=expired', async () => {
      placesRepo.getCardByIdIncludingInactive.mockResolvedValue(makePlaceCard());
      verificationsRepo.findActiveByTarget.mockResolvedValue(
        makeVerification({ status: VerificationStatus.EXPIRED, lockVersion: 3 }),
      );
      verificationsRepo.casUpdate.mockResolvedValue(true);

      const result = await service.submit({ target_type: VerificationTargetType.PLACE, target_id: 'place-1' }, 'mod-1');

      expect(verificationsRepo.casUpdate).toHaveBeenCalledWith(
        'verif-1',
        3,
        expect.objectContaining({ status: VerificationStatus.PENDING }),
        manager,
      );
      expect(eventsRepo.append).toHaveBeenCalledWith(
        expect.objectContaining({ fromStatus: VerificationStatus.EXPIRED, toStatus: VerificationStatus.PENDING }),
        manager,
      );
      expect(result.status).toBe(VerificationStatus.PENDING);
    });

    // --- ADR-008 CORRECTION (PIR finding C1) — guard phòng vệ, phía Verification ---
    it.each([VerificationStatus.OFFICIAL, VerificationStatus.VERIFIED, VerificationStatus.COMMUNITY_VERIFIED])(
      'C1 guard: cache đang %s mà KHÔNG có dòng verifications -> ConflictException, KHÔNG tạo dòng, KHÔNG hạ cấp cache',
      async (cachedStatus) => {
        placesRepo.getCardByIdIncludingInactive.mockResolvedValue(makePlaceCard(cachedStatus));
        verificationsRepo.findActiveByTarget.mockResolvedValue(null);

        await expect(
          service.submit({ target_type: VerificationTargetType.PLACE, target_id: 'place-1' }, 'mod-1'),
        ).rejects.toThrow(ConflictException);

        expect(verificationsRepo.create).not.toHaveBeenCalled();
        expect(placesRepo.updateScalars).not.toHaveBeenCalled();
        expect(eventsRepo.append).not.toHaveBeenCalled();
      },
    );

    it.each([VerificationStatus.PENDING, VerificationStatus.EXPIRED, VerificationStatus.REJECTED])(
      'C1 guard: cache %s (KHÔNG tin cậy) -> submit chạy bình thường',
      async (cachedStatus) => {
        placesRepo.getCardByIdIncludingInactive.mockResolvedValue(makePlaceCard(cachedStatus));
        verificationsRepo.findActiveByTarget.mockResolvedValue(null);
        verificationsRepo.create.mockResolvedValue(makeVerification());

        await expect(
          service.submit({ target_type: VerificationTargetType.PLACE, target_id: 'place-1' }, 'mod-1'),
        ).resolves.toBeDefined();
        expect(verificationsRepo.create).toHaveBeenCalled();
      },
    );

    // --- ADR-008 CORRECTION (PIR finding T1) — 23505 -> 409, không phải 500 ---
    it('T1: submit đồng thời làm INSERT vi phạm uq_verif_place -> ConflictException (không rò lỗi DB thô)', async () => {
      placesRepo.getCardByIdIncludingInactive.mockResolvedValue(makePlaceCard());
      verificationsRepo.findActiveByTarget.mockResolvedValue(null);
      verificationsRepo.create.mockRejectedValue(
        Object.assign(new Error('duplicate key value violates unique constraint'), {
          code: '23505',
          constraint: 'uq_verif_place',
        }),
      );

      await expect(
        service.submit({ target_type: VerificationTargetType.PLACE, target_id: 'place-1' }, 'mod-1'),
      ).rejects.toThrow(ConflictException);
    });

    it('T1: lỗi DB KHÁC (không phải 23505 của target unique) vẫn nổi lên nguyên trạng, KHÔNG bị nuốt thành 409', async () => {
      placesRepo.getCardByIdIncludingInactive.mockResolvedValue(makePlaceCard());
      verificationsRepo.findActiveByTarget.mockResolvedValue(null);
      verificationsRepo.create.mockRejectedValue(
        Object.assign(new Error('not-null violation'), { code: '23502' }),
      );

      await expect(
        service.submit({ target_type: VerificationTargetType.PLACE, target_id: 'place-1' }, 'mod-1'),
      ).rejects.toThrow('not-null violation');
    });

    // --- ADR-008 CORRECTION (PIR finding F1) — trường trạng thái cuối không được sống sót ---
    it('F1: gửi lại từ rejected/expired -> XOÁ reasonCode/rejectedReason/expiresAt trong CÙNG patch', async () => {
      placesRepo.getCardByIdIncludingInactive.mockResolvedValue(makePlaceCard(VerificationStatus.REJECTED));
      verificationsRepo.findActiveByTarget.mockResolvedValue(
        makeVerification({
          status: VerificationStatus.REJECTED,
          reasonCode: 'fabricated' as never,
          rejectedReason: 'bằng chứng giả',
          expiresAt: new Date('2026-01-01T00:00:00Z'),
          lockVersion: 7,
        }),
      );
      verificationsRepo.casUpdate.mockResolvedValue(true);

      await service.submit({ target_type: VerificationTargetType.PLACE, target_id: 'place-1' }, 'mod-1');

      expect(verificationsRepo.casUpdate).toHaveBeenCalledWith(
        'verif-1',
        7,
        expect.objectContaining({
          status: VerificationStatus.PENDING,
          reasonCode: null,
          rejectedReason: null,
          expiresAt: null,
        }),
        manager,
      );
    });

    it('CAS thua khi gửi lại -> ConflictException', async () => {
      placesRepo.getCardByIdIncludingInactive.mockResolvedValue(makePlaceCard());
      verificationsRepo.findActiveByTarget.mockResolvedValue(makeVerification({ status: VerificationStatus.REJECTED }));
      verificationsRepo.casUpdate.mockResolvedValue(false);

      await expect(
        service.submit({ target_type: VerificationTargetType.PLACE, target_id: 'place-1' }, 'mod-1'),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('claim', () => {
    it('không tìm thấy -> NotFoundException', async () => {
      verificationsRepo.findById.mockResolvedValue(null);
      await expect(service.claim('missing', {}, 'mod-1')).rejects.toThrow(NotFoundException);
    });

    it('đã được moderator KHÁC nhận việc -> ForbiddenException', async () => {
      verificationsRepo.findById.mockResolvedValue(makeVerification({ assignedTo: 'mod-2' }));
      await expect(service.claim('verif-1', {}, 'mod-1')).rejects.toThrow(ForbiddenException);
    });

    it('re-claim chính mình -> OK (không lỗi)', async () => {
      verificationsRepo.findById
        .mockResolvedValueOnce(makeVerification({ assignedTo: 'mod-1', lockVersion: 1 }))
        .mockResolvedValueOnce(makeVerification({ assignedTo: 'mod-1', lockVersion: 2 }));
      verificationsRepo.casUpdate.mockResolvedValue(true);
      await expect(service.claim('verif-1', {}, 'mod-1')).resolves.toBeDefined();
    });

    it('thành công -> CAS set assignedTo/assignedAt/slaDueAt mặc định +48h/priority', async () => {
      verificationsRepo.findById
        .mockResolvedValueOnce(makeVerification({ lockVersion: 0 }))
        .mockResolvedValueOnce(makeVerification({ lockVersion: 1, assignedTo: 'mod-1' }));
      verificationsRepo.casUpdate.mockResolvedValue(true);

      await service.claim('verif-1', { priority: 2 }, 'mod-1');

      expect(verificationsRepo.casUpdate).toHaveBeenCalledWith(
        'verif-1',
        0,
        expect.objectContaining({ assignedTo: 'mod-1', priority: 2 }),
      );
      const patch = verificationsRepo.casUpdate.mock.calls[0][2] as { slaDueAt: Date; assignedAt: Date };
      expect(patch.slaDueAt.getTime() - patch.assignedAt.getTime()).toBe(48 * 60 * 60 * 1000);
    });
  });

  describe('verify', () => {
    it('không tìm thấy -> NotFoundException', async () => {
      verificationsRepo.findById.mockResolvedValue(null);
      await expect(service.verify('missing', {}, 'mod-1')).rejects.toThrow(NotFoundException);
    });

    it('status hiện tại không cho verify (vd official) -> UnprocessableEntityException, KHÔNG CAS', async () => {
      verificationsRepo.findById.mockResolvedValue(makeVerification({ status: VerificationStatus.OFFICIAL }));
      await expect(service.verify('verif-1', {}, 'mod-1')).rejects.toThrow(UnprocessableEntityException);
      expect(verificationsRepo.casUpdate).not.toHaveBeenCalled();
    });

    it('pending -> verified: CAS + event + cache sync verifiedAt', async () => {
      verificationsRepo.findById.mockResolvedValue(makeVerification({ lockVersion: 5 }));
      verificationsRepo.casUpdate.mockResolvedValue(true);

      await service.verify('verif-1', { confidence: 80 }, 'mod-1');

      expect(verificationsRepo.casUpdate).toHaveBeenCalledWith(
        'verif-1',
        5,
        expect.objectContaining({ status: VerificationStatus.VERIFIED, confidence: 80, verifiedBy: 'mod-1' }),
        manager,
      );
      expect(eventsRepo.append).toHaveBeenCalledWith(
        expect.objectContaining({ toStatus: VerificationStatus.VERIFIED, actorId: 'mod-1' }),
        manager,
      );
      expect(placesRepo.updateScalars).toHaveBeenCalledWith(
        'place-1',
        expect.objectContaining({ verificationStatus: VerificationStatus.VERIFIED, verifiedAt: expect.any(Date) }),
        manager,
      );
    });

    it('CAS thua -> ConflictException', async () => {
      verificationsRepo.findById.mockResolvedValue(makeVerification());
      verificationsRepo.casUpdate.mockResolvedValue(false);
      await expect(service.verify('verif-1', {}, 'mod-1')).rejects.toThrow(ConflictException);
    });

    it('F1: verify XOÁ reasonCode/rejectedReason (dòng verified không mang metadata bác bỏ)', async () => {
      verificationsRepo.findById.mockResolvedValue(
        makeVerification({ reasonCode: 'outdated' as never, rejectedReason: 'cũ' }),
      );
      verificationsRepo.casUpdate.mockResolvedValue(true);

      await service.verify('verif-1', {}, 'mod-1');

      expect(verificationsRepo.casUpdate).toHaveBeenCalledWith(
        'verif-1',
        0,
        expect.objectContaining({ reasonCode: null, rejectedReason: null }),
        manager,
      );
    });
  });

  describe('official', () => {
    it('source không tồn tại -> NotFoundException', async () => {
      verificationsRepo.findById.mockResolvedValue(makeVerification());
      sourcesRepo.findById.mockResolvedValue(null);
      await expect(service.official('verif-1', { source_id: 'src-missing' }, 'mod-1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('source SAI nhóm chính thức (vd google_maps) -> UnprocessableEntityException', async () => {
      verificationsRepo.findById.mockResolvedValue(makeVerification());
      sourcesRepo.findById.mockResolvedValue(makeSource({ type: SourceType.GOOGLE_MAPS }));
      await expect(service.official('verif-1', { source_id: 'source-1' }, 'mod-1')).rejects.toThrow(
        UnprocessableEntityException,
      );
    });

    it.each([SourceType.OFFICIAL_WEBSITE, SourceType.BUSINESS_OWNER, SourceType.GOVERNMENT])(
      'source nhóm chính thức (%s) -> OK, mặc định expires_at +12 tháng khi không truyền',
      async (type) => {
        verificationsRepo.findById.mockResolvedValue(makeVerification({ lockVersion: 1 }));
        sourcesRepo.findById.mockResolvedValue(makeSource({ type }));
        verificationsRepo.casUpdate.mockResolvedValue(true);

        await service.official('verif-1', { source_id: 'source-1' }, 'mod-1');

        const patch = verificationsRepo.casUpdate.mock.calls[0][2] as { expiresAt: Date; status: VerificationStatus };
        expect(patch.status).toBe(VerificationStatus.OFFICIAL);
        const expectedMonthsMs = 350 * 24 * 60 * 60 * 1000; // ~12 tháng, biên rộng tránh nhạy cảm giờ mùa/độ dài tháng
        expect(patch.expiresAt.getTime() - Date.now()).toBeGreaterThan(expectedMonthsMs);
      },
    );

    it('price_history + expires_at=null tường minh -> UnprocessableEntityException (bắt buộc)', async () => {
      verificationsRepo.findById.mockResolvedValue(
        makeVerification({ placeId: null, priceHistoryId: 'price-1' }),
      );
      sourcesRepo.findById.mockResolvedValue(makeSource());
      await expect(
        service.official('verif-1', { source_id: 'source-1', expires_at: null }, 'mod-1'),
      ).rejects.toThrow(UnprocessableEntityException);
    });

    it('place + expires_at=null tường minh -> OK, không hết hạn', async () => {
      verificationsRepo.findById.mockResolvedValue(makeVerification({ lockVersion: 0 }));
      sourcesRepo.findById.mockResolvedValue(makeSource());
      verificationsRepo.casUpdate.mockResolvedValue(true);

      await service.official('verif-1', { source_id: 'source-1', expires_at: null }, 'mod-1');

      const patch = verificationsRepo.casUpdate.mock.calls[0][2] as { expiresAt: Date | null };
      expect(patch.expiresAt).toBeNull();
    });
  });

  // CLAIM -> SOURCE -> VERIFICATION INTEGRATION (2026-08-06). `ensureOfficialFromClaim()` là điểm
  // vào NỘI BỘ `BusinessClaimsService.decide()` gọi TRONG transaction của chính nó (truyền
  // `manager` trực tiếp — KHÔNG mở transaction ở đây, khác `submit()`/`official()` qua HTTP).
  describe('ensureOfficialFromClaim', () => {
    it('CHƯA có dòng verifications nào -> tạo pending (method owner_claim) rồi transition sang official', async () => {
      verificationsRepo.findActiveByTarget.mockResolvedValue(null);
      verificationsRepo.create.mockResolvedValue(makeVerification({ status: VerificationStatus.PENDING, lockVersion: 0 }));
      sourcesRepo.findById.mockResolvedValue(makeSource({ type: SourceType.BUSINESS_OWNER }));
      verificationsRepo.casUpdate.mockResolvedValue(true);

      const result = await service.ensureOfficialFromClaim(
        'place-1',
        { sourceId: 'source-1', actorId: 'mod-1', note: 'ghi chú claim' },
        manager,
      );

      expect(verificationsRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ placeId: 'place-1', method: VerificationMethod.OWNER_CLAIM, createdBy: 'mod-1' }),
        manager,
      );
      // Hai bước ghi tách biệt (create-pending rồi transition) — CẢ HAI qua ĐÚNG đường CAS/event/cache
      // đã có, KHÔNG logic thứ hai: eventsRepo.append 2 lần (null->pending, pending->official).
      expect(eventsRepo.append).toHaveBeenCalledTimes(2);
      expect(eventsRepo.append).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({ fromStatus: null, toStatus: VerificationStatus.PENDING, method: VerificationMethod.OWNER_CLAIM }),
        manager,
      );
      expect(eventsRepo.append).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          fromStatus: VerificationStatus.PENDING,
          toStatus: VerificationStatus.OFFICIAL,
          method: VerificationMethod.OWNER_CLAIM,
          sourceId: 'source-1',
        }),
        manager,
      );
      expect(verificationsRepo.casUpdate).toHaveBeenCalledTimes(1);
      expect(placesRepo.updateScalars).toHaveBeenCalledTimes(2);
      expect(result.status).toBe(VerificationStatus.OFFICIAL);
    });

    it('đã OFFICIAL rồi -> no-op, trả về nguyên trạng, KHÔNG ghi gì thêm', async () => {
      const existing = makeVerification({ status: VerificationStatus.OFFICIAL, sourceId: 'source-old' });
      verificationsRepo.findActiveByTarget.mockResolvedValue(existing);

      const result = await service.ensureOfficialFromClaim(
        'place-1',
        { sourceId: 'source-1', actorId: 'mod-1' },
        manager,
      );

      expect(result).toBe(existing);
      expect(verificationsRepo.create).not.toHaveBeenCalled();
      expect(verificationsRepo.casUpdate).not.toHaveBeenCalled();
      expect(eventsRepo.append).not.toHaveBeenCalled();
      expect(placesRepo.updateScalars).not.toHaveBeenCalled();
      // KHÔNG cần xác nhận source_id mới — nhánh no-op không chạm buildOfficialTransition.
      expect(sourcesRepo.findById).not.toHaveBeenCalled();
    });

    it.each([VerificationStatus.EXPIRED, VerificationStatus.REJECTED])(
      'dòng đang %s -> gửi lại (resubmit) rồi transition sang official (hai casUpdate)',
      async (status) => {
        const existing = makeVerification({ status, lockVersion: 2 });
        verificationsRepo.findActiveByTarget.mockResolvedValue(existing);
        sourcesRepo.findById.mockResolvedValue(makeSource({ type: SourceType.BUSINESS_OWNER }));
        verificationsRepo.casUpdate.mockResolvedValue(true);

        const result = await service.ensureOfficialFromClaim(
          'place-1',
          { sourceId: 'source-1', actorId: 'mod-1' },
          manager,
        );

        expect(verificationsRepo.create).not.toHaveBeenCalled();
        expect(verificationsRepo.casUpdate).toHaveBeenCalledTimes(2);
        expect(eventsRepo.append).toHaveBeenCalledTimes(2);
        expect(eventsRepo.append).toHaveBeenNthCalledWith(
          1,
          expect.objectContaining({ fromStatus: status, toStatus: VerificationStatus.PENDING }),
          manager,
        );
        expect(result.status).toBe(VerificationStatus.OFFICIAL);
      },
    );

    it.each([VerificationStatus.PENDING, VerificationStatus.VERIFIED, VerificationStatus.COMMUNITY_VERIFIED])(
      'dòng đang %s -> transition THẲNG sang official, KHÔNG tạo/resubmit',
      async (status) => {
        const existing = makeVerification({ status, lockVersion: 1 });
        verificationsRepo.findActiveByTarget.mockResolvedValue(existing);
        sourcesRepo.findById.mockResolvedValue(makeSource({ type: SourceType.BUSINESS_OWNER }));
        verificationsRepo.casUpdate.mockResolvedValue(true);

        const result = await service.ensureOfficialFromClaim(
          'place-1',
          { sourceId: 'source-1', actorId: 'mod-1' },
          manager,
        );

        expect(verificationsRepo.create).not.toHaveBeenCalled();
        expect(verificationsRepo.casUpdate).toHaveBeenCalledTimes(1);
        expect(verificationsRepo.casUpdate).toHaveBeenCalledWith(existing.id, 1, expect.anything(), manager);
        expect(eventsRepo.append).toHaveBeenCalledTimes(1);
        expect(result.status).toBe(VerificationStatus.OFFICIAL);
      },
    );

    it('source_id không hợp lệ -> NotFoundException, KHÔNG ghi gì (cùng validation với official() qua HTTP)', async () => {
      verificationsRepo.findActiveByTarget.mockResolvedValue(makeVerification({ status: VerificationStatus.PENDING }));
      sourcesRepo.findById.mockResolvedValue(null);

      await expect(
        service.ensureOfficialFromClaim('place-1', { sourceId: 'src-missing', actorId: 'mod-1' }, manager),
      ).rejects.toThrow(NotFoundException);
      expect(verificationsRepo.casUpdate).not.toHaveBeenCalled();
    });
  });

  describe('reject', () => {
    it('thành công -> CAS reasonCode/rejectedReason, cache sync KHÔNG set verifiedAt', async () => {
      verificationsRepo.findById.mockResolvedValue(makeVerification({ status: VerificationStatus.VERIFIED }));
      verificationsRepo.casUpdate.mockResolvedValue(true);

      await service.reject(
        'verif-1',
        { reason_code: 'fabricated' as never, rejected_reason: 'bằng chứng giả' },
        'mod-1',
      );

      expect(verificationsRepo.casUpdate).toHaveBeenCalledWith(
        'verif-1',
        0,
        expect.objectContaining({ status: VerificationStatus.REJECTED, reasonCode: 'fabricated' }),
        manager,
      );
      expect(placesRepo.updateScalars).toHaveBeenCalledWith(
        'place-1',
        { verificationStatus: VerificationStatus.REJECTED },
        manager,
      );
    });

    it('F1: reject XOÁ expiresAt (dòng bị bác không còn cửa sổ hiệu lực)', async () => {
      verificationsRepo.findById.mockResolvedValue(
        makeVerification({ status: VerificationStatus.OFFICIAL, expiresAt: new Date('2027-01-01T00:00:00Z') }),
      );
      verificationsRepo.casUpdate.mockResolvedValue(true);

      await service.reject('verif-1', { reason_code: 'outdated' as never }, 'mod-1');

      expect(verificationsRepo.casUpdate).toHaveBeenCalledWith(
        'verif-1',
        0,
        expect.objectContaining({ status: VerificationStatus.REJECTED, expiresAt: null }),
        manager,
      );
    });

    it('expired -> reject KHÔNG hợp lệ (phải submit lại trước)', async () => {
      verificationsRepo.findById.mockResolvedValue(makeVerification({ status: VerificationStatus.EXPIRED }));
      await expect(
        service.reject('verif-1', { reason_code: 'other' as never }, 'mod-1'),
      ).rejects.toThrow(UnprocessableEntityException);
    });
  });

  describe('vote', () => {
    it('không tìm thấy -> NotFoundException', async () => {
      verificationsRepo.findById.mockResolvedValue(null);
      await expect(service.vote('missing', { vote: VerificationVoteChoice.CONFIRM }, 'user-1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('chưa đủ ngưỡng -> chỉ cập nhật confirm/dispute count, KHÔNG chuyển community_verified', async () => {
      verificationsRepo.findById.mockResolvedValue(makeVerification({ lockVersion: 0 }));
      votesRepo.tally.mockResolvedValue({ confirmCount: 2, disputeCount: 0 });
      verificationsRepo.casUpdate.mockResolvedValue(true);

      const result = await service.vote('verif-1', { vote: VerificationVoteChoice.CONFIRM }, 'user-1');

      expect(verificationsRepo.casUpdate).toHaveBeenCalledWith(
        'verif-1',
        0,
        { confirmCount: 2, disputeCount: 0 },
        manager,
      );
      expect(eventsRepo.append).not.toHaveBeenCalled();
      expect(result.status).toBe(VerificationStatus.PENDING);
    });

    it('đủ ngưỡng (confirm>=5, dispute/confirm<0.2) VÀ đang pending -> tự chuyển community_verified, ghi event + cache sync', async () => {
      verificationsRepo.findById.mockResolvedValue(makeVerification({ lockVersion: 4 }));
      votesRepo.tally.mockResolvedValue({ confirmCount: 5, disputeCount: 0 });
      verificationsRepo.casUpdate.mockResolvedValue(true);

      const result = await service.vote('verif-1', { vote: VerificationVoteChoice.CONFIRM }, 'user-1');

      expect(verificationsRepo.casUpdate).toHaveBeenCalledWith(
        'verif-1',
        4,
        expect.objectContaining({
          confirmCount: 5,
          disputeCount: 0,
          status: VerificationStatus.COMMUNITY_VERIFIED,
          method: VerificationMethod.COMMUNITY_VOTE,
        }),
        manager,
      );
      expect(eventsRepo.append).toHaveBeenCalledWith(
        expect.objectContaining({
          fromStatus: VerificationStatus.PENDING,
          toStatus: VerificationStatus.COMMUNITY_VERIFIED,
          method: VerificationMethod.COMMUNITY_VOTE,
          actorId: null,
        }),
        manager,
      );
      expect(placesRepo.updateScalars).toHaveBeenCalledWith(
        'place-1',
        expect.objectContaining({ verificationStatus: VerificationStatus.COMMUNITY_VERIFIED }),
        manager,
      );
      expect(result.status).toBe(VerificationStatus.COMMUNITY_VERIFIED);
    });

    it('đủ confirm nhưng tỉ lệ dispute quá cao (>=0.2) -> KHÔNG tự chuyển', async () => {
      verificationsRepo.findById.mockResolvedValue(makeVerification());
      votesRepo.tally.mockResolvedValue({ confirmCount: 5, disputeCount: 2 }); // 2/5 = 0.4 >= 0.2
      verificationsRepo.casUpdate.mockResolvedValue(true);

      await service.vote('verif-1', { vote: VerificationVoteChoice.CONFIRM }, 'user-1');
      expect(eventsRepo.append).not.toHaveBeenCalled();
    });

    it('đủ ngưỡng NHƯNG status không còn pending (vd đã verified) -> KHÔNG tự chuyển', async () => {
      verificationsRepo.findById.mockResolvedValue(makeVerification({ status: VerificationStatus.VERIFIED }));
      votesRepo.tally.mockResolvedValue({ confirmCount: 10, disputeCount: 0 });
      verificationsRepo.casUpdate.mockResolvedValue(true);

      await service.vote('verif-1', { vote: VerificationVoteChoice.CONFIRM }, 'user-1');
      expect(eventsRepo.append).not.toHaveBeenCalled();
    });

    it('CAS thua -> ConflictException', async () => {
      verificationsRepo.findById.mockResolvedValue(makeVerification());
      votesRepo.tally.mockResolvedValue({ confirmCount: 1, disputeCount: 0 });
      verificationsRepo.casUpdate.mockResolvedValue(false);
      await expect(service.vote('verif-1', { vote: VerificationVoteChoice.CONFIRM }, 'user-1')).rejects.toThrow(
        ConflictException,
      );
    });

    it('trọng số phiếu ĐỒNG NHẤT = 1 (verification.md §10 mục 7 còn mở — KHÔNG tự suy weight theo role)', async () => {
      verificationsRepo.findById.mockResolvedValue(makeVerification());
      votesRepo.tally.mockResolvedValue({ confirmCount: 1, disputeCount: 0 });
      verificationsRepo.casUpdate.mockResolvedValue(true);

      await service.vote('verif-1', { vote: VerificationVoteChoice.CONFIRM }, 'user-1');
      expect(votesRepo.cast).toHaveBeenCalledWith(
        expect.objectContaining({ weight: 1, userId: 'user-1', vote: VerificationVoteChoice.CONFIRM }),
        manager,
      );
    });
  });

  describe('expireOverdue (VERIFICATION SCHEDULER — Operational Enablement)', () => {
    function makeCandidate(overrides: Partial<OverdueVerificationCandidate> = {}): OverdueVerificationCandidate {
      return {
        id: 'v1',
        status: VerificationStatus.OFFICIAL,
        lockVersion: 0,
        placeId: 'place-1',
        contactId: null,
        priceHistoryId: null,
        expiresAt: new Date('2026-08-01T00:00:00Z'),
        expiresAtCursor: '2026-08-01 00:00:00',
        ...overrides,
      };
    }

    it('không có dòng quá hạn -> summary rỗng, KHÔNG mở transaction nào', async () => {
      verificationsRepo.findOverdueTrustedBatch.mockResolvedValue([]);
      const summary = await service.expireOverdue();
      expect(summary).toMatchObject({ scanned: 0, eligible: 0, expired: 0, conflicts: 0, errors: 0, batchesRun: 0 });
      expect(dataSource.transaction).not.toHaveBeenCalled();
    });

    it('chuyển đúng các dòng quá hạn -> expired, ghi event method=system_auto actorId=null, summary.expired đúng số dòng, KHÔNG audit_logs', async () => {
      const now = new Date('2026-09-01T00:00:00Z');
      verificationsRepo.findOverdueTrustedBatch
        .mockResolvedValueOnce([
          makeCandidate({ id: 'v1', status: VerificationStatus.OFFICIAL, lockVersion: 2 }),
          makeCandidate({ id: 'v2', status: VerificationStatus.VERIFIED, lockVersion: 0 }),
        ])
        .mockResolvedValueOnce([]);
      verificationsRepo.findById
        .mockResolvedValueOnce(makeVerification({ id: 'v1', status: VerificationStatus.OFFICIAL, lockVersion: 2 }))
        .mockResolvedValueOnce(makeVerification({ id: 'v2', status: VerificationStatus.VERIFIED, lockVersion: 0 }));
      verificationsRepo.casUpdate.mockResolvedValue(true);

      const summary = await service.expireOverdue({ now });

      expect(summary.scanned).toBe(2);
      expect(summary.eligible).toBe(2);
      expect(summary.expired).toBe(2);
      expect(summary.conflicts).toBe(0);
      expect(summary.errors).toBe(0);
      expect(summary.batchesRun).toBe(1);
      expect(eventsRepo.append).toHaveBeenCalledWith(
        expect.objectContaining({
          verificationId: 'v1',
          fromStatus: VerificationStatus.OFFICIAL,
          toStatus: VerificationStatus.EXPIRED,
          method: VerificationMethod.SYSTEM_AUTO,
          actorId: null,
        }),
        manager,
      );
      expect(audit.record).not.toHaveBeenCalled(); // job hệ thống — không audit_logs (không actor người dùng)
    });

    it('CAS thua trên một dòng -> đếm vào conflicts, KHÔNG fatal, KHÔNG lỗi cả job', async () => {
      verificationsRepo.findOverdueTrustedBatch.mockResolvedValueOnce([makeCandidate({ id: 'v1', lockVersion: 0 })]).mockResolvedValueOnce([]);
      verificationsRepo.findById.mockResolvedValue(makeVerification({ id: 'v1', lockVersion: 0 }));
      verificationsRepo.casUpdate.mockResolvedValue(false);

      const summary = await service.expireOverdue();
      expect(summary.conflicts).toBe(1);
      expect(summary.expired).toBe(0);
      expect(summary.errors).toBe(0);
    });

    it('dòng đã bị xoá/transition khỏi trạng thái hợp lệ giữa lúc quét và lúc xử lý -> đếm vào conflicts, bỏ qua an toàn', async () => {
      verificationsRepo.findOverdueTrustedBatch.mockResolvedValueOnce([makeCandidate({ id: 'v1' })]).mockResolvedValueOnce([]);
      verificationsRepo.findById.mockResolvedValue(null);
      const summary = await service.expireOverdue();
      expect(summary.conflicts).toBe(1);
      expect(summary.expired).toBe(0);
    });

    it('lỗi hệ thống KHÔNG lường trước trên MỘT dòng -> đếm vào errors, KHÔNG chặn các dòng còn lại (cùng lô)', async () => {
      verificationsRepo.findOverdueTrustedBatch
        .mockResolvedValueOnce([makeCandidate({ id: 'v1' }), makeCandidate({ id: 'v2' })])
        .mockResolvedValueOnce([]);
      verificationsRepo.findById
        .mockRejectedValueOnce(new Error('sự cố kết nối DB'))
        .mockResolvedValueOnce(makeVerification({ id: 'v2', status: VerificationStatus.OFFICIAL }));
      verificationsRepo.casUpdate.mockResolvedValue(true);

      const summary = await service.expireOverdue();
      expect(summary.errors).toBe(1);
      expect(summary.expired).toBe(1); // v2 vẫn được xử lý dù v1 lỗi
    });

    it('batching: đúng batchSize truyền cho findOverdueTrustedBatch mỗi lô', async () => {
      verificationsRepo.findOverdueTrustedBatch.mockResolvedValue([]);
      await service.expireOverdue({ batchSize: 25 });
      expect(verificationsRepo.findOverdueTrustedBatch).toHaveBeenCalledWith(expect.any(Date), 25, undefined);
    });

    it('cursor tiến SAU MỖI LÔ theo dòng CUỐI của lô (keyset, không phụ thuộc kết quả từng dòng)', async () => {
      verificationsRepo.findOverdueTrustedBatch
        .mockResolvedValueOnce([
          makeCandidate({ id: 'v1', expiresAtCursor: 'c1' }),
          makeCandidate({ id: 'v2', expiresAtCursor: 'c2' }),
        ])
        .mockResolvedValueOnce([]);
      verificationsRepo.findById.mockResolvedValue(makeVerification());
      verificationsRepo.casUpdate.mockResolvedValue(true);

      await service.expireOverdue({ batchSize: 2 });

      expect(verificationsRepo.findOverdueTrustedBatch).toHaveBeenNthCalledWith(1, expect.any(Date), 2, undefined);
      expect(verificationsRepo.findOverdueTrustedBatch).toHaveBeenNthCalledWith(2, expect.any(Date), 2, {
        expiresAt: 'c2',
        id: 'v2',
      });
    });

    it('maxBatches: dừng ĐÚNG sau số lô cho phép dù còn dòng đủ điều kiện', async () => {
      verificationsRepo.findOverdueTrustedBatch.mockResolvedValue([makeCandidate({ id: 'v1' })]); // luôn trả 1 dòng — "còn nữa"
      verificationsRepo.findById.mockResolvedValue(makeVerification());
      verificationsRepo.casUpdate.mockResolvedValue(true);

      const summary = await service.expireOverdue({ batchSize: 1, maxBatches: 3 });
      expect(summary.batchesRun).toBe(3);
      expect(verificationsRepo.findOverdueTrustedBatch).toHaveBeenCalledTimes(3);
    });

    it('time budget: dừng GIỮA các dòng, đánh dấu timeBudgetExceeded, KHÔNG xử lý dở dang một dòng', async () => {
      let now = 0;
      const realDateNow = Date.now;
      Date.now = jest.fn(() => now);
      try {
        verificationsRepo.findOverdueTrustedBatch
          .mockResolvedValueOnce([makeCandidate({ id: 'v1' }), makeCandidate({ id: 'v2' })])
          .mockResolvedValueOnce([]);
        verificationsRepo.findById.mockImplementation(async () => {
          now = 10; // "thời gian trôi" khi xử lý xong dòng đầu — vượt ngân sách trước dòng kế
          return makeVerification({ id: 'v1', status: VerificationStatus.OFFICIAL });
        });
        verificationsRepo.casUpdate.mockResolvedValue(true);

        const summary = await service.expireOverdue({ maxExecutionMs: 5 });

        expect(summary.timeBudgetExceeded).toBe(true);
        expect(summary.expired).toBe(1); // dòng ĐANG xử lý khi vượt ngân sách vẫn chạy XONG trọn vẹn
        expect(verificationsRepo.findById).toHaveBeenCalledTimes(1); // dòng thứ hai KHÔNG bị đụng vào
      } finally {
        Date.now = realDateNow;
      }
    });

    it('dryRun: đếm scanned/eligible như thật, KHÔNG mở transaction, KHÔNG ghi gì, expired luôn = 0', async () => {
      verificationsRepo.findOverdueTrustedBatch
        .mockResolvedValueOnce([makeCandidate({ id: 'v1' }), makeCandidate({ id: 'v2' })])
        .mockResolvedValueOnce([]);

      const summary = await service.expireOverdue({ dryRun: true });

      expect(summary.dryRun).toBe(true);
      expect(summary.scanned).toBe(2);
      expect(summary.eligible).toBe(2);
      expect(summary.expired).toBe(0);
      expect(dataSource.transaction).not.toHaveBeenCalled();
      expect(verificationsRepo.casUpdate).not.toHaveBeenCalled();
      expect(eventsRepo.append).not.toHaveBeenCalled();
      expect(placesRepo.updateScalars).not.toHaveBeenCalled();
    });

    it('oldest/newestProcessedExpiresAt phản ánh đúng biên của các dòng đã quét', async () => {
      verificationsRepo.findOverdueTrustedBatch
        .mockResolvedValueOnce([
          makeCandidate({ id: 'v1', expiresAt: new Date('2026-01-01T00:00:00Z') }),
          makeCandidate({ id: 'v2', expiresAt: new Date('2026-06-01T00:00:00Z') }),
        ])
        .mockResolvedValueOnce([]);
      verificationsRepo.findById.mockResolvedValue(makeVerification());
      verificationsRepo.casUpdate.mockResolvedValue(true);

      const summary = await service.expireOverdue();
      expect(summary.oldestProcessedExpiresAt).toEqual(new Date('2026-01-01T00:00:00Z'));
      expect(summary.newestProcessedExpiresAt).toEqual(new Date('2026-06-01T00:00:00Z'));
    });
  });
});
