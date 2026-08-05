import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, IsNull, Repository } from 'typeorm';
import { BusinessMember } from '../entities/business-member.entity';
import { MemberRole } from '../business.enums';

export interface NewOwnerMembership {
  placeId: string;
  userId: string;
  claimId: string;
  grantedBy: string;
}

// Repository `business_members` (ADR-015 §3, business.md §3). Phạm vi milestone này CHỈ cần tạo
// owner-membership khi claim approved + đọc owner hiệu lực để phát hiện xung đột (BR-B2) — gán/thu
// hồi manager, chuyển nhượng ngoài phạm vi (Owner exclusion list).
@Injectable()
export class BusinessMembersRepository {
  constructor(
    @InjectRepository(BusinessMember)
    private readonly repo: Repository<BusinessMember>,
  ) {}

  /** Owner hiệu lực của một cơ sở, nếu có (đọc thuần, không khoá — dùng cho hiển thị/kiểm tra nhanh). */
  findActiveOwner(placeId: string): Promise<BusinessMember | null> {
    return this.repo.findOne({ where: { placeId, role: MemberRole.OWNER, revokedAt: IsNull() } });
  }

  /**
   * Khoá dòng owner hiệu lực (nếu có) của một cơ sở TRONG transaction quyết định claim — chốt
   * chặn concurrency cho BR-B2 (đọc trước khi quyết định approve có tạo xung đột không). Không có
   * dòng nào khớp -> không khoá được gì (đúng ngữ nghĩa `SELECT ... FOR UPDATE` trên tập rỗng) —
   * `uq_member_owner` (partial unique, CSDL) là chốt chặn CUỐI CÙNG cho đúng race hai approval đầu
   * tiên đồng thời trên CÙNG cơ sở; xem `BusinessClaimsService.decide()` cho phần bắt lỗi 23505.
   */
  findActiveOwnerForUpdate(manager: EntityManager, placeId: string): Promise<BusinessMember | null> {
    return manager
      .getRepository(BusinessMember)
      .createQueryBuilder('m')
      .setLock('pessimistic_write')
      .where('m.placeId = :placeId', { placeId })
      .andWhere('m.role = :role', { role: MemberRole.OWNER })
      .andWhere('m.revokedAt IS NULL')
      .getOne();
  }

  /**
   * Tạo dòng owner-membership khi claim approved. `granted_by` = moderator ra quyết định (business.md
   * §3: "granted_by — Người cấp (Moderator cho owner...)"). PHẢI chạy trong transaction của caller.
   */
  async createOwner(manager: EntityManager, data: NewOwnerMembership): Promise<BusinessMember> {
    const repo = manager.getRepository(BusinessMember);
    const member = repo.create({
      placeId: data.placeId,
      userId: data.userId,
      role: MemberRole.OWNER,
      claimId: data.claimId,
      grantedBy: data.grantedBy,
    });
    return repo.save(member);
  }
}
