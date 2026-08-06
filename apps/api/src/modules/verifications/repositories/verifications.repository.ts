import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, IsNull, Repository } from 'typeorm';
import { Verification } from '../entities/verification.entity';
import { VerificationMethod } from '../verification.enums';
import { VerificationStatus } from '../../places/place.enums';

export interface NewVerification {
  placeId: string | null;
  contactId: string | null;
  priceHistoryId: string | null;
  method: VerificationMethod;
  createdBy: string | null;
  note?: string | null;
}

export interface VerificationListFilters {
  status?: VerificationStatus;
  assignedTo?: string | null;
  limit: number;
  offset: number;
}

// Repository `verifications` (ADR-008 §4). KHÔNG dùng `FOR UPDATE` — mọi transition đi qua
// `casUpdate()` (compare-and-set trên `lockVersion`, §5C) thay vì khoá dòng, để ba tác nhân song
// song (moderator/job cộng đồng/job hết hạn) không chặn lẫn nhau — thua cuộc thì đọc lại & thử lại
// (hoặc trả lỗi cho actor người quyết định, xem VerificationsService).
@Injectable()
export class VerificationsRepository {
  constructor(
    @InjectRepository(Verification)
    private readonly repo: Repository<Verification>,
  ) {}

  findById(id: string, manager?: EntityManager): Promise<Verification | null> {
    const repo = manager ? manager.getRepository(Verification) : this.repo;
    return repo.findOne({ where: { id } });
  }

  /** Dòng hiện hành (BẤT KỲ trạng thái nào) của một target — exclusive arc, đúng một cột khác NULL. */
  findActiveByTarget(
    target: { placeId?: string; contactId?: string; priceHistoryId?: string },
    manager?: EntityManager,
  ): Promise<Verification | null> {
    const repo = manager ? manager.getRepository(Verification) : this.repo;
    return repo.findOne({
      where: {
        placeId: target.placeId ?? IsNull(),
        contactId: target.contactId ?? IsNull(),
        priceHistoryId: target.priceHistoryId ?? IsNull(),
      },
    });
  }

  async create(data: NewVerification, manager?: EntityManager): Promise<Verification> {
    const repo = manager ? manager.getRepository(Verification) : this.repo;
    const entity = repo.create({
      placeId: data.placeId,
      contactId: data.contactId,
      priceHistoryId: data.priceHistoryId,
      status: VerificationStatus.PENDING,
      method: data.method,
      createdBy: data.createdBy,
      note: data.note ?? null,
      lockVersion: 0,
    });
    return repo.save(entity);
  }

  /**
   * Compare-and-set (§5C) — `UPDATE ... WHERE id=:id AND lock_version=:expected`, tăng
   * `lock_version` lên 1. Trả về `true` nếu cập nhật đúng 1 dòng (thành công), `false` nếu 0 dòng
   * (một tác nhân khác đã thay đổi dòng này trước — CAS thua, caller quyết định retry/báo lỗi).
   */
  async casUpdate(
    id: string,
    expectedLockVersion: number,
    patch: Record<string, unknown>,
    manager?: EntityManager,
  ): Promise<boolean> {
    const repo = manager ? manager.getRepository(Verification) : this.repo;
    const result = await repo
      .createQueryBuilder()
      .update(Verification)
      .set({ ...patch, lockVersion: expectedLockVersion + 1 })
      .where('id = :id AND lock_version = :expected', { id, expected: expectedLockVersion })
      .execute();
    return (result.affected ?? 0) === 1;
  }

  async list(filters: VerificationListFilters, manager?: EntityManager): Promise<{ items: Verification[]; total: number }> {
    const repo = manager ? manager.getRepository(Verification) : this.repo;
    const qb = repo.createQueryBuilder('v');
    if (filters.status) {
      qb.andWhere('v.status = :status', { status: filters.status });
    }
    if (filters.assignedTo !== undefined) {
      if (filters.assignedTo === null) {
        qb.andWhere('v.assigned_to IS NULL');
      } else {
        qb.andWhere('v.assigned_to = :assignedTo', { assignedTo: filters.assignedTo });
      }
    }
    qb.orderBy('v.priority', 'DESC').addOrderBy('v.created_at', 'ASC').skip(filters.offset).take(filters.limit);
    const [items, total] = await qb.getManyAndCount();
    return { items, total };
  }

  /**
   * VERIFICATION SCHEDULER — Operational Enablement (2026-08-06). Trang MỘT lô (keyset cursor)
   * của "hàng đợi hết hạn" (job hệ thống, §9) — dòng "tin cậy" đã quá `expires_at`. Thay thế
   * `listOverdueTrusted()` cũ (tải TOÀN BỘ tập kết quả vào bộ nhớ — PIR finding, "the expiry path
   * is unbounded"). Cùng khuôn keyset `MediaRepository.findOrphanCleanupCandidates()`: sắp xếp
   * `(expires_at, id)` — ổn định, xác định, không phụ thuộc OFFSET (OFFSET trôi khi có ghi xen giữa
   * hai trang). `expiresAtCursor` là chuỗi TEXT Postgres tự render (microsecond) — TUYỆT ĐỐI không
   * dùng `Date` JS cho cursor (mất độ chính xác dưới mili-giây, có thể khiến một dòng tự thoả lại
   * chính điều kiện `>` của nó và bị fetch lặp vô hạn — bài học đã ghi ở
   * `OrphanCleanupCandidate.cursorCreatedAt`, áp dụng y hệt ở đây).
   */
  async findOverdueTrustedBatch(
    now: Date,
    limit: number,
    after?: VerificationExpiryCursor,
    manager?: EntityManager,
  ): Promise<OverdueVerificationCandidate[]> {
    const repo = manager ? manager.getRepository(Verification) : this.repo;
    const params: unknown[] = after ? [now, limit, after.expiresAt, after.id] : [now, limit];
    const rows: Array<{
      id: string;
      status: VerificationStatus;
      lock_version: number;
      place_id: string | null;
      contact_id: string | null;
      price_history_id: string | null;
      expires_at: Date;
      expires_at_text: string;
    }> = await repo.query(
      `SELECT id, status, lock_version, place_id, contact_id, price_history_id,
              expires_at, expires_at::text AS expires_at_text
       FROM verifications
       WHERE status IN ('verified','official','community_verified')
         AND expires_at IS NOT NULL AND expires_at < $1
         ${after ? 'AND (expires_at, id) > ($3::timestamptz, $4)' : ''}
       ORDER BY expires_at ASC, id ASC
       LIMIT $2`,
      params,
    );
    return rows.map((r) => ({
      id: r.id,
      status: r.status,
      lockVersion: r.lock_version,
      placeId: r.place_id,
      contactId: r.contact_id,
      priceHistoryId: r.price_history_id,
      expiresAt: r.expires_at,
      expiresAtCursor: r.expires_at_text,
    }));
  }
}

export interface OverdueVerificationCandidate {
  id: string;
  status: VerificationStatus;
  lockVersion: number;
  placeId: string | null;
  contactId: string | null;
  priceHistoryId: string | null;
  expiresAt: Date;
  /** Postgres's own exact TEXT rendering of `expires_at` — cursor value ONLY, never for display. */
  expiresAtCursor: string;
}

export interface VerificationExpiryCursor {
  expiresAt: string;
  id: string;
}
