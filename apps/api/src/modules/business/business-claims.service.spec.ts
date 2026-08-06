import { ConflictException, ForbiddenException, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { BusinessClaimsService } from './business-claims.service';
import { BusinessClaimsRepository } from './repositories/business-claims.repository';
import { BusinessMembersRepository } from './repositories/business-members.repository';
import { PlacesRepository, PlaceCardRow } from '../places/repositories/places.repository';
import { RolesRepository } from '../rbac/repositories/roles.repository';
import { UserRolesRepository } from '../rbac/repositories/user-roles.repository';
import { VerificationsRepository } from '../verifications/repositories/verifications.repository';
import { Verification } from '../verifications/entities/verification.entity';
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
  let verificationsRepo: LooseMock<VerificationsRepository>;
  let audit: LooseMock<AuditService>;
  let dataSource: LooseMock<DataSource>;
  let manager: EntityManager;
  let service: BusinessClaimsService;

  beforeEach(() => {
    manager = createMock<EntityManager>();
    claimsRepo = createMock<BusinessClaimsRepository>({
      findById: jest.fn(),
      findByIdForUpdate: jest.fn(),
      createPending: jest.fn(),
      list: jest.fn(),
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
    // Mặc định: cơ sở CHƯA có dòng `verifications` nào -> guard C1 cho phép ghi cache (hành vi
    // ADR-015 nguyên bản). Test riêng bên dưới đảo lại giá trị này.
    verificationsRepo = createMock<VerificationsRepository>({
      findActiveByTarget: jest.fn().mockResolvedValue(null),
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
      verificationsRepo,
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

  describe('list', () => {
    it('không truyền status -> mặc định pending', async () => {
      claimsRepo.list.mockResolvedValue({ items: [], total: 0 });
      await service.list({});
      expect(claimsRepo.list).toHaveBeenCalledWith(expect.objectContaining({ status: ClaimStatus.PENDING }));
    });

    it('kết quả list KHÔNG có evidence (privacy)', async () => {
      claimsRepo.list.mockResolvedValue({ items: [makeClaim()], total: 1 });
      const result = await service.list({});
      expect(result.data[0]).not.toHaveProperty('evidence');
    });
  });

  describe('getById', () => {
    it('không tồn tại -> NotFoundException', async () => {
      claimsRepo.findById.mockResolvedValue(null);
      await expect(service.getById('missing')).rejects.toThrow(NotFoundException);
    });

    it('tồn tại -> detail CÓ evidence', async () => {
      claimsRepo.findById.mockResolvedValue(makeClaim());
      const result = await service.getById('claim-1');
      expect(result.evidence).toEqual([{ type: BusinessClaimEvidenceType.BUSINESS_LICENSE, reference: 'media-1' }]);
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
    it('không có owner xung đột -> tạo business_members(owner), gán business_owner scope Managed, cập nhật verification, claim approved', async () => {
      claimsRepo.findByIdForUpdate.mockResolvedValue(makeClaim());
      membersRepo.findActiveOwnerForUpdate.mockResolvedValue(null);
      membersRepo.createOwner.mockResolvedValue(new BusinessMember());
      rolesRepo.findByCode.mockResolvedValue(makeRole());

      const result = await service.decide('claim-1', { decision: BusinessClaimDecision.APPROVE }, 'mod-1');

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
      expect(placesRepo.updateScalars).toHaveBeenCalledWith(
        'place-1',
        expect.objectContaining({ verificationStatus: VerificationStatus.OFFICIAL, verifiedAt: expect.any(Date) }),
        manager,
      );
      expect(claimsRepo.updateDecision).toHaveBeenCalledWith(
        manager,
        'claim-1',
        expect.objectContaining({ status: ClaimStatus.APPROVED, reviewerId: 'mod-1' }),
      );
      expect(result.status).toBe(ClaimStatus.APPROVED);
      expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ event: 'business.claim_approved' }));
    });

    // ADR-008 CORRECTION (PIR finding C1) — guard phòng vệ hai chiều, phía Business Claim.
    it('C1 guard: cơ sở ĐÃ có dòng verifications -> approve BÌNH THƯỜNG nhưng KHÔNG ghi đè cache verification', async () => {
      claimsRepo.findByIdForUpdate.mockResolvedValue(makeClaim());
      membersRepo.findActiveOwnerForUpdate.mockResolvedValue(null);
      membersRepo.createOwner.mockResolvedValue(Object.assign(new BusinessMember(), { id: 'm1' }));
      verificationsRepo.findActiveByTarget.mockResolvedValue(
        Object.assign(new Verification(), { id: 'verif-1', placeId: 'place-1' }),
      );

      const result = await service.decide('claim-1', { decision: BusinessClaimDecision.APPROVE }, 'mod-1');

      // Quyền sở hữu VẪN được cấp — guard chỉ chặn ghi đè badge, không chặn claim.
      expect(membersRepo.createOwner).toHaveBeenCalled();
      expect(userRolesRepo.assign).toHaveBeenCalled();
      expect(result.status).toBe(ClaimStatus.APPROVED);
      // Cache KHÔNG bị đụng — dòng `verifications` là nguồn sự thật của nó.
      expect(placesRepo.updateScalars).not.toHaveBeenCalled();
      expect(verificationsRepo.findActiveByTarget).toHaveBeenCalledWith({ placeId: 'place-1' }, manager);
      // Không âm thầm: audit nêu rõ đã KHÔNG ghi cache.
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({ context: { verification_cache_written: false } }),
      );
    });

    it('C1 guard: cơ sở CHƯA có dòng verifications -> ghi cache như cũ, audit ghi nhận đã ghi', async () => {
      claimsRepo.findByIdForUpdate.mockResolvedValue(makeClaim());
      membersRepo.findActiveOwnerForUpdate.mockResolvedValue(null);
      membersRepo.createOwner.mockResolvedValue(Object.assign(new BusinessMember(), { id: 'm1' }));
      verificationsRepo.findActiveByTarget.mockResolvedValue(null);

      await service.decide('claim-1', { decision: BusinessClaimDecision.APPROVE }, 'mod-1');

      expect(placesRepo.updateScalars).toHaveBeenCalledWith(
        'place-1',
        expect.objectContaining({ verificationStatus: VerificationStatus.OFFICIAL }),
        manager,
      );
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({ context: { verification_cache_written: true } }),
      );
    });

    it('C1 guard: nhánh reject KHÔNG chạm bước ghi cache -> audit context = null', async () => {
      claimsRepo.findByIdForUpdate.mockResolvedValue(makeClaim());

      await service.decide(
        'claim-1',
        { decision: BusinessClaimDecision.REJECT, reason_code: ClaimReasonCode.DUPLICATE },
        'mod-1',
      );

      expect(verificationsRepo.findActiveByTarget).not.toHaveBeenCalled();
      expect(placesRepo.updateScalars).not.toHaveBeenCalled();
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({ context: { verification_cache_written: null } }),
      );
    });

    it('ĐÃ có owner hiệu lực -> redirect disputed, KHÔNG tạo owner/role/verification mới', async () => {
      claimsRepo.findByIdForUpdate.mockResolvedValue(makeClaim());
      membersRepo.findActiveOwnerForUpdate.mockResolvedValue(
        Object.assign(new BusinessMember(), { id: 'm1', placeId: 'place-1', userId: 'other-owner', role: MemberRole.OWNER }),
      );

      const result = await service.decide('claim-1', { decision: BusinessClaimDecision.APPROVE }, 'mod-1');

      expect(membersRepo.createOwner).not.toHaveBeenCalled();
      expect(userRolesRepo.assign).not.toHaveBeenCalled();
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
