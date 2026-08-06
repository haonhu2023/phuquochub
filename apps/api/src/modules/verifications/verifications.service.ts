import { ConflictException, ForbiddenException, Injectable, Logger, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import { clampLimit, clampPage, paginate } from '../../common/pagination';
import { isUniqueViolation } from '../../common/db/unique-violation';
import {
  VerificationsRepository,
  type OverdueVerificationCandidate,
  type VerificationExpiryCursor,
} from './repositories/verifications.repository';
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

// VERIFICATION SCHEDULER — Operational Enablement (2026-08-06). Mặc định thuần tuý cho
// `expireOverdue()` khi caller (scheduler/manual runner) không truyền — CÙNG con số
// `MediaCleanupService` đã dùng cho job dọn dẹp không người trực tiếp gọi tương tự (100 dòng/lô,
// tối đa 50 lô = 5,000 dòng/lần chạy, ngân sách 5 phút). Giá trị THẬT dùng khi chạy qua
// scheduler/CLI đến từ `ConfigService` (`verificationExpiry.*`, xem configuration.ts) — các hằng
// số này chỉ là fallback khi gọi `expireOverdue()` trực tiếp (vd unit test, code gọi thủ công).
const DEFAULT_EXPIRY_BATCH_SIZE = 100;
const DEFAULT_EXPIRY_MAX_BATCHES = 50;
const DEFAULT_EXPIRY_MAX_EXECUTION_MS = 5 * 60 * 1000;

export interface VerificationExpiryOptions {
  now?: Date;
  batchSize?: number;
  maxBatches?: number;
  maxExecutionMs?: number;
  // Dùng CHUNG truy vấn lô + tiêu chí đủ điều kiện với lần chạy thật — chỉ bỏ qua bước ghi (không
  // mở transaction). KHÔNG một state machine dry-run riêng.
  dryRun?: boolean;
}

export interface VerificationExpirySummary {
  dryRun: boolean;
  // Truy vấn lô đã lọc đúng điều kiện đủ hạn (findOverdueTrustedBatch) — `scanned`/`eligible` vì
  // vậy LUÔN bằng nhau; báo cáo tách hai trường vì kế hoạch/PIR đặt tên chúng riêng biệt (cùng quy
  // ước MediaCleanupSummary.scanned/eligible).
  scanned: number;
  eligible: number;
  expired: number;
  // CAS thua (một tác nhân khác vừa transition CÙNG dòng) HOẶC dòng không còn ở trạng thái hợp lệ
  // cho `expire` khi đọc lại TRONG transaction (đã bị verify/reject/expire bởi ai đó giữa lúc quét
  // lô và lúc xử lý dòng) — cùng MỘT lớp race "ai đó vừa đụng dòng này trước", đếm gộp, KHÔNG phải
  // lỗi hệ thống.
  conflicts: number;
  // Lỗi KHÔNG lường trước (vd sự cố kết nối DB giữa chừng một dòng) — dòng đó bị bỏ qua, các dòng
  // còn lại trong lô/lần chạy VẪN tiếp tục (transaction của MỖI dòng độc lập, §5C) — cùng nguyên
  // tắc `MediaCleanupService.processCandidate()` xử lý lỗi storage: không lỗi cả job vì một dòng.
  errors: number;
  batchesRun: number;
  timeBudgetExceeded: boolean;
  oldestProcessedExpiresAt: Date | null;
  newestProcessedExpiresAt: Date | null;
  durationMs: number;
}

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
  private readonly logger = new Logger(VerificationsService.name);

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
   * Job hết hạn (verification.md §9, "* -> expired | Job hệ thống"). VERIFICATION SCHEDULER —
   * Operational Enablement (2026-08-06): trước đây tải TOÀN BỘ tập kết quả vào bộ nhớ rồi lặp
   * không giới hạn (PIR finding, "the expiry path is unbounded") — nay lô hoá + cursor keyset +
   * ngân sách thời gian, CÙNG cấu trúc `MediaCleanupService.run()` (batch fetch → cursor tiến sau
   * MỖI LÔ, không phụ thuộc kết quả từng dòng → kiểm ngân sách thời gian GIỮA các dòng, không bao
   * giờ giữa chừng một dòng). KHÔNG state machine thứ hai: mỗi dòng vẫn đi qua ĐÚNG
   * `assertValidVerificationTransition(...,'expire')` + `casUpdate` + `eventsRepo.append` +
   * `syncTargetCache` — y hệt bản gốc, chỉ bọc lô/cursor/ngân sách xung quanh. Mỗi dòng transition
   * vẫn trong TRANSACTION RIÊNG (một transition = một transaction, §5C) — CAS thua hoặc dòng không
   * còn hợp lệ cho `expire` khi đọc lại (ai đó vừa transition dòng đó giữa lúc quét và lúc xử lý)
   * đều đếm vào `conflicts`, KHÔNG fatal, KHÔNG dừng job. Lỗi THẬT KHÔNG lường trước (vd sự cố kết
   * nối) đếm vào `errors`, dòng đó bị bỏ qua — các dòng còn lại VẪN tiếp tục.
   *
   * `dryRun`: dùng CHUNG truy vấn lô + logic đủ điều kiện, chỉ bỏ qua bước ghi (không mở
   * transaction) — KHÔNG một state machine dry-run riêng, cùng nguyên tắc `MediaCleanupService`
   * (`if (!dryRun) { await processCandidate(...) }`).
   */
  async expireOverdue(options: VerificationExpiryOptions = {}): Promise<VerificationExpirySummary> {
    const now = options.now ?? new Date();
    const dryRun = options.dryRun ?? false;
    const batchSize = options.batchSize ?? DEFAULT_EXPIRY_BATCH_SIZE;
    const maxBatches = options.maxBatches ?? DEFAULT_EXPIRY_MAX_BATCHES;
    const maxExecutionMs = options.maxExecutionMs ?? DEFAULT_EXPIRY_MAX_EXECUTION_MS;
    const startedAt = Date.now();

    const summary: VerificationExpirySummary = {
      dryRun,
      scanned: 0,
      eligible: 0,
      expired: 0,
      conflicts: 0,
      errors: 0,
      batchesRun: 0,
      timeBudgetExceeded: false,
      oldestProcessedExpiresAt: null,
      newestProcessedExpiresAt: null,
      durationMs: 0,
    };

    // Cursor keyset (expires_at, id) — TIẾN SAU MỖI LÔ (không phải sau mỗi dòng), cùng quy ước
    // `MediaCleanupService.run()`: tiến độ phân trang KHÔNG phụ thuộc việc một dòng có thật sự
    // chuyển trạng thái hay không. Cursor CHỈ sống trong MỘT lần gọi `expireOverdue()` — không lưu
    // giữa các lần chạy — nên một dòng bị bỏ lỡ do dừng giữa lô (ngân sách thời gian) vẫn được quét
    // lại từ đầu ở lần chạy KẾ TIẾP (job tự phục hồi, không mất dòng vĩnh viễn).
    let cursor: VerificationExpiryCursor | undefined;

    for (let batch = 0; batch < maxBatches; batch++) {
      if (Date.now() - startedAt >= maxExecutionMs) {
        summary.timeBudgetExceeded = true;
        break;
      }

      const candidates = await this.verificationsRepo.findOverdueTrustedBatch(now, batchSize, cursor);
      if (candidates.length === 0) {
        break;
      }
      summary.batchesRun += 1;
      const last = candidates[candidates.length - 1];
      cursor = { expiresAt: last.expiresAtCursor, id: last.id };

      for (const candidate of candidates) {
        this.trackExpiryCandidateStats(summary, candidate);

        if (!dryRun) {
          // Yêu cầu: "một dòng đã bắt đầu xử lý PHẢI xong an toàn" — một khi transaction của MỘT
          // dòng bắt đầu, nó LUÔN chạy tới hoàn tất (CAS → event → cache sync, hoặc rollback sạch
          // nếu lỗi) trước khi ngân sách thời gian được kiểm lại. Ngân sách chỉ được xét GIỮA các
          // dòng, KHÔNG BAO GIỜ giữa chừng một dòng.
          await this.processExpiryCandidate(candidate, summary, now);
        }

        if (Date.now() - startedAt >= maxExecutionMs) {
          summary.timeBudgetExceeded = true;
          break;
        }
      }

      if (summary.timeBudgetExceeded) break;
      if (candidates.length < batchSize) break; // trang cuối — không còn dòng nào khác
    }

    summary.durationMs = Date.now() - startedAt;
    this.logger.log(
      `Verification expiry ${dryRun ? '(dry-run) ' : ''}finished: ${JSON.stringify(summary)}`,
    );
    return summary;
  }

  private trackExpiryCandidateStats(
    summary: VerificationExpirySummary,
    candidate: OverdueVerificationCandidate,
  ): void {
    summary.scanned += 1;
    summary.eligible += 1;
    if (!summary.oldestProcessedExpiresAt || candidate.expiresAt < summary.oldestProcessedExpiresAt) {
      summary.oldestProcessedExpiresAt = candidate.expiresAt;
    }
    if (!summary.newestProcessedExpiresAt || candidate.expiresAt > summary.newestProcessedExpiresAt) {
      summary.newestProcessedExpiresAt = candidate.expiresAt;
    }
  }

  /**
   * Xử lý ĐÚNG MỘT dòng — mở transaction RIÊNG, đi qua CHÍNH XÁC con đường transition đã có
   * (`assertValidVerificationTransition`/`casUpdate`/`eventsRepo.append`/`syncTargetCache`), KHÔNG
   * logic thứ hai. Không throw ra ngoài: mọi kết quả (thành công/conflict/lỗi) được ghi vào
   * `summary`, để một dòng lỗi KHÔNG làm gãy toàn bộ lô/lần chạy.
   */
  private async processExpiryCandidate(
    candidate: OverdueVerificationCandidate,
    summary: VerificationExpirySummary,
    now: Date,
  ): Promise<void> {
    try {
      const outcome = await this.dataSource.transaction<'expired' | 'conflict'>(async (manager) => {
        const fresh = await this.verificationsRepo.findById(candidate.id, manager);
        if (!fresh) {
          // Đã bị xoá (không có luồng xoá cứng nào cho verifications hiện tại, nhưng không giả
          // định — xem như một race: dòng không còn để xử lý).
          return 'conflict';
        }
        let toStatus: VerificationStatus;
        try {
          toStatus = assertValidVerificationTransition(fresh.status, 'expire');
        } catch {
          // Không còn ở trạng thái hợp lệ cho `expire` — ai đó (moderator/job cộng đồng) đã
          // transition dòng này giữa lúc quét lô và lúc xử lý. Cùng LỚP race với CAS thua bên
          // dưới — đếm gộp vào `conflicts`.
          return 'conflict';
        }

        const ok = await this.verificationsRepo.casUpdate(
          fresh.id,
          fresh.lockVersion,
          { status: toStatus, method: VerificationMethod.SYSTEM_AUTO },
          manager,
        );
        if (!ok) {
          return 'conflict';
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
        // `expired` KHÔNG phải trạng thái tin cậy — `syncTargetCache` sẽ KHÔNG set `verifiedAt`
        // (chỉ set khi ĐẾN trạng thái tin cậy, F1/ADR-008 CORRECTION) nên giá trị `now` truyền vào
        // đây chỉ có ý nghĩa lý thuyết, không ảnh hưởng ghi thật.
        await this.syncTargetCache(manager, fresh, toStatus, now);
        return 'expired';
      });

      if (outcome === 'expired') {
        summary.expired += 1;
      } else {
        summary.conflicts += 1;
      }
    } catch (err) {
      // Lỗi THẬT không lường trước (vd sự cố kết nối DB giữa chừng transaction) — dòng bị bỏ qua,
      // các dòng CÒN LẠI trong lô/lần chạy vẫn tiếp tục. Dòng này vẫn đủ điều kiện (không đổi gì)
      // nên sẽ được quét lại ở lần chạy kế tiếp — job tự phục hồi, không cần can thiệp thủ công.
      summary.errors += 1;
      this.logger.error(
        `Verification expiry: lỗi khi xử lý verification ${candidate.id} — bỏ qua, sẽ thử lại lần chạy sau: ${(err as Error).message}`,
        (err as Error).stack,
      );
    }
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
