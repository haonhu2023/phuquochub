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

  /** Hàng đợi hết hạn (job hệ thống, §9) — mọi dòng "tin cậy" đã quá `expires_at`. */
  listOverdueTrusted(now: Date, manager?: EntityManager): Promise<Verification[]> {
    const repo = manager ? manager.getRepository(Verification) : this.repo;
    return repo
      .createQueryBuilder('v')
      .where('v.status IN (:...statuses)', {
        statuses: [VerificationStatus.VERIFIED, VerificationStatus.OFFICIAL, VerificationStatus.COMMUNITY_VERIFIED],
      })
      .andWhere('v.expires_at IS NOT NULL AND v.expires_at < :now', { now })
      .getMany();
  }
}
