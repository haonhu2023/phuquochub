import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { BusinessClaim } from '../entities/business-claim.entity';
import { ClaimReasonCode, ClaimStatus } from '../business.enums';
import type { BusinessClaimEvidenceItem } from '../business-claim-evidence';

export interface NewBusinessClaim {
  placeId: string;
  requesterId: string;
  evidence: BusinessClaimEvidenceItem[];
}

export interface ListBusinessClaimsParams {
  status?: ClaimStatus;
  placeId?: string;
  limit: number;
  offset: number;
}

export interface DecideBusinessClaim {
  status: ClaimStatus;
  reviewerId: string;
  reasonCode: ClaimReasonCode | null;
  decisionNote: string | null;
  decidedAt: Date;
}

// Repository `business_claims` (ADR-015 §2, business.md §2/§6). Cùng nguyên tắc
// `ModerationCasesRepository`/`BookingsRepository`: repository KHÔNG tự suy luận nghiệp vụ (FSM,
// xung đột owner) — chỉ primitive lưu trữ. Service (BusinessClaimsService) quyết định transition
// và truyền status ĐÃ xác nhận hợp lệ.
@Injectable()
export class BusinessClaimsRepository {
  constructor(
    @InjectRepository(BusinessClaim)
    private readonly repo: Repository<BusinessClaim>,
  ) {}

  findById(id: string): Promise<BusinessClaim | null> {
    return this.repo.findOne({ where: { id } });
  }

  /**
   * Khoá đúng một dòng claim (`SELECT ... FOR UPDATE`) trước khi quyết định — cùng cơ chế
   * `ModerationCasesRepository.findByIdForUpdate()` (T2). Chốt chặn concurrency cho decide()/withdraw().
   */
  findByIdForUpdate(manager: EntityManager, id: string): Promise<BusinessClaim | null> {
    return manager
      .getRepository(BusinessClaim)
      .createQueryBuilder('c')
      .setLock('pessimistic_write')
      .where('c.id = :id', { id })
      .getOne();
  }

  /**
   * Tạo claim `pending` mới, AN TOÀN theo `uq_claim_pending` (place_id, requester_id) WHERE
   * status='pending' — cùng kỹ thuật `ModerationCasesRepository.createOpenCase()` (`ON CONFLICT ...
   * DO NOTHING`). Trả `null` khi requester đã có claim pending cho đúng place này — caller (service)
   * diễn giải `null` thành 409, KHÔNG coi là lỗi.
   */
  async createPending(data: NewBusinessClaim): Promise<BusinessClaim | null> {
    const rows: Array<{ id: string }> = await this.repo.query(
      `INSERT INTO business_claims (place_id, requester_id, evidence, status)
       VALUES ($1, $2, $3, 'pending')
       ON CONFLICT (place_id, requester_id) WHERE status = 'pending' DO NOTHING
       RETURNING id`,
      [data.placeId, data.requesterId, JSON.stringify(data.evidence)],
    );
    if (rows.length === 0) {
      return null;
    }
    return this.findById(rows[0].id);
  }

  /**
   * Hàng đợi moderator (business.md §6 "Hàng đợi claim chờ duyệt" — `ORDER BY created_at`).
   * Bỏ trống `status` -> mặc định `pending` (đúng nghĩa "hàng đợi", service quyết định mặc định
   * này — repository không tự chọn, cùng nguyên tắc `ModerationCasesRepository.list()`).
   * `id ASC` tie-break cho phân trang xác định (GAP-12).
   */
  async list(params: ListBusinessClaimsParams): Promise<{ items: BusinessClaim[]; total: number }> {
    const qb = this.repo.createQueryBuilder('c');
    if (params.status) {
      qb.andWhere('c.status = :status', { status: params.status });
    }
    if (params.placeId) {
      qb.andWhere('c.placeId = :placeId', { placeId: params.placeId });
    }

    const total = await qb.getCount();
    const items = await qb
      .orderBy('c.createdAt', 'ASC')
      .addOrderBy('c.id', 'ASC')
      .skip(params.offset)
      .take(params.limit)
      .getMany();

    return { items, total };
  }

  /**
   * Ghi kết luận ĐÃ ĐƯỢC XÁC NHẬN hợp lệ bởi FSM (`assertValidClaimTransition`) — repository KHÔNG
   * tự kiểm tra transition, cùng nguyên tắc `ModerationCasesRepository.resolve()`. PHẢI chạy trong
   * transaction của caller (`manager`) — không có overload không-transaction, vì mọi quyết định
   * claim đều cần khoá dòng trước (không có call site hợp lệ nào ngoài transaction).
   */
  async updateDecision(manager: EntityManager, id: string, data: DecideBusinessClaim): Promise<void> {
    await manager.getRepository(BusinessClaim).update(
      { id },
      {
        status: data.status,
        reviewerId: data.reviewerId,
        reasonCode: data.reasonCode,
        decisionNote: data.decisionNote,
        decidedAt: data.decidedAt,
      },
    );
  }

  /** Requester tự rút claim `pending` — không có reviewer/reason (business.md §4: actor=requester). */
  async updateWithdrawn(manager: EntityManager, id: string): Promise<void> {
    await manager.getRepository(BusinessClaim).update({ id }, { status: ClaimStatus.WITHDRAWN });
  }
}
