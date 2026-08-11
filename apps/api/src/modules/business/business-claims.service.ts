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
import { isUniqueViolation } from '../../common/db/unique-violation';
import { BusinessClaimsRepository } from './repositories/business-claims.repository';
import { BusinessMembersRepository } from './repositories/business-members.repository';
import { BusinessClaim } from './entities/business-claim.entity';
import { PlacesRepository } from '../places/repositories/places.repository';
import { VerificationsService } from '../verifications/verifications.service';
import { SourcesRepository } from '../sources/repositories/sources.repository';
import { SourceType, SourceKind, SOURCE_TYPE_DEFAULT_RELIABILITY } from '../sources/sources.enums';
import { RolesRepository } from '../rbac/repositories/roles.repository';
import { UserRolesRepository } from '../rbac/repositories/user-roles.repository';
import { ScopeType } from '../rbac/rbac.enums';
import { AuditService } from '../../core/audit/audit.service';
import { AuditResult } from '../../core/audit/audit.enums';
import { assertValidClaimTransition } from './business-claim.transition';
import { BusinessClaimDecision, ClaimStatus } from './business.enums';
import { PlaceStatus } from '../places/place.enums';
import { SubmitBusinessClaimDto, DecideBusinessClaimDto, ListBusinessClaimsQueryDto } from './dto/business.dto';
import {
  toBusinessClaimDetail,
  toBusinessClaimSummary,
  toOwnBusinessClaimSummary,
  type BusinessClaimSummaryResponse,
  type BusinessClaimDetailResponse,
  type OwnBusinessClaimSummaryResponse,
} from './business.mapper';

const BUSINESS_OWNER_ROLE_CODE = 'business_owner';

// Chặn trên phòng thủ cho GET /business-claims/mine (không phân trang, xem
// BusinessClaimsRepository.listByRequester()) — khối lượng claim/một requester luôn nhỏ trong vận
// hành bình thường (uq_claim_pending: tối đa một pending/place); đây chỉ là giới hạn chống phình
// dữ liệu bất thường, không phải kích thước trang UI thật.
const OWN_CLAIMS_LIMIT = 100;

// BusinessClaimsService — ADR-015 Claim Decision Workflow (M3, không có M1/M2 trước đó trong repo
// này). submit() = WF-05 UC-B1 (Member, Business.Claim). decide() = UC-B2 (Moderator,
// Business.Verify, chỉ approve/reject — dispute TỰ ĐỘNG khi xung đột owner). withdraw() = actor
// requester, KHÔNG cần Business.Verify (business.md §4: "withdrawn | ... | requester").
//
// CLAIM -> SOURCE -> VERIFICATION INTEGRATION (2026-08-06) — thay thế Owner Decision 1 (verification
// chỉ ghi thẳng cache) VÀ guard C1 (chỉ NGỪNG ghi đè) đã áp dụng trước đây: `decide(approve)` giờ
// KHÔNG còn ghi `places.verificationStatus`/`verifiedAt` trực tiếp. Thay vào đó, nó gọi
// `VerificationsService.ensureOfficialFromClaim()` — đưa place tới trạng thái `official` qua ĐÚNG
// MỘT luồng Verification (tạo/gửi lại dòng `verifications` nếu cần rồi transition, method
// `owner_claim`), CÙNG transaction với `business_members`/`user_roles`/`business_claims` (một
// approve = một transaction, không có state nửa vời). `places.verification_status`/`verifiedAt` giờ
// CHỈ còn được `VerificationsService.syncTargetCache()` ghi — BusinessClaimsService không còn là
// writer nào của cache đó nữa (đóng transitional exception mà ADR-008 CORRECTION từng ghi nhận).
//
// CLAIM -> SOURCE -> VERIFICATION CORRECTION (2026-08-06, hai quyết định Owner sau PIR):
//  1. PRIVACY (Owner Decision 1): `sources.metadata` của claim CHỈ chứa `business_claim_id` —
//     TUYỆT ĐỐI KHÔNG sao chép `claim.evidence` vào đó. `GET /sources/:id` là `@Public()` và trả
//     nguyên entity (gồm `metadata`), nên evidence nằm ở đó là phơi giấy tờ kinh doanh riêng tư ra
//     kênh KHÔNG cần đăng nhập — đúng thứ mà API Business Claim cố tình che (summary/list không có
//     `evidence`; chỉ `GET /business-claims/{id}` sau `Business.Verify` mới trả). Evidence CHỈ đi qua
//     endpoint có phân quyền đó. `business_claim_id` là con trỏ không nhạy cảm: moderator tự tra lại.
//  2. NO-OP THẬT (Owner Decision 2): `sources` tạo qua callback LƯỜI truyền vào
//     `ensureOfficialFromClaim()`, nên nhánh "đã official" không sinh dòng `sources` mồ côi nào và
//     audit trỏ tới `verification.source_id` THẬT (xem `createClaimSource()` + audit context).
@Injectable()
export class BusinessClaimsService {
  constructor(
    private readonly claimsRepo: BusinessClaimsRepository,
    private readonly membersRepo: BusinessMembersRepository,
    private readonly placesRepo: PlacesRepository,
    private readonly rolesRepo: RolesRepository,
    private readonly userRolesRepo: UserRolesRepository,
    private readonly verificationsService: VerificationsService,
    private readonly sourcesRepo: SourcesRepository,
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

  /**
   * GET /business-claims/mine — claim CỦA CHÍNH requester đang gọi (KHÔNG cần `Business.Verify`,
   * KHÔNG khai `@RequirePermissions` ở controller — cùng nhánh "endpoint không khai báo permission
   * → chỉ cần đã xác thực" mà `PlacesController.listMine` (GET /places/mine) đã đặt tiền lệ).
   * `requesterId` LUÔN từ JWT (controller `@CurrentUser()`), KHÔNG bao giờ từ query/path/body —
   * self-scope enforce bằng lọc CSDL trực tiếp trên `requester_id`
   * (`BusinessClaimsRepository.listByRequester`), KHÔNG tái dùng `list()` (hàng đợi moderator) rồi
   * lọc ở tầng ứng dụng.
   */
  async listMine(requesterId: string): Promise<OwnBusinessClaimSummaryResponse[]> {
    const rows = await this.claimsRepo.listByRequester({ requesterId, limit: OWN_CLAIMS_LIMIT });
    return rows.map(toOwnBusinessClaimSummary);
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

    // Ghi lại source/verification thật (nhánh approve) để audit phản ánh ĐÚNG chuyện đã xảy ra
    // (gán trong transaction callback, đọc sau commit — decide() không retry transaction).
    // `sourceCreated=false` = nhánh no-op: place đã `official`, KHÔNG tạo source mới, `sourceId` là
    // source ĐANG gắn trên dòng `verifications` đó (CORRECTION, PIR M-1).
    let verificationResult: {
      sourceId: string | null;
      sourceCreated: boolean;
      verificationId: string;
      verificationStatus: string;
    } | null = null;

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

      // CLAIM -> SOURCE -> VERIFICATION INTEGRATION — đưa place tới `official` qua ĐÚNG MỘT luồng
      // Verification (xem chú thích đầu class). Đây là nguồn sự thật DUY NHẤT cho
      // `places.verification_status`/`verifiedAt` từ nay — không còn ghi cache trực tiếp ở đây.
      //
      // CORRECTION (PIR M-1): `sources` được tạo qua CALLBACK LƯỜI, chỉ khi `ensureOfficialFromClaim`
      // xác định thật sự cần một transition. Nhánh no-op (place đã `official`) KHÔNG gọi callback ->
      // KHÔNG dòng `sources` mồ côi nào, và audit trỏ tới source THẬT đang gắn trên dòng đó.
      const outcome = await this.verificationsService.ensureOfficialFromClaim(
        claim.placeId,
        {
          actorId,
          note: dto.decision_note ?? null,
          createSource: (mgr) => this.createClaimSource(claim, decidedAt, mgr),
        },
        manager,
      );
      verificationResult = {
        sourceId: outcome.sourceId,
        sourceCreated: outcome.sourceCreated,
        verificationId: outcome.verification.id,
        verificationStatus: outcome.verification.status,
      };

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
      // `null` = nhánh reject/dispute/redirect-to-disputed (không tạo source/verification nào).
      // Nhánh approve gắn source_id/source_created/verification_id/verification_status THẬT sau
      // `ensureOfficialFromClaim()` — truy vết được badge `official` của place này về ĐÚNG source +
      // dòng verifications nào, và `sourceCreated` nói rõ lần approve NÀY có sinh source mới hay
      // dùng lại source của một xác minh `official` đã có (nhánh no-op).
      context: { verification: verificationResult },
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

  /**
   * Tạo `sources` cho một claim vừa được approve — CALLBACK LƯỜI truyền vào
   * `VerificationsService.ensureOfficialFromClaim()`, CHỈ chạy khi thật sự sắp có transition
   * (CORRECTION, PIR M-1: không còn dòng `sources` mồ côi ở nhánh no-op). Trả về `id` để
   * `buildOfficialTransition()` xác thực + gắn vào `verifications.source_id`.
   *
   * `metadata` CHỈ chứa `business_claim_id` (Owner Decision 1, CORRECTION) — KHÔNG `claim.evidence`.
   * `GET /sources/:id` là `@Public()` và trả nguyên entity, nên mọi thứ đặt vào `metadata` là dữ liệu
   * CÔNG KHAI. Evidence của claim là riêng tư, chỉ lộ qua `GET /business-claims/{id}` sau
   * `Business.Verify`; `business_claim_id` là con trỏ không nhạy cảm để moderator tra lại từ đó.
   */
  private async createClaimSource(
    claim: BusinessClaim,
    decidedAt: Date,
    manager: EntityManager,
  ): Promise<string> {
    const source = await this.sourcesRepo.save(
      this.sourcesRepo.create({
        type: SourceType.BUSINESS_OWNER,
        kind: SourceKind.PLATFORM_USER,
        title: null,
        url: null,
        externalRef: null,
        publisher: null,
        authorUserId: claim.requesterId,
        license: null,
        reliability: SOURCE_TYPE_DEFAULT_RELIABILITY[SourceType.BUSINESS_OWNER],
        language: null,
        retrievedAt: decidedAt,
        metadata: { business_claim_id: claim.id },
      }),
      manager,
    );
    return source.id;
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
