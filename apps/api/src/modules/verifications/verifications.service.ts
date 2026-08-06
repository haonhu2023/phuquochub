import { ConflictException, ForbiddenException, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import { clampLimit, clampPage, paginate } from '../../common/pagination';
import { isUniqueViolation } from '../../common/db/unique-violation';
import { VerificationsRepository } from './repositories/verifications.repository';
import { VerificationEventsRepository } from './repositories/verification-events.repository';
import { VerificationVotesRepository } from './repositories/verification-votes.repository';
import { PlacesRepository } from '../places/repositories/places.repository';
import { ContactsRepository } from '../contacts/repositories/contacts.repository';
import { PricesRepository } from '../prices/repositories/prices.repository';
import { SourcesRepository } from '../sources/repositories/sources.repository';
import { SourceType } from '../sources/sources.enums';
import { AuditService } from '../../core/audit/audit.service';
import { AuditResult } from '../../core/audit/audit.enums';
import { Verification } from './entities/verification.entity';
import { VerificationMethod, VerificationTargetType } from './verification.enums';
import { VerificationStatus } from '../places/place.enums';
import { assertValidVerificationTransition, isTrustedStatus } from './verification.transition';
import {
  SubmitVerificationDto,
  ListVerificationsQueryDto,
  ClaimVerificationDto,
  VerifyDecisionDto,
  OfficialDecisionDto,
  RejectDecisionDto,
  CastVoteDto,
} from './dto/verification.dto';
import {
  toVerificationResponse,
  toVerificationEventResponse,
  type VerificationResponse,
  type VerificationEventResponse,
} from './verification.mapper';

// ADR-008 Verification Foundation. §5C: "một transition = một transaction" — update `verifications`
// (kèm `lock_version` CAS) + INSERT `verification_events` + đồng bộ cache
// `verification_status`/`verified_at` trên entity đích, KHÔNG TÁCH RỜI. Audit (`audit_logs`,
// platform-wide) luôn ghi SAU khi transaction commit — cùng nguyên tắc mọi service khác trong repo
// này (BusinessTransferService/BusinessClaimsService/ModerationService).
//
// Owner Decision (2026-08-06): permission model KHÔNG đổi — `Verification.Verify`/`Reject` vẫn
// moderator-only, KHÔNG hậu tố scope, KHÔNG cấp cho `business_owner`, KHÔNG có biến thể `.Managed`.
// `BusinessClaimsService.decide()` KHÔNG bị đụng tới — tiếp tục ghi thẳng
// `places.verificationStatus`/`verifiedAt` khi approve claim, KHÔNG tạo dòng `verifications` nào.
// Bảng `verifications` ở milestone này KHÔNG PHẢI nguồn sự thật duy nhất cho luồng ADR-015 claim —
// chỉ là nguồn sự thật cho các luồng xác minh mà CHÍNH milestone này triển khai (verify/official/
// reject/vote/expire qua endpoint `/verifications/*`). Tích hợp Business Claim -> Source ->
// Verification là việc tương lai riêng, cần quyết định mô hình Source cho claim trước.
const COMMUNITY_CONFIRM_THRESHOLD = 5; // Σ weight(confirm) ≥ 5 (verification.md §10 mục 2)
const COMMUNITY_DISPUTE_RATIO_MAX = 0.2; // dispute/confirm < 0.2

// verification.md §10 mục 7 liệt kê trọng số theo vai trò là CÒN MỞ ("Member=1, Local Guide=?, Verified
// Local=? chốt cùng growth.md") — ADR-008 tự nhận đây là tham số CHƯA được quyết định, không phải một
// giá trị milestone này có thể "triển khai đúng chính xác". Dùng trọng số ĐỒNG NHẤT = 1 cho MỌI phiếu ở
// milestone này (cột `weight` vẫn có, sẵn sàng cho một bảng trọng số thật khi growth.md chốt) — KHÔNG
// tự bịa số cho Local Guide/Verified Local mà ADR-008 chưa phê duyệt.
const DEFAULT_VOTE_WEIGHT = 1;

const DEFAULT_SLA_HOURS = 48; // ADR-008 không chỉ định SLA mặc định — giả định tường minh, ghi ở đây.
const OFFICIAL_DEFAULT_EXPIRY_MONTHS = 12; // verification.md §7/§10 mục 3.

// §7: "official đi kèm source_id thuộc nhóm chính thức (business_owner/official_website/government
// theo module-source.md §4.1)" — KHÔNG diễn đạt được bằng CHECK (phụ thuộc bảng `sources`), cưỡng
// chế ở đây.
const OFFICIAL_SOURCE_TYPES = new Set<SourceType>([
  SourceType.OFFICIAL_WEBSITE,
  SourceType.BUSINESS_OWNER,
  SourceType.GOVERNMENT,
]);

// Partial-unique index trên `verifications` (một xác minh hiện hành / target) — chốt chặn CUỐI CÙNG
// cho race giữa hai `submit()` đồng thời cùng target (ADR-008 CORRECTION, PIR finding T1).
const VERIFICATION_TARGET_UNIQUE_CONSTRAINTS = ['uq_verif_place', 'uq_verif_contact', 'uq_verif_price'];

interface TargetRef {
  placeId: string | null;
  contactId: string | null;
  priceHistoryId: string | null;
}

// Trạng thái cache hiện tại của target, đọc cùng lúc xác nhận target tồn tại — cần cho guard C1
// (ADR-008 CORRECTION): một cache đang ở trạng thái tin cậy mà KHÔNG có dòng `verifications` nào
// nghĩa là nó do một writer KHÁC đặt (hiện tại chỉ có một: `BusinessClaimsService.decide()`).
interface ResolvedTarget extends TargetRef {
  currentCacheStatus: VerificationStatus;
}

@Injectable()
export class VerificationsService {
  constructor(
    private readonly verificationsRepo: VerificationsRepository,
    private readonly eventsRepo: VerificationEventsRepository,
    private readonly votesRepo: VerificationVotesRepository,
    private readonly placesRepo: PlacesRepository,
    private readonly contactsRepo: ContactsRepository,
    private readonly pricesRepo: PricesRepository,
    private readonly sourcesRepo: SourcesRepository,
    private readonly audit: AuditService,
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  /** POST /verifications — gửi/gửi lại một target vào hàng đợi xác minh. */
  async submit(dto: SubmitVerificationDto, actorId: string): Promise<VerificationResponse> {
    const target = await this.resolveAndValidateTarget(dto.target_type, dto.target_id);

    const result = await this.dataSource.transaction<Verification>(async (manager) => {
      const existing = await this.verificationsRepo.findActiveByTarget(
        {
          placeId: target.placeId ?? undefined,
          contactId: target.contactId ?? undefined,
          priceHistoryId: target.priceHistoryId ?? undefined,
        },
        manager,
      );

      if (!existing) {
        // ADR-008 CORRECTION (PIR finding C1) — GUARD PHÒNG VỆ: cache đang ở trạng thái TIN CẬY mà
        // KHÔNG có dòng `verifications` nào nghĩa là một writer KHÁC đã đặt nó (hiện chỉ có
        // `BusinessClaimsService.decide()` khi approve claim). Tạo dòng `pending` ở đây sẽ HẠ CẤP
        // badge công khai đó (`places.verification_status` lộ ra trên route `@Public`) một cách âm
        // thầm. Từ chối, KHÔNG "nhận" cache làm trạng thái khởi tạo: `official` đòi `source_id`
        // (CHECK ck_verif_official_source) mà claim KHÔNG hề sinh ra `sources` nào — nhận vào sẽ
        // vi phạm chính ADR-008. Đây là GIỚI HẠN CHUYỂN TIẾP đã biết, không phải lỗi: mở khoá nó
        // cần milestone tích hợp Business Claim -> Source -> Verification riêng.
        if (isTrustedStatus(target.currentCacheStatus)) {
          throw new ConflictException(
            `Target đang có trạng thái xác minh '${target.currentCacheStatus}' được đặt NGOÀI hệ ` +
              `Verification (Business Claim approval — ADR-015). Chưa thể đưa target này vào hàng đợi ` +
              `xác minh: làm vậy sẽ hạ cấp trạng thái đó xuống 'pending'. Cần milestone tích hợp ` +
              `Business Claim -> Source -> Verification trước.`,
          );
        }

        let created: Verification;
        try {
          created = await this.verificationsRepo.create(
            {
              placeId: target.placeId,
              contactId: target.contactId,
              priceHistoryId: target.priceHistoryId,
              method: VerificationMethod.MODERATOR,
              createdBy: actorId,
              note: dto.note ?? null,
            },
            manager,
          );
        } catch (err) {
          // ADR-008 CORRECTION (PIR finding T1): hai `submit()` đồng thời cùng target — cả hai đọc
          // `findActiveByTarget` = null rồi cả hai INSERT. Partial-unique index là chốt chặn CUỐI
          // CÙNG (toàn vẹn DB vẫn đúng, không có dòng trùng); trước đây lỗi 23505 nổi lên thành 500.
          // Bắt ĐÚNG vi phạm đã lường trước, trả 409 để client đọc lại & thử lại.
          if (isUniqueViolation(err, ...VERIFICATION_TARGET_UNIQUE_CONSTRAINTS)) {
            throw new ConflictException(
              'Target vừa được gửi xác minh đồng thời bởi một request khác — đọc lại và thử lại.',
            );
          }
          throw err;
        }
        await this.eventsRepo.append(
          {
            verificationId: created.id,
            fromStatus: null,
            toStatus: VerificationStatus.PENDING,
            method: VerificationMethod.MODERATOR,
            actorId,
            note: dto.note ?? null,
          },
          manager,
        );
        await this.syncTargetCache(manager, target, VerificationStatus.PENDING, new Date());
        return created;
      }

      // Đã có dòng — chỉ hợp lệ khi đang expired/rejected (gửi lại, verification.md §3.2).
      const toStatus = assertValidVerificationTransition(existing.status, 'submit');
      // ADR-008 CORRECTION (PIR finding F1): XOÁ trường của trạng thái cuối trước đó. `expiresAt`
      // sót lại là lỗi THẬT, không chỉ mất vệ sinh dữ liệu: official(expires=T) -> expired ->
      // submit -> verify sẽ cho ra một dòng `verified` mang `expires_at` đã QUÁ HẠN, và
      // `expireOverdue()` hạ cấp nó ngay lần chạy kế tiếp — xác minh của moderator tự bốc hơi.
      // `reasonCode`/`rejectedReason` sót lại thì hiện lên API trên một dòng không hề bị bác.
      const resubmitPatch = {
        status: toStatus,
        method: VerificationMethod.MODERATOR,
        note: dto.note ?? existing.note,
        reasonCode: null,
        rejectedReason: null,
        expiresAt: null,
      };
      const ok = await this.verificationsRepo.casUpdate(
        existing.id,
        existing.lockVersion,
        resubmitPatch,
        manager,
      );
      if (!ok) {
        throw new ConflictException('Verification vừa bị thay đổi đồng thời — thử lại.');
      }
      await this.eventsRepo.append(
        {
          verificationId: existing.id,
          fromStatus: existing.status,
          toStatus,
          method: VerificationMethod.MODERATOR,
          actorId,
          note: dto.note ?? null,
        },
        manager,
      );
      await this.syncTargetCache(manager, target, toStatus, new Date());
      // Trả về ĐÚNG những gì vừa ghi: áp CẢ patch, không chỉ `status`. Bản trước chỉ spread
      // `existing` + `status` nên response vẫn phơi ra `expires_at`/`reason_code` CŨ dù DB đã xoá —
      // API nói dối về trạng thái nó vừa tạo ra (chính e2e F1 bắt được lỗi này). Cùng khuôn
      // `transition()`/`vote()` vốn đã `{ ...current, ...patch }`.
      return { ...existing, ...resubmitPatch, lockVersion: existing.lockVersion + 1 };
    });

    await this.audit.record({
      event: 'verification.submitted',
      entityType: 'verification',
      entityId: result.id,
      actorId,
      result: AuditResult.SUCCESS,
      context: { target_type: dto.target_type, target_id: dto.target_id, status: result.status },
    });

    return toVerificationResponse(result);
  }

  /** GET /verifications — hàng đợi moderator. */
  async list(query: ListVerificationsQueryDto) {
    const page = clampPage(query.page);
    const limit = clampLimit(query.limit);
    const { items, total } = await this.verificationsRepo.list({
      status: query.status,
      assignedTo: query.assigned_to,
      limit,
      offset: (page - 1) * limit,
    });
    return paginate(items.map(toVerificationResponse), page, limit, total);
  }

  /** GET /verifications/{id}. */
  async getById(id: string): Promise<VerificationResponse> {
    const v = await this.verificationsRepo.findById(id);
    if (!v) {
      throw new NotFoundException('Không tìm thấy verification.');
    }
    return toVerificationResponse(v);
  }

  /** GET /verifications/{id}/events — lịch sử chuyển trạng thái. */
  async listEvents(id: string): Promise<VerificationEventResponse[]> {
    const v = await this.verificationsRepo.findById(id);
    if (!v) {
      throw new NotFoundException('Không tìm thấy verification.');
    }
    const events = await this.eventsRepo.listByVerification(id);
    return events.map(toVerificationEventResponse);
  }

  /**
   * POST /verifications/{id}/claim — moderator nhận việc. KHÔNG phải status transition (không ghi
   * verification_events) — chỉ set assigned_to/assigned_at/sla_due_at/priority, vẫn qua CAS
   * lock_version để không ghi đè một transition khác đang chạy đồng thời trên CÙNG dòng.
   */
  async claim(id: string, dto: ClaimVerificationDto, actorId: string): Promise<VerificationResponse> {
    const current = await this.verificationsRepo.findById(id);
    if (!current) {
      throw new NotFoundException('Không tìm thấy verification.');
    }
    if (current.assignedTo && current.assignedTo !== actorId) {
      throw new ForbiddenException('Verification này đã được moderator khác nhận việc.');
    }

    const now = new Date();
    const slaDueAt = dto.sla_due_at
      ? new Date(dto.sla_due_at)
      : new Date(now.getTime() + DEFAULT_SLA_HOURS * 60 * 60 * 1000);

    const ok = await this.verificationsRepo.casUpdate(id, current.lockVersion, {
      assignedTo: actorId,
      assignedAt: now,
      slaDueAt,
      priority: dto.priority ?? current.priority,
    });
    if (!ok) {
      throw new ConflictException('Verification vừa bị thay đổi đồng thời — thử lại.');
    }

    await this.audit.record({
      event: 'verification.claimed',
      entityType: 'verification',
      entityId: id,
      actorId,
      result: AuditResult.SUCCESS,
      context: { sla_due_at: slaDueAt.toISOString(), priority: dto.priority ?? current.priority },
    });

    return this.getById(id);
  }

  /** POST /verifications/{id}/verify — pending|community_verified -> verified. */
  async verify(id: string, dto: VerifyDecisionDto, actorId: string): Promise<VerificationResponse> {
    const result = await this.transition(id, 'verify', actorId, async (current) => {
      const toStatus = assertValidVerificationTransition(current.status, 'verify');
      const now = new Date();
      const patch = {
        status: toStatus,
        method: VerificationMethod.MODERATOR,
        sourceId: dto.source_id ?? null,
        confidence: dto.confidence ?? null,
        note: dto.note ?? current.note,
        verifiedBy: actorId,
        validFrom: now,
        // F1: một dòng `verified` không được mang metadata bác bỏ của lần trước.
        reasonCode: null,
        rejectedReason: null,
      };
      return { toStatus, patch, method: VerificationMethod.MODERATOR, sourceId: dto.source_id ?? null, note: dto.note ?? null };
    });
    return toVerificationResponse(result);
  }

  /** POST /verifications/{id}/official — pending|verified|community_verified -> official. */
  async official(id: string, dto: OfficialDecisionDto, actorId: string): Promise<VerificationResponse> {
    const result = await this.transition(id, 'official', actorId, async (current, manager) => {
      const toStatus = assertValidVerificationTransition(current.status, 'official');

      const source = await this.sourcesRepo.findById(dto.source_id, manager);
      if (!source) {
        throw new NotFoundException('Không tìm thấy source.');
      }
      if (!OFFICIAL_SOURCE_TYPES.has(source.type)) {
        throw new UnprocessableEntityException(
          `Source loại '${source.type}' không thuộc nhóm chính thức (business_owner/official_website/government) — không thể dùng cho trạng thái official.`,
        );
      }

      const isPriceHistory = current.priceHistoryId !== null;
      let expiresAt: Date | null;
      if (dto.expires_at === undefined) {
        expiresAt = addMonths(new Date(), OFFICIAL_DEFAULT_EXPIRY_MONTHS);
      } else if (dto.expires_at === null) {
        if (isPriceHistory) {
          throw new UnprocessableEntityException('price_history bắt buộc expires_at khi đặt official.');
        }
        expiresAt = null;
      } else {
        expiresAt = new Date(dto.expires_at);
      }

      const now = new Date();
      const patch = {
        status: toStatus,
        method: VerificationMethod.MODERATOR,
        sourceId: dto.source_id,
        confidence: dto.confidence ?? null,
        note: dto.note ?? current.note,
        verifiedBy: actorId,
        validFrom: now,
        expiresAt,
        // F1: một dòng `official` không được mang metadata bác bỏ của lần trước.
        reasonCode: null,
        rejectedReason: null,
      };
      return { toStatus, patch, method: VerificationMethod.MODERATOR, sourceId: dto.source_id, note: dto.note ?? null };
    });
    return toVerificationResponse(result);
  }

  /** POST /verifications/{id}/reject — pending|verified|official|community_verified -> rejected. */
  async reject(id: string, dto: RejectDecisionDto, actorId: string): Promise<VerificationResponse> {
    const result = await this.transition(id, 'reject', actorId, async (current) => {
      const toStatus = assertValidVerificationTransition(current.status, 'reject');
      const patch = {
        status: toStatus,
        method: VerificationMethod.MODERATOR,
        reasonCode: dto.reason_code,
        rejectedReason: dto.rejected_reason ?? null,
        note: dto.note ?? current.note,
        // F1: một dòng bị bác KHÔNG còn cửa sổ hiệu lực — `expires_at` của trạng thái tin cậy
        // trước đó (vd official) không được sống tiếp sang `rejected`.
        expiresAt: null,
      };
      return { toStatus, patch, method: VerificationMethod.MODERATOR, sourceId: null, note: dto.note ?? null };
    });
    return toVerificationResponse(result);
  }

  /**
   * POST /verifications/{id}/votes — bỏ/đổi phiếu (Verification.Vote). Trọng số ĐỒNG NHẤT = 1 ở
   * milestone này (xem DEFAULT_VOTE_WEIGHT). Nếu đủ ngưỡng cộng đồng NGAY SAU phiếu này VÀ đang
   * pending -> tự động chuyển community_verified TRONG CÙNG transaction (§5C).
   */
  async vote(id: string, dto: CastVoteDto, actorId: string): Promise<VerificationResponse> {
    const result = await this.dataSource.transaction<{ verification: Verification; promoted: boolean }>(
      async (manager) => {
        const current = await this.verificationsRepo.findById(id, manager);
        if (!current) {
          throw new NotFoundException('Không tìm thấy verification.');
        }

        await this.votesRepo.cast(
          { verificationId: id, userId: actorId, vote: dto.vote, weight: DEFAULT_VOTE_WEIGHT, note: dto.note },
          manager,
        );
        const tally = await this.votesRepo.tally(id, manager);

        const meetsThreshold =
          current.status === VerificationStatus.PENDING &&
          tally.confirmCount >= COMMUNITY_CONFIRM_THRESHOLD &&
          tally.confirmCount > 0 &&
          tally.disputeCount / tally.confirmCount < COMMUNITY_DISPUTE_RATIO_MAX;

        let toStatus = current.status;
        const patch: Record<string, unknown> = {
          confirmCount: tally.confirmCount,
          disputeCount: tally.disputeCount,
        };
        if (meetsThreshold) {
          toStatus = assertValidVerificationTransition(current.status, 'communityVerify');
          patch.status = toStatus;
          patch.method = VerificationMethod.COMMUNITY_VOTE;
          patch.validFrom = new Date();
        }

        const ok = await this.verificationsRepo.casUpdate(id, current.lockVersion, patch, manager);
        if (!ok) {
          throw new ConflictException('Verification vừa bị thay đổi đồng thời — thử lại.');
        }

        if (meetsThreshold) {
          await this.eventsRepo.append(
            {
              verificationId: id,
              fromStatus: current.status,
              toStatus,
              method: VerificationMethod.COMMUNITY_VOTE,
              actorId: null,
              note: 'Đủ ngưỡng phiếu cộng đồng (tự động)',
            },
            manager,
          );
          await this.syncTargetCache(manager, current, toStatus, new Date());
        }

        return {
          verification: { ...current, ...patch, lockVersion: current.lockVersion + 1 } as Verification,
          promoted: meetsThreshold,
        };
      },
    );

    await this.audit.record({
      event: 'verification.vote_cast',
      entityType: 'verification',
      entityId: id,
      actorId,
      result: AuditResult.SUCCESS,
      context: { vote: dto.vote, promoted_to_community_verified: result.promoted },
    });

    return toVerificationResponse(result.verification);
  }

  /**
   * Job hết hạn (verification.md §9, "* -> expired | Job hệ thống"). KHÔNG có hạ tầng lập lịch
   * (@nestjs/schedule, BullMQ, cron...) trong repo — cùng quy ước
   * `InventoryHoldsRepository.expireOverdueHolds()`: một job thật (sprint sau) chỉ cần gọi định kỳ
   * phương thức này. Mỗi dòng transition trong TRANSACTION RIÊNG (một transition = một transaction,
   * §5C) — CAS thua ở một dòng (ai đó vừa transition dòng đó) chỉ bỏ qua dòng đó, KHÔNG lỗi cả job.
   */
  async expireOverdue(now: Date = new Date()): Promise<number> {
    const overdue = await this.verificationsRepo.listOverdueTrusted(now);
    let expiredCount = 0;

    for (const row of overdue) {
      const transitioned = await this.dataSource.transaction<boolean>(async (manager) => {
        const fresh = await this.verificationsRepo.findById(row.id, manager);
        if (!fresh) {
          return false;
        }
        let toStatus: VerificationStatus;
        try {
          toStatus = assertValidVerificationTransition(fresh.status, 'expire');
        } catch {
          return false;
        }

        const ok = await this.verificationsRepo.casUpdate(
          fresh.id,
          fresh.lockVersion,
          { status: toStatus, method: VerificationMethod.SYSTEM_AUTO },
          manager,
        );
        if (!ok) {
          return false;
        }

        await this.eventsRepo.append(
          {
            verificationId: fresh.id,
            fromStatus: fresh.status,
            toStatus,
            method: VerificationMethod.SYSTEM_AUTO,
            actorId: null,
            note: null,
          },
          manager,
        );
        await this.syncTargetCache(manager, fresh, toStatus, now);
        return true;
      });
      if (transitioned) {
        expiredCount += 1;
      }
    }

    return expiredCount;
  }

  /**
   * Khung chung cho các quyết định moderator (verify/official/reject) — đọc dòng hiện hành, gọi
   * `build` để tính patch/toStatus (build có thể throw NotFound/Unprocessable TRƯỚC khi ghi gì),
   * CAS update, ghi verification_events, đồng bộ cache target, audit SAU commit.
   */
  private async transition(
    id: string,
    action: 'verify' | 'official' | 'reject',
    actorId: string,
    build: (
      current: Verification,
      manager: EntityManager,
    ) => Promise<{
      toStatus: VerificationStatus;
      patch: Record<string, unknown>;
      method: VerificationMethod;
      sourceId: string | null;
      note: string | null;
    }>,
  ): Promise<Verification> {
    const result = await this.dataSource.transaction<Verification>(async (manager) => {
      const current = await this.verificationsRepo.findById(id, manager);
      if (!current) {
        throw new NotFoundException('Không tìm thấy verification.');
      }

      const { toStatus, patch, method, sourceId, note } = await build(current, manager);

      const ok = await this.verificationsRepo.casUpdate(id, current.lockVersion, patch, manager);
      if (!ok) {
        throw new ConflictException('Verification vừa bị thay đổi đồng thời — thử lại.');
      }

      await this.eventsRepo.append(
        {
          verificationId: id,
          fromStatus: current.status,
          toStatus,
          method,
          sourceId,
          actorId,
          note,
        },
        manager,
      );

      await this.syncTargetCache(manager, current, toStatus, new Date());

      return { ...current, ...patch, lockVersion: current.lockVersion + 1 } as Verification;
    });

    await this.audit.record({
      event: `verification.${action === 'official' ? 'set_official' : action}`,
      entityType: 'verification',
      entityId: id,
      actorId,
      result: AuditResult.SUCCESS,
      context: { to_status: result.status },
    });

    return result;
  }

  /** Đồng bộ cache `verification_status`/`verified_at` trên ĐÚNG entity đích (exclusive arc). */
  private async syncTargetCache(
    manager: EntityManager,
    target: TargetRef,
    newStatus: VerificationStatus,
    transitionedAt: Date,
  ): Promise<void> {
    const patch: Record<string, unknown> = { verificationStatus: newStatus };
    if (isTrustedStatus(newStatus)) {
      patch.verifiedAt = transitionedAt;
    }
    if (target.placeId) {
      await this.placesRepo.updateScalars(target.placeId, patch, manager);
    } else if (target.contactId) {
      await this.contactsRepo.updateScalars(target.contactId, patch, manager);
    } else if (target.priceHistoryId) {
      await this.pricesRepo.updateScalars(target.priceHistoryId, patch, manager);
    }
  }

  /**
   * Xác nhận target tồn tại VÀ đọc trạng thái cache hiện tại của nó (cho guard C1). Với `place`
   * dùng `getCardByIdIncludingInactive` — CÙNG method `BusinessClaimsService.submit()` đã dùng
   * (privileged read, hợp lệ ở đây: mọi route `/verifications/*` đều gác `Verification.Verify`,
   * KHÔNG `@Public`) — nó vừa trả `verification_status` vừa lọc `deleted_at IS NULL`, đúng cùng
   * ngữ nghĩa `existsById` trước đó chứ không nới lỏng gì.
   */
  private async resolveAndValidateTarget(type: VerificationTargetType, id: string): Promise<ResolvedTarget> {
    if (type === VerificationTargetType.PLACE) {
      const place = await this.placesRepo.getCardByIdIncludingInactive(id);
      if (!place) {
        throw new NotFoundException('Không tìm thấy place.');
      }
      return {
        placeId: id,
        contactId: null,
        priceHistoryId: null,
        currentCacheStatus: place.verification_status as VerificationStatus,
      };
    }
    if (type === VerificationTargetType.CONTACT) {
      const contact = await this.contactsRepo.findById(id);
      if (!contact) {
        throw new NotFoundException('Không tìm thấy contact.');
      }
      return {
        placeId: null,
        contactId: id,
        priceHistoryId: null,
        currentCacheStatus: contact.verificationStatus,
      };
    }
    const price = await this.pricesRepo.findById(id);
    if (!price) {
      throw new NotFoundException('Không tìm thấy price_history.');
    }
    return {
      placeId: null,
      contactId: null,
      priceHistoryId: id,
      currentCacheStatus: price.verificationStatus,
    };
  }
}

function addMonths(date: Date, months: number): Date {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d;
}
