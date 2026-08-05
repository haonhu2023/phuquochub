import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import { clampLimit, clampPage, paginate } from '../../common/pagination';
import { BusinessClaimsRepository } from './repositories/business-claims.repository';
import { BusinessMembersRepository } from './repositories/business-members.repository';
import { BusinessClaim } from './entities/business-claim.entity';
import { PlacesRepository } from '../places/repositories/places.repository';
import { RolesRepository } from '../rbac/repositories/roles.repository';
import { UserRolesRepository } from '../rbac/repositories/user-roles.repository';
import { ScopeType } from '../rbac/rbac.enums';
import { AuditService } from '../../core/audit/audit.service';
import { AuditResult } from '../../core/audit/audit.enums';
import { assertValidClaimTransition } from './business-claim.transition';
import { BusinessClaimDecision, ClaimStatus } from './business.enums';
import { VerificationStatus, PlaceStatus } from '../places/place.enums';
import { SubmitBusinessClaimDto, DecideBusinessClaimDto, ListBusinessClaimsQueryDto } from './dto/business.dto';
import {
  toBusinessClaimDetail,
  toBusinessClaimSummary,
  type BusinessClaimSummaryResponse,
  type BusinessClaimDetailResponse,
} from './business.mapper';

const BUSINESS_OWNER_ROLE_CODE = 'business_owner';

function isUniqueViolation(err: unknown, constraintName: string): boolean {
  const e = err as { code?: string; constraint?: string; driverError?: { code?: string; constraint?: string } };
  const code = e.code ?? e.driverError?.code;
  const constraint = e.constraint ?? e.driverError?.constraint;
  return code === '23505' && constraint === constraintName;
}

// BusinessClaimsService — ADR-015 Claim Decision Workflow (M3, không có M1/M2 trước đó trong repo
// này). submit() = WF-05 UC-B1 (Member, Business.Claim). decide() = UC-B2 (Moderator,
// Business.Verify, chỉ approve/reject — dispute TỰ ĐỘNG khi xung đột owner). withdraw() = actor
// requester, KHÔNG cần Business.Verify (business.md §4: "withdrawn | ... | requester").
//
// Owner Decision 1: verification = CHỈ ghi `places.verification_status`/`verified_at` (cache có
// sẵn, ADR-008 §Decision mục 3) — KHÔNG tạo `verifications`/`verification_events`, ADR-008 vẫn hoãn.
@Injectable()
export class BusinessClaimsService {
  constructor(
    private readonly claimsRepo: BusinessClaimsRepository,
    private readonly membersRepo: BusinessMembersRepository,
    private readonly placesRepo: PlacesRepository,
    private readonly rolesRepo: RolesRepository,
    private readonly userRolesRepo: UserRolesRepository,
    private readonly audit: AuditService,
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  /** POST /business-claims (WF-05 UC-B1). `requesterId` LUÔN từ JWT (controller), không từ body. */
  async submit(dto: SubmitBusinessClaimDto, requesterId: string): Promise<BusinessClaimSummaryResponse> {
    const place = await this.placesRepo.getCardByIdIncludingInactive(dto.place_id);
    if (!place || place.status !== PlaceStatus.PUBLISHED) {
      throw new NotFoundException('Không tìm thấy place hoặc place chưa được công khai.');
    }

    const claim = await this.claimsRepo.createPending({
      placeId: dto.place_id,
      requesterId,
      evidence: dto.evidence,
    });
    if (!claim) {
      throw new ConflictException('Bạn đã có một yêu cầu claim đang chờ xác minh cho cơ sở này.');
    }

    await this.audit.record({
      event: 'business.claim_requested',
      entityType: 'business_claim',
      entityId: claim.id,
      actorId: requesterId,
      result: AuditResult.SUCCESS,
      after: { place_id: claim.placeId, status: claim.status },
    });

    return toBusinessClaimSummary(claim);
  }

  /** GET /business-claims (moderator queue, Business.Verify — PEP ở controller). */
  async list(query: ListBusinessClaimsQueryDto) {
    const page = clampPage(query.page);
    const limit = clampLimit(query.limit);
    const status = query.status ?? ClaimStatus.PENDING;

    const { items, total } = await this.claimsRepo.list({
      status,
      placeId: query.place_id,
      limit,
      offset: (page - 1) * limit,
    });

    return paginate(items.map(toBusinessClaimSummary), page, limit, total);
  }

  /** GET /business-claims/{id} (moderator detail, Business.Verify — PEP ở controller). */
  async getById(id: string): Promise<BusinessClaimDetailResponse> {
    const claim = await this.claimsRepo.findById(id);
    if (!claim) {
      throw new NotFoundException('Không tìm thấy claim');
    }
    return toBusinessClaimDetail(claim);
  }

  /**
   * POST /business-claims/{id}/decide (moderator, Business.Verify — PEP ở controller, KHÔNG cần
   * `@AuthorizationContext`: `Business.Verify` không có hậu tố scope, đi đường context-free giống
   * `Business.Claim`/`Place.Create`, ADR-019 D2 bước 3).
   *
   * Toàn bộ effect (claim status, business_members, user_roles, places.verification cache) chạy
   * trong ĐÚNG MỘT transaction — lỗi ở bất kỳ bước nào rollback TẤT CẢ (không có state nửa vời).
   */
  async decide(claimId: string, dto: DecideBusinessClaimDto, actorId: string): Promise<BusinessClaimSummaryResponse> {
    if (dto.decision === BusinessClaimDecision.REJECT && !dto.reason_code) {
      throw new UnprocessableEntityException('Từ chối claim bắt buộc có reason_code.');
    }

    const result = await this.dataSource.transaction<BusinessClaim>(async (manager) => {
      const claim = await this.claimsRepo.findByIdForUpdate(manager, claimId);
      if (!claim) {
        throw new NotFoundException('Không tìm thấy claim');
      }

      // Không tự xác minh claim của chính mình.
      if (claim.requesterId === actorId) {
        throw new ForbiddenException('Không thể tự xác minh claim của chính mình.');
      }

      const decidedAt = new Date();

      if (dto.decision === BusinessClaimDecision.REJECT) {
        const targetStatus = assertValidClaimTransition(claim.status, 'reject');
        await this.claimsRepo.updateDecision(manager, claim.id, {
          status: targetStatus,
          reviewerId: actorId,
          reasonCode: dto.reason_code ?? null,
          decisionNote: dto.decision_note ?? null,
          decidedAt,
        });
        return {
          ...claim,
          status: targetStatus,
          reviewerId: actorId,
          reasonCode: dto.reason_code ?? null,
          decisionNote: dto.decision_note ?? null,
          decidedAt,
        };
      }

      // decision = APPROVE. FSM xác nhận claim đang ở trạng thái cho phép approve TRƯỚC khi chạm DB.
      const approvedStatus = assertValidClaimTransition(claim.status, 'approve');

      // BR-B2: xác nhận KHÔNG có owner hiệu lực xung đột — khoá dòng owner (nếu có).
      const conflictingOwner = await this.membersRepo.findActiveOwnerForUpdate(manager, claim.placeId);
      if (conflictingOwner) {
        return this.redirectToDisputed(manager, claim, actorId, dto.decision_note ?? null, decidedAt);
      }

      try {
        await this.membersRepo.createOwner(manager, {
          placeId: claim.placeId,
          userId: claim.requesterId,
          claimId: claim.id,
          grantedBy: actorId,
        });
      } catch (err) {
        // Race hiếm: hai approval đầu tiên đồng thời trên CÙNG cơ sở — `uq_member_owner` (CSDL)
        // là chốt chặn CUỐI CÙNG của BR-B2. Bắt đúng vi phạm này, KHÔNG bắt lỗi khác.
        if (isUniqueViolation(err, 'uq_member_owner')) {
          return this.redirectToDisputed(manager, claim, actorId, dto.decision_note ?? null, decidedAt);
        }
        throw err;
      }

      const ownerRole = await this.rolesRepo.findByCode(BUSINESS_OWNER_ROLE_CODE);
      if (!ownerRole) {
        throw new Error(`Role '${BUSINESS_OWNER_ROLE_CODE}' không tồn tại (SeedRbac chưa chạy?).`);
      }
      await this.userRolesRepo.assign(
        {
          userId: claim.requesterId,
          roleId: ownerRole.id,
          scopeType: ScopeType.MANAGED,
          businessId: claim.placeId,
          grantedBy: actorId,
        },
        manager,
      );

      await this.placesRepo.updateScalars(
        claim.placeId,
        { verificationStatus: VerificationStatus.OFFICIAL, verifiedAt: decidedAt },
        manager,
      );

      await this.claimsRepo.updateDecision(manager, claim.id, {
        status: approvedStatus,
        reviewerId: actorId,
        reasonCode: null,
        decisionNote: dto.decision_note ?? null,
        decidedAt,
      });

      return {
        ...claim,
        status: approvedStatus,
        reviewerId: actorId,
        reasonCode: null,
        decisionNote: dto.decision_note ?? null,
        decidedAt,
      };
    });

    // Transaction đã COMMIT — audit CHỈ sau commit (cùng nguyên tắc ModerationService.decide()).
    await this.audit.record({
      event: `business.claim_${result.status}`,
      entityType: 'business_claim',
      entityId: result.id,
      actorId,
      result: AuditResult.SUCCESS,
      after: { status: result.status, place_id: result.placeId },
    });

    return toBusinessClaimSummary(result);
  }

  /** POST /business-claims/{id}/withdraw — actor = requester (business.md §4), KHÔNG Business.Verify. */
  async withdraw(claimId: string, actorId: string): Promise<BusinessClaimSummaryResponse> {
    const result = await this.dataSource.transaction<BusinessClaim>(async (manager) => {
      const claim = await this.claimsRepo.findByIdForUpdate(manager, claimId);
      if (!claim) {
        throw new NotFoundException('Không tìm thấy claim');
      }
      if (claim.requesterId !== actorId) {
        throw new ForbiddenException('Chỉ requester mới được rút claim của chính mình.');
      }
      const targetStatus = assertValidClaimTransition(claim.status, 'withdraw');
      await this.claimsRepo.updateWithdrawn(manager, claim.id);
      return { ...claim, status: targetStatus };
    });

    await this.audit.record({
      event: 'business.claim_withdrawn',
      entityType: 'business_claim',
      entityId: result.id,
      actorId,
      result: AuditResult.SUCCESS,
      after: { status: result.status },
    });

    return toBusinessClaimSummary(result);
  }

  private async redirectToDisputed(
    manager: EntityManager,
    claim: BusinessClaim,
    actorId: string,
    decisionNote: string | null,
    decidedAt: Date,
  ): Promise<BusinessClaim> {
    const disputedStatus = assertValidClaimTransition(claim.status, 'dispute');
    await this.claimsRepo.updateDecision(manager, claim.id, {
      status: disputedStatus,
      reviewerId: actorId,
      reasonCode: null,
      decisionNote,
      decidedAt,
    });
    return { ...claim, status: disputedStatus, reviewerId: actorId, reasonCode: null, decisionNote, decidedAt };
  }
}
