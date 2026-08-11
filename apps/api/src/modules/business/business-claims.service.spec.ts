import { ConflictException, ForbiddenException, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { BusinessClaimsService } from './business-claims.service';
import {
  BusinessClaimsRepository,
  type ModeratorBusinessClaimRow,
} from './repositories/business-claims.repository';
import { BusinessMembersRepository } from './repositories/business-members.repository';
import { PlacesRepository, PlaceCardRow } from '../places/repositories/places.repository';
import { RolesRepository } from '../rbac/repositories/roles.repository';
import { UserRolesRepository } from '../rbac/repositories/user-roles.repository';
import { VerificationsService } from '../verifications/verifications.service';
import { Verification } from '../verifications/entities/verification.entity';
import { SourcesRepository } from '../sources/repositories/sources.repository';
import { Source } from '../sources/entities/source.entity';
import { SourceType, SourceKind } from '../sources/sources.enums';
import { AuditService } from '../../core/audit/audit.service';
import { BusinessClaim } from './entities/business-claim.entity';
import { BusinessMember } from './entities/business-member.entity';
import { Role } from '../rbac/entities/role.entity';
import { BusinessClaimDecision, ClaimReasonCode, ClaimStatus, MemberRole } from './business.enums';
import { ScopeType } from '../rbac/rbac.enums';
import { PlaceStatus, VerificationStatus } from '../places/place.enums';
import { BusinessClaimEvidenceType } from './business-claim-evidence';
import { createMock, LooseMock } from '../../../test/helpers/create-mock';

function makeClaim(overrides: Partial<BusinessClaim> = {}): BusinessClaim {
  const c = new BusinessClaim();
  c.id = 'claim-1';
  c.placeId = 'place-1';
  c.requesterId = 'requester-1';
  c.evidence = [{ type: BusinessClaimEvidenceType.BUSINESS_LICENSE, reference: 'media-1' }];
  c.status = ClaimStatus.PENDING;
  c.reviewerId = null;
  c.reasonCode = null;
  c.decisionNote = null;
  c.decidedAt = null;
  c.createdAt = new Date('2026-08-05T00:00:00Z');
  c.updatedAt = new Date('2026-08-05T00:00:00Z');
  return Object.assign(c, overrides);
}

/** Hàng đợi moderator (GET /business-claims) — hình dạng ModeratorBusinessClaimRow, không phải entity. */
function makeModeratorRow(overrides: Partial<ModeratorBusinessClaimRow> = {}): ModeratorBusinessClaimRow {
  return {
    id: 'claim-1',
    placeId: 'place-1',
    placeName: 'Test Place',
    placeSlug: 'test-place',
    requesterId: 'requester-1',
    requesterDisplayName: 'Người Yêu Cầu',
    status: ClaimStatus.PENDING,
    reviewerId: null,
    reasonCode: null,
    decisionNote: null,
    decidedAt: null,
    createdAt: new Date('2026-08-05T00:00:00Z'),
    updatedAt: new Date('2026-08-05T00:00:00Z'),
    ...overrides,
  };
}

/** Claim ĐÃ nạp `place`/`requester` — đúng thứ `findByIdWithRelations()` trả về cho detail. */
function makeClaimWithRelations(overrides: Partial<BusinessClaim> = {}): BusinessClaim {
  const claim = makeClaim(overrides);
  claim.place = { id: 'place-1', name: 'Test Place', slug: 'test-place' } as BusinessClaim['place'];
  claim.requester = { id: 'requester-1', displayName: 'Người Yêu Cầu' } as BusinessClaim['requester'];
  return claim;
}

function makePlace(overrides: Partial<PlaceCardRow> = {}): PlaceCardRow {
  return {
    id: 'place-1',
    name: 'Test Place',
    slug: 'test-place',
    category_id: 'cat-1',
    short_description: null,
    price_range: null,
    cover_image_url: null,
    rating_avg: null,
    rating_count: 0,
    verification_status: 'pending',
    status: PlaceStatus.PUBLISHED,
    lat: 10,
    lng: 104,
    ...overrides,
  };
}

function makeRole(overrides: Partial<Role> = {}): Role {
  const r = new Role();
  r.id = 'role-business-owner';
  r.code = 'business_owner';
  r.name = 'Business Owner';
  return Object.assign(r, overrides);
}

describe('BusinessClaimsService', () => {
  let claimsRepo: LooseMock<BusinessClaimsRepository>;
  let membersRepo: LooseMock<BusinessMembersRepository>;
  let placesRepo: LooseMock<PlacesRepository>;
  let rolesRepo: LooseMock<RolesRepository>;
  let userRolesRepo: LooseMock<UserRolesRepository>;
  let verificationsService: LooseMock<VerificationsService>;
  let sourcesRepo: LooseMock<SourcesRepository>;
  let audit: LooseMock<AuditService>;
  let dataSource: LooseMock<DataSource>;
  let manager: EntityManager;
  let service: BusinessClaimsService;

  function makeVerification(overrides: Partial<Verification> = {}): Verification {
    return Object.assign(new Verification(), {
      id: 'verif-1',
      placeId: 'place-1',
      status: VerificationStatus.OFFICIAL,
      ...overrides,
    });
  }

  beforeEach(() => {
    manager = createMock<EntityManager>();
    claimsRepo = createMock<BusinessClaimsRepository>({
      findById: jest.fn(),
      findByIdWithRelations: jest.fn(),
      findByIdForUpdate: jest.fn(),
      createPending: jest.fn(),
      list: jest.fn(),
      listByRequester: jest.fn(),
      updateDecision: jest.fn(),
      updateWithdrawn: jest.fn(),
    });
    membersRepo = createMock<BusinessMembersRepository>({
      findActiveOwner: jest.fn(),
      findActiveOwnerForUpdate: jest.fn(),
      createOwner: jest.fn(),
    });
    placesRepo = createMock<PlacesRepository>({
      getCardByIdIncludingInactive: jest.fn(),
      updateScalars: jest.fn(),
    });
    rolesRepo = createMock<RolesRepository>({ findByCode: jest.fn().mockResolvedValue(makeRole()) });
    userRolesRepo = createMock<UserRolesRepository>({ assign: jest.fn() });
    // CLAIM -> SOURCE -> VERIFICATION INTEGRATION — mặc định `ensureOfficialFromClaim()` thành
    // công, trả một verification `official`. Test riêng bên dưới xác nhận input/side-effect chính
    // xác của lời gọi này (KHÔNG test lại nội bộ `ensureOfficialFromClaim()` — đã có
    // verifications.service.spec.ts riêng cho hàm đó).
    //
    // CORRECTION (PIR M-1): mock PHẢI gọi `input.createSource(mgr)` như hàm thật để nhánh tạo source
    // của `decide()` thực sự chạy — nếu mock bỏ qua callback thì mọi khẳng định về `sources` sẽ là
    // dương tính giả. Nhánh no-op được mock RIÊNG ở test tương ứng (không gọi callback).
    verificationsService = createMock<VerificationsService>({
      ensureOfficialFromClaim: jest.fn(
        async (
          _placeId: string,
          input: { createSource: (m: EntityManager) => Promise<string> },
          mgr: EntityManager,
        ) => {
          const sourceId = await input.createSource(mgr);
          return { verification: makeVerification(), sourceId, sourceCreated: true };
        },
      ),
    });
    sourcesRepo = createMock<SourcesRepository>({
      create: jest.fn((data: Partial<Source>) => Object.assign(new Source(), data)),
      save: jest.fn((source: Source) => Promise.resolve(Object.assign(source, { id: source.id ?? 'source-1' }))),
    });
    audit = createMock<AuditService>({ record: jest.fn() });
    dataSource = createMock<DataSource>({
      transaction: jest.fn((cb: (m: EntityManager) => Promise<unknown>) => cb(manager)),
    });
    service = new BusinessClaimsService(
      claimsRepo,
      membersRepo,
      placesRepo,
      rolesRepo,
      userRolesRepo,
      verificationsService,
      sourcesRepo,
      audit,
      dataSource,
    );
  });

  describe('submit', () => {
    it('place không tồn tại -> NotFoundException, KHÔNG gọi createPending', async () => {
      placesRepo.getCardByIdIncludingInactive.mockResolvedValue(null);
      await expect(
        service.submit({ place_id: 'missing', evidence: [{ type: BusinessClaimEvidenceType.OTHER, reference: 'x' }] }, 'u1'),
      ).rejects.toThrow(NotFoundException);
      expect(claimsRepo.createPending).not.toHaveBeenCalled();
    });

    it('place chưa published -> NotFoundException', async () => {
      placesRepo.getCardByIdIncludingInactive.mockResolvedValue(makePlace({ status: PlaceStatus.PENDING }));
      await expect(
        service.submit({ place_id: 'place-1', evidence: [{ type: BusinessClaimEvidenceType.OTHER, reference: 'x' }] }, 'u1'),
      ).rejects.toThrow(NotFoundException);
    });

    it('claim trùng pending (repository trả null) -> ConflictException 409', async () => {
      placesRepo.getCardByIdIncludingInactive.mockResolvedValue(makePlace());
      claimsRepo.createPending.mockResolvedValue(null);
      await expect(
        service.submit({ place_id: 'place-1', evidence: [{ type: BusinessClaimEvidenceType.OTHER, reference: 'x' }] }, 'u1'),
      ).rejects.toThrow(ConflictException);
    });

    it('thành công -> trả summary KHÔNG evidence, audit business.claim_requested', async () => {
      placesRepo.getCardByIdIncludingInactive.mockResolvedValue(makePlace());
      const claim = makeClaim();
      claimsRepo.createPending.mockResolvedValue(claim);

      const result = await service.submit(
        { place_id: 'place-1', evidence: [{ type: BusinessClaimEvidenceType.OTHER, reference: 'x' }] },
        'requester-1',
      );

      expect(result).not.toHaveProperty('evidence');
      expect(result.id).toBe('claim-1');
      expect(result.status).toBe(ClaimStatus.PENDING);
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({ event: 'business.claim_requested', entityType: 'business_claim', actorId: 'requester-1' }),
      );
    });
  });

  describe('listMine', () => {
    it('truyền ĐÚNG requesterId của actor xuống repository (self-scope) — không truyền id nào khác', async () => {
      claimsRepo.listByRequester.mockResolvedValue([]);
      await service.listMine('caller-1');
      expect(claimsRepo.listByRequester).toHaveBeenCalledWith(
        expect.objectContaining({ requesterId: 'caller-1' }),
      );
      expect(claimsRepo.listByRequester).toHaveBeenCalledTimes(1);
    });

    it('kết quả KHÔNG có evidence/reviewer_id/decision_note (chỉ narrow requester-safe fields)', async () => {
      claimsRepo.listByRequester.mockResolvedValue([
        {
          id: 'claim-1',
          placeId: 'place-1',
          placeName: 'Test Place',
          placeSlug: 'test-place',
          status: ClaimStatus.PENDING,
          reasonCode: null,
          decidedAt: null,
          createdAt: new Date('2026-08-10T00:00:00Z'),
          updatedAt: new Date('2026-08-10T00:00:00Z'),
        },
      ]);

      const result = await service.listMine('caller-1');

      expect(result).toHaveLength(1);
      expect(result[0]).not.toHaveProperty('evidence');
      expect(result[0]).not.toHaveProperty('reviewer_id');
      expect(result[0]).not.toHaveProperty('decision_note');
      expect(result[0]).not.toHaveProperty('requester_id');
      expect(result[0]).toEqual({
        id: 'claim-1',
        place_id: 'place-1',
        place_name: 'Test Place',
        place_slug: 'test-place',
        status: ClaimStatus.PENDING,
        reason_code: null,
        decided_at: null,
        created_at: '2026-08-10T00:00:00.000Z',
        updated_at: '2026-08-10T00:00:00.000Z',
      });
    });

    it('rejected -> reason_code có mặt, dịch được thành lý do cho requester', async () => {
      claimsRepo.listByRequester.mockResolvedValue([
        {
          id: 'claim-2',
          placeId: 'place-2',
          placeName: 'Nhà hàng XYZ',
          placeSlug: 'nha-hang-xyz',
          status: ClaimStatus.REJECTED,
          reasonCode: ClaimReasonCode.DUPLICATE,
          decidedAt: new Date('2026-08-11T00:00:00Z'),
          createdAt: new Date('2026-08-10T00:00:00Z'),
          updatedAt: new Date('2026-08-11T00:00:00Z'),
        },
      ]);

      const result = await service.listMine('caller-1');
      expect(result[0].status).toBe(ClaimStatus.REJECTED);
      expect(result[0].reason_code).toBe(ClaimReasonCode.DUPLICATE);
      expect(result[0].decided_at).toBe('2026-08-11T00:00:00.000Z');
    });

    it('không có claim nào -> mảng rỗng', async () => {
      claimsRepo.listByRequester.mockResolvedValue([]);
      const result = await service.listMine('caller-1');
      expect(result).toEqual([]);
    });
  });

  describe('list', () => {
    it('không truyền status -> mặc định pending', async () => {
      claimsRepo.list.mockResolvedValue({ items: [], total: 0 });
      await service.list({});
      expect(claimsRepo.list).toHaveBeenCalledWith(expect.objectContaining({ status: ClaimStatus.PENDING }));
    });

    it('kết quả list KHÔNG có evidence (privacy)', async () => {
      claimsRepo.list.mockResolvedValue({ items: [makeModeratorRow()], total: 1 });
      const result = await service.list({});
      expect(result.data[0]).not.toHaveProperty('evidence');
    });

    it('hàng đợi kèm tên cơ sở/người yêu cầu (UUID trần không đủ để duyệt)', async () => {
      claimsRepo.list.mockResolvedValue({ items: [makeModeratorRow()], total: 1 });
      const result = await service.list({});
      expect(result.data[0]).toMatchObject({
        place_id: 'place-1',
        place_name: 'Test Place',
        place_slug: 'test-place',
        requester_id: 'requester-1',
        requester_display_name: 'Người Yêu Cầu',
      });
    });

    it('hàng đợi KHÔNG lộ email người yêu cầu (hẹp hơn BusinessManagerListItem có chủ đích)', async () => {
      claimsRepo.list.mockResolvedValue({ items: [makeModeratorRow()], total: 1 });
      const result = await service.list({});
      expect(JSON.stringify(result.data[0])).not.toContain('@');
      expect(result.data[0]).not.toHaveProperty('requester_email');
    });
  });

  describe('getById', () => {
    it('không tồn tại -> NotFoundException', async () => {
      claimsRepo.findByIdWithRelations.mockResolvedValue(null);
      await expect(service.getById('missing')).rejects.toThrow(NotFoundException);
    });

    it('tồn tại -> detail CÓ evidence', async () => {
      claimsRepo.findByIdWithRelations.mockResolvedValue(makeClaimWithRelations());
      const result = await service.getById('claim-1');
      expect(result.evidence).toEqual([{ type: BusinessClaimEvidenceType.BUSINESS_LICENSE, reference: 'media-1' }]);
    });

    it('detail kèm tên cơ sở/người yêu cầu, KHÔNG email', async () => {
      claimsRepo.findByIdWithRelations.mockResolvedValue(makeClaimWithRelations());
      const result = await service.getById('claim-1');
      expect(result).toMatchObject({
        place_name: 'Test Place',
        place_slug: 'test-place',
        requester_display_name: 'Người Yêu Cầu',
      });
      expect(result).not.toHaveProperty('requester_email');
    });

    // Detail đọc thẳng `claim.place`/`claim.requester` -> PHẢI đi qua finder có nạp quan hệ,
    // không phải `findById()` (cột thô) — nếu lẫn, detail sẽ ném TypeError trên đường thật.
    it('dùng finder CÓ nạp quan hệ, không dùng findById()', async () => {
      claimsRepo.findByIdWithRelations.mockResolvedValue(makeClaimWithRelations());
      await service.getById('claim-1');
      expect(claimsRepo.findByIdWithRelations).toHaveBeenCalledWith('claim-1');
      expect(claimsRepo.findById).not.toHaveBeenCalled();
    });
  });

  describe('decide — reject', () => {
    it('reject KHÔNG kèm reason_code -> 422, KHÔNG mở transaction', async () => {
      await expect(
        service.decide('claim-1', { decision: BusinessClaimDecision.REJECT }, 'mod-1'),
      ).rejects.toThrow(UnprocessableEntityException);
      expect(dataSource.transaction).not.toHaveBeenCalled();
    });

    it('claim không tồn tại -> NotFoundException', async () => {
      claimsRepo.findByIdForUpdate.mockResolvedValue(null);
      await expect(
        service.decide('missing', { decision: BusinessClaimDecision.REJECT, reason_code: ClaimReasonCode.OTHER }, 'mod-1'),
      ).rejects.toThrow(NotFoundException);
    });

    it('reject hợp lệ -> updateDecision(status=rejected, reason_code) + audit business.claim_rejected', async () => {
      claimsRepo.findByIdForUpdate.mockResolvedValue(makeClaim());
      const result = await service.decide(
        'claim-1',
        { decision: BusinessClaimDecision.REJECT, reason_code: ClaimReasonCode.FRAUD, decision_note: 'note' },
        'mod-1',
      );
      expect(claimsRepo.updateDecision).toHaveBeenCalledWith(
        manager,
        'claim-1',
        expect.objectContaining({ status: ClaimStatus.REJECTED, reviewerId: 'mod-1', reasonCode: ClaimReasonCode.FRAUD }),
      );
      expect(result.status).toBe(ClaimStatus.REJECTED);
      expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ event: 'business.claim_rejected' }));
      // Reject KHÔNG được tạo owner/gán role.
      expect(membersRepo.createOwner).not.toHaveBeenCalled();
      expect(userRolesRepo.assign).not.toHaveBeenCalled();
    });

    it('claim đã approved -> 422 (FSM từ chối reject trên trạng thái cuối)', async () => {
      claimsRepo.findByIdForUpdate.mockResolvedValue(makeClaim({ status: ClaimStatus.APPROVED }));
      await expect(
        service.decide('claim-1', { decision: BusinessClaimDecision.REJECT, reason_code: ClaimReasonCode.OTHER }, 'mod-1'),
      ).rejects.toThrow(UnprocessableEntityException);
      expect(claimsRepo.updateDecision).not.toHaveBeenCalled();
    });
  });

  describe('decide — self-verification', () => {
    it('actor === requester -> ForbiddenException, KHÔNG đổi gì', async () => {
      claimsRepo.findByIdForUpdate.mockResolvedValue(makeClaim({ requesterId: 'same-user' }));
      await expect(
        service.decide('claim-1', { decision: BusinessClaimDecision.APPROVE }, 'same-user'),
      ).rejects.toThrow(ForbiddenException);
      expect(claimsRepo.updateDecision).not.toHaveBeenCalled();
      expect(membersRepo.createOwner).not.toHaveBeenCalled();
    });
  });

  describe('decide — approve', () => {
    it('không có owner xung đột -> tạo business_members(owner), gán business_owner scope Managed, tạo source + ensureOfficialFromClaim, claim approved', async () => {
      claimsRepo.findByIdForUpdate.mockResolvedValue(makeClaim());
      membersRepo.findActiveOwnerForUpdate.mockResolvedValue(null);
      membersRepo.createOwner.mockResolvedValue(new BusinessMember());
      rolesRepo.findByCode.mockResolvedValue(makeRole());
      const verification = makeVerification();
      verificationsService.ensureOfficialFromClaim.mockImplementation(
        async (
          _placeId: string,
          input: { createSource: (m: EntityManager) => Promise<string> },
          mgr: EntityManager,
        ) => {
          const sourceId = await input.createSource(mgr);
          return { verification, sourceId, sourceCreated: true };
        },
      );

      const result = await service.decide('claim-1', { decision: BusinessClaimDecision.APPROVE, decision_note: 'ok' }, 'mod-1');

      expect(membersRepo.createOwner).toHaveBeenCalledWith(manager, {
        placeId: 'place-1',
        userId: 'requester-1',
        claimId: 'claim-1',
        grantedBy: 'mod-1',
      });
      expect(userRolesRepo.assign).toHaveBeenCalledWith(
        {
          userId: 'requester-1',
          roleId: 'role-business-owner',
          scopeType: ScopeType.MANAGED,
          businessId: 'place-1',
          grantedBy: 'mod-1',
        },
        manager,
      );
      // CLAIM -> SOURCE -> VERIFICATION INTEGRATION: một `sources` (business_owner/platform_user)
      // được tạo QUA CALLBACK do ensureOfficialFromClaim gọi (không còn tạo trước).
      expect(sourcesRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          type: SourceType.BUSINESS_OWNER,
          kind: SourceKind.PLATFORM_USER,
          authorUserId: 'requester-1',
        }),
      );
      expect(sourcesRepo.save).toHaveBeenCalledWith(expect.anything(), manager);
      // PRIVACY (Owner Decision 1, CORRECTION) — `metadata` CHỈ chứa `business_claim_id`. `evidence`
      // TUYỆT ĐỐI không được sao vào đây: `GET /sources/:id` là @Public() và trả nguyên `metadata`,
      // nên evidence ở đó = phơi giấy tờ riêng tư ra kênh không cần đăng nhập. Khẳng định bằng so
      // sánh TOÀN BỘ object (toEqual) + keys, KHÔNG objectContaining — objectContaining sẽ pass ngay
      // cả khi `evidence` vẫn còn nằm trong đó (chính lỗi PIR đã bắt).
      const createdSource = sourcesRepo.create.mock.calls[0][0] as { metadata: Record<string, unknown> };
      expect(createdSource.metadata).toEqual({ business_claim_id: 'claim-1' });
      expect(Object.keys(createdSource.metadata)).toEqual(['business_claim_id']);
      expect(createdSource.metadata).not.toHaveProperty('evidence');
      // Không còn ghi thẳng cache — `places.verification_status`/`verifiedAt` giờ CHỈ do
      // `VerificationsService.syncTargetCache()` ghi, bên trong `ensureOfficialFromClaim()`.
      expect(placesRepo.updateScalars).not.toHaveBeenCalled();
      expect(verificationsService.ensureOfficialFromClaim).toHaveBeenCalledWith(
        'place-1',
        expect.objectContaining({ actorId: 'mod-1', note: 'ok', createSource: expect.any(Function) }),
        manager,
      );
      expect(claimsRepo.updateDecision).toHaveBeenCalledWith(
        manager,
        'claim-1',
        expect.objectContaining({ status: ClaimStatus.APPROVED, reviewerId: 'mod-1' }),
      );
      expect(result.status).toBe(ClaimStatus.APPROVED);
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'business.claim_approved',
          context: {
            verification: {
              sourceId: 'source-1',
              sourceCreated: true,
              verificationId: verification.id,
              verificationStatus: verification.status,
            },
          },
        }),
      );
    });

    // CORRECTION (Owner Decision 2, PIR M-1). Bản trước tạo `sources` TRƯỚC khi biết nhánh no-op có
    // xảy ra hay không -> mỗi lần approve trên một place ĐÃ `official` để lại một dòng `sources` mồ
    // côi (không verification nào trỏ tới) VÀ audit ghi source_id mà dòng verifications không dùng.
    it('place ĐÃ official (no-op) -> KHÔNG tạo source mới, audit trỏ tới source THẬT đang gắn', async () => {
      claimsRepo.findByIdForUpdate.mockResolvedValue(makeClaim());
      membersRepo.findActiveOwnerForUpdate.mockResolvedValue(null);
      membersRepo.createOwner.mockResolvedValue(new BusinessMember());
      const existing = makeVerification({ id: 'verif-existing', sourceId: 'source-already-attached' });
      // Nhánh no-op của hàm thật KHÔNG gọi `input.createSource` — mock phản ánh đúng điều đó.
      verificationsService.ensureOfficialFromClaim.mockImplementation(async () => ({
        verification: existing,
        sourceId: existing.sourceId,
        sourceCreated: false,
      }));

      const result = await service.decide('claim-1', { decision: BusinessClaimDecision.APPROVE }, 'mod-1');

      // ZERO dòng `sources` mới — khẳng định ở CẢ create và save (create không chạm DB, save mới ghi).
      expect(sourcesRepo.create).not.toHaveBeenCalled();
      expect(sourcesRepo.save).not.toHaveBeenCalled();
      // Ownership VẪN được cấp bình thường — no-op chỉ áp cho phần verification.
      expect(membersRepo.createOwner).toHaveBeenCalled();
      expect(userRolesRepo.assign).toHaveBeenCalled();
      expect(result.status).toBe(ClaimStatus.APPROVED);
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'business.claim_approved',
          context: {
            verification: {
              sourceId: 'source-already-attached',
              sourceCreated: false,
              verificationId: 'verif-existing',
              verificationStatus: VerificationStatus.OFFICIAL,
            },
          },
        }),
      );
    });

    it('nhánh reject KHÔNG tạo source/verification -> audit context = null', async () => {
      claimsRepo.findByIdForUpdate.mockResolvedValue(makeClaim());

      await service.decide(
        'claim-1',
        { decision: BusinessClaimDecision.REJECT, reason_code: ClaimReasonCode.DUPLICATE },
        'mod-1',
      );

      expect(sourcesRepo.create).not.toHaveBeenCalled();
      expect(verificationsService.ensureOfficialFromClaim).not.toHaveBeenCalled();
      expect(placesRepo.updateScalars).not.toHaveBeenCalled();
      expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ context: { verification: null } }));
    });

    it('ĐÃ có owner hiệu lực -> redirect disputed, KHÔNG tạo owner/role/source/verification mới', async () => {
      claimsRepo.findByIdForUpdate.mockResolvedValue(makeClaim());
      membersRepo.findActiveOwnerForUpdate.mockResolvedValue(
        Object.assign(new BusinessMember(), { id: 'm1', placeId: 'place-1', userId: 'other-owner', role: MemberRole.OWNER }),
      );

      const result = await service.decide('claim-1', { decision: BusinessClaimDecision.APPROVE }, 'mod-1');

      expect(membersRepo.createOwner).not.toHaveBeenCalled();
      expect(userRolesRepo.assign).not.toHaveBeenCalled();
      expect(sourcesRepo.create).not.toHaveBeenCalled();
      expect(verificationsService.ensureOfficialFromClaim).not.toHaveBeenCalled();
      expect(placesRepo.updateScalars).not.toHaveBeenCalled();
      expect(claimsRepo.updateDecision).toHaveBeenCalledWith(
        manager,
        'claim-1',
        expect.objectContaining({ status: ClaimStatus.DISPUTED, reviewerId: 'mod-1' }),
      );
      expect(result.status).toBe(ClaimStatus.DISPUTED);
      expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ event: 'business.claim_disputed' }));
    });

    it('race: createOwner ném unique_violation trên uq_member_owner -> redirect disputed thay vì lỗi 500', async () => {
      claimsRepo.findByIdForUpdate.mockResolvedValue(makeClaim());
      membersRepo.findActiveOwnerForUpdate.mockResolvedValue(null);
      membersRepo.createOwner.mockRejectedValue({ code: '23505', constraint: 'uq_member_owner' });

      const result = await service.decide('claim-1', { decision: BusinessClaimDecision.APPROVE }, 'mod-1');

      expect(result.status).toBe(ClaimStatus.DISPUTED);
      expect(userRolesRepo.assign).not.toHaveBeenCalled();
    });

    it('createOwner ném lỗi KHÔNG PHẢI unique_violation trên uq_member_owner -> ném lại nguyên vẹn', async () => {
      claimsRepo.findByIdForUpdate.mockResolvedValue(makeClaim());
      membersRepo.findActiveOwnerForUpdate.mockResolvedValue(null);
      const dbError = new Error('connection lost');
      membersRepo.createOwner.mockRejectedValue(dbError);

      await expect(service.decide('claim-1', { decision: BusinessClaimDecision.APPROVE }, 'mod-1')).rejects.toBe(dbError);
      expect(claimsRepo.updateDecision).not.toHaveBeenCalled();
    });

    it('claim đã disputed -> approve hợp lệ (phân xử tranh chấp)', async () => {
      claimsRepo.findByIdForUpdate.mockResolvedValue(makeClaim({ status: ClaimStatus.DISPUTED }));
      membersRepo.findActiveOwnerForUpdate.mockResolvedValue(null);
      membersRepo.createOwner.mockResolvedValue(new BusinessMember());

      const result = await service.decide('claim-1', { decision: BusinessClaimDecision.APPROVE }, 'mod-1');
      expect(result.status).toBe(ClaimStatus.APPROVED);
    });

    it('audit CHỈ được gọi SAU khi mọi ghi DB hoàn tất (thứ tự lời gọi)', async () => {
      claimsRepo.findByIdForUpdate.mockResolvedValue(makeClaim());
      membersRepo.findActiveOwnerForUpdate.mockResolvedValue(null);
      membersRepo.createOwner.mockResolvedValue(new BusinessMember());

      const order: string[] = [];
      claimsRepo.updateDecision.mockImplementation(async () => {
        order.push('updateDecision');
      });
      audit.record.mockImplementation(async () => {
        order.push('audit');
      });

      await service.decide('claim-1', { decision: BusinessClaimDecision.APPROVE }, 'mod-1');
      expect(order).toEqual(['updateDecision', 'audit']);
    });
  });

  describe('withdraw', () => {
    it('claim không tồn tại -> NotFoundException', async () => {
      claimsRepo.findByIdForUpdate.mockResolvedValue(null);
      await expect(service.withdraw('missing', 'u1')).rejects.toThrow(NotFoundException);
    });

    it('actor KHÔNG PHẢI requester -> ForbiddenException, KHÔNG đổi gì', async () => {
      claimsRepo.findByIdForUpdate.mockResolvedValue(makeClaim({ requesterId: 'owner-of-claim' }));
      await expect(service.withdraw('claim-1', 'someone-else')).rejects.toThrow(ForbiddenException);
      expect(claimsRepo.updateWithdrawn).not.toHaveBeenCalled();
    });

    it('requester tự rút claim pending -> withdrawn + audit', async () => {
      claimsRepo.findByIdForUpdate.mockResolvedValue(makeClaim({ requesterId: 'requester-1' }));
      const result = await service.withdraw('claim-1', 'requester-1');
      expect(claimsRepo.updateWithdrawn).toHaveBeenCalledWith(manager, 'claim-1');
      expect(result.status).toBe(ClaimStatus.WITHDRAWN);
      expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ event: 'business.claim_withdrawn' }));
    });

    it('claim đã approved -> 422 (không thể rút claim đã quyết định)', async () => {
      claimsRepo.findByIdForUpdate.mockResolvedValue(makeClaim({ requesterId: 'requester-1', status: ClaimStatus.APPROVED }));
      await expect(service.withdraw('claim-1', 'requester-1')).rejects.toThrow(UnprocessableEntityException);
    });
  });
});
