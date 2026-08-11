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

export interface ListByRequesterParams {
  requesterId: string;
  limit: number;
}

/**
 * Hàng moderator-facing cho GET /business-claims (hàng đợi duyệt claim). Bổ sung ĐÚNG ba trường
 * định danh người-đọc-được so với cột thô của `business_claims`: `placeName`/`placeSlug` (join
 * `places`) và `requesterDisplayName` (join `users`).
 *
 * LÝ DO cần join, không phải tiện nghi: hàng đợi chỉ có `place_id`/`requester_id` dạng UUID, mà API
 * công khai KHÔNG có route tra place theo UUID (`PlacesController` chỉ có `@Get(':slug')`) — không
 * có join này thì màn hình duyệt claim không thể hiển thị "đang duyệt cơ sở NÀO, do AI yêu cầu".
 * Cùng kỹ thuật `listByRequester()` bên dưới đã dùng (innerJoin + `.withDeleted()`).
 *
 * `evidence` CỐ Ý KHÔNG được nạp ở đường này (`.select()` không liệt kê): hàng đợi không hiển thị
 * bằng chứng — nó chỉ lộ ở `GET /business-claims/{id}` (business.md §2 "riêng tư, chỉ Moderator").
 * Không nạp JSONB evidence cho mỗi dòng cũng tránh kéo dữ liệu nặng không dùng tới.
 *
 * `requesterDisplayName` là danh tính TỐI THIỂU đủ để moderator phân biệt hai người cùng đòi một cơ
 * sở (nhánh `disputed`). Email KHÔNG có ở đây — hẹp hơn cả tiền lệ `BusinessManagerListItem`
 * (lộ cả display_name lẫn email cho CHỦ cơ sở); moderator cần nhận diện, không cần liên hệ trực
 * tiếp (thông tin liên hệ, nếu có, nằm trong chính `evidence`).
 */
export interface ModeratorBusinessClaimRow {
  id: string;
  placeId: string;
  placeName: string;
  placeSlug: string;
  requesterId: string;
  requesterDisplayName: string;
  status: ClaimStatus;
  reviewerId: string | null;
  reasonCode: ClaimReasonCode | null;
  decisionNote: string | null;
  decidedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Hàng requester-safe cho GET /business-claims/mine — CỐ Ý không có `evidence`/`reviewerId`/
 * `decisionNote` (business.md §2 "riêng tư, chỉ Moderator" cho evidence; `decisionNote` là ghi chú
 * tự do của moderator, không có bảo đảm nào trong schema hiện tại rằng nó an toàn cho requester đọc
 * — xem business-claims.service.ts `listMine()`). `reasonCode` là enum có kiểm soát (KHÔNG phải văn
 * bản tự do), đủ an toàn để giải thích lý do rejected cho chính requester.
 */
export interface OwnBusinessClaimRow {
  id: string;
  placeId: string;
  placeName: string;
  placeSlug: string;
  status: ClaimStatus;
  reasonCode: ClaimReasonCode | null;
  decidedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
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
  async list(params: ListBusinessClaimsParams): Promise<{ items: ModeratorBusinessClaimRow[]; total: number }> {
    // innerJoin + `.withDeleted()`: `place_id`/`requester_id` đều NOT NULL nên mọi claim LUÔN có đủ
    // hai đầu; `withDeleted()` giữ claim hiển thị được cả khi place đã bị lưu trữ (soft delete) SAU
    // khi claim được tạo — hàng đợi/lịch sử duyệt không nên biến mất vì lý do đó. `users` không có
    // soft delete nên join requester không chịu ảnh hưởng của cờ này.
    const qb = this.repo
      .createQueryBuilder('c')
      .innerJoin('c.place', 'place')
      .innerJoin('c.requester', 'requester')
      .withDeleted();
    if (params.status) {
      qb.andWhere('c.status = :status', { status: params.status });
    }
    if (params.placeId) {
      qb.andWhere('c.placeId = :placeId', { placeId: params.placeId });
    }

    const total = await qb.getCount();
    const rows = await qb
      .select([
        'c.id',
        'c.placeId',
        'c.requesterId',
        'c.status',
        'c.reviewerId',
        'c.reasonCode',
        'c.decisionNote',
        'c.decidedAt',
        'c.createdAt',
        'c.updatedAt',
      ])
      .addSelect(['place.id', 'place.name', 'place.slug', 'requester.id', 'requester.displayName'])
      .orderBy('c.createdAt', 'ASC')
      .addOrderBy('c.id', 'ASC')
      .skip(params.offset)
      .take(params.limit)
      .getMany();

    return {
      items: rows.map((r) => ({
        id: r.id,
        placeId: r.placeId,
        placeName: r.place.name,
        placeSlug: r.place.slug,
        requesterId: r.requesterId,
        requesterDisplayName: r.requester.displayName,
        status: r.status,
        reviewerId: r.reviewerId,
        reasonCode: r.reasonCode,
        decisionNote: r.decisionNote,
        decidedAt: r.decidedAt,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
      })),
      total,
    };
  }

  /**
   * GET /business-claims/{id} (moderator detail) — CÙNG claim như `findById()` nhưng kèm `place` và
   * `requester` để response detail hiển thị tên cơ sở/người yêu cầu thay vì UUID trần.
   *
   * TÁCH RIÊNG khỏi `findById()` có chủ đích: `findById()` phục vụ đường ghi (`submit()` đọc lại
   * dòng vừa tạo) — thêm hai join vào đó là trả giá truy vấn cho mọi caller chỉ cần cột thô.
   * `withDeleted()` cùng lý do như `list()` (place có thể đã bị lưu trữ sau khi claim được tạo).
   */
  findByIdWithRelations(id: string): Promise<BusinessClaim | null> {
    return this.repo.findOne({
      where: { id },
      relations: { place: true, requester: true },
      withDeleted: true,
    });
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

  /**
   * GET /business-claims/mine — claim CỦA CHÍNH requester đang gọi. `requesterId` LUÔN đến từ JWT
   * (service/controller), KHÔNG bao giờ từ query/path/body — lọc CSDL trực tiếp trên cột
   * `requester_id`, không tái dùng `list()` (hàng đợi moderator) rồi lọc ở tầng ứng dụng.
   *
   * `.select([...])` liệt kê CHÍNH XÁC các cột an toàn — `evidence`/`reviewer_id`/`decision_note`
   * KHÔNG bao giờ được nạp vào bộ nhớ ở đường này, kể cả khi mapper phía service có lỗi bỏ sót
   * field nào đó sau này (chốt chặn kép ở tầng CSDL, không chỉ ở response mapper).
   *
   * `innerJoin` (không phải leftJoin): `place_id` NOT NULL + FK CASCADE — mọi claim LUÔN có đúng
   * một place. `.withDeleted()` giữ tên/slug hiển thị được ngay cả khi place đã bị archive (soft
   * delete, `deleted_at`) SAU khi claim được approve — lịch sử claim của requester không nên biến
   * mất chỉ vì place sau đó bị lưu trữ.
   *
   * Không phân trang (page/limit) như `list()` moderator — cùng tiền lệ `PlacesService.listMine()`
   * (GET /places/mine, mảng phẳng không phân trang): khối lượng claim/một requester luôn nhỏ (tối đa
   * một `pending` mỗi place tại một thời điểm, `uq_claim_pending`). `take(limit)` là CHẶN TRÊN
   * phòng thủ (chống phình dữ liệu bất thường), không phải UI phân trang thật.
   */
  async listByRequester(params: ListByRequesterParams): Promise<OwnBusinessClaimRow[]> {
    const rows = await this.repo
      .createQueryBuilder('c')
      .innerJoin('c.place', 'place')
      .withDeleted()
      .where('c.requesterId = :requesterId', { requesterId: params.requesterId })
      .select(['c.id', 'c.placeId', 'c.status', 'c.reasonCode', 'c.decidedAt', 'c.createdAt', 'c.updatedAt'])
      .addSelect(['place.id', 'place.name', 'place.slug'])
      .orderBy('c.createdAt', 'DESC')
      .addOrderBy('c.id', 'DESC')
      .take(params.limit)
      .getMany();

    return rows.map((r) => ({
      id: r.id,
      placeId: r.placeId,
      placeName: r.place.name,
      placeSlug: r.place.slug,
      status: r.status,
      reasonCode: r.reasonCode,
      decidedAt: r.decidedAt,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    }));
  }
}
