import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, IsNull, Repository } from 'typeorm';
import { BusinessMember } from '../entities/business-member.entity';
import { MemberRole } from '../business.enums';

export interface NewOwnerMembership {
  placeId: string;
  userId: string;
  /** `null` cho owner phát sinh từ transfer (không có claim gốc) — chỉ claim-approval mới có claim_id thật. */
  claimId: string | null;
  grantedBy: string;
}

export interface NewManagerMembership {
  placeId: string;
  userId: string;
  grantedBy: string;
}

export interface ActiveManagerRow {
  userId: string;
  displayName: string;
  email: string;
  grantedAt: Date;
}

// Repository `business_members` (ADR-015 §3, business.md §3). Business Manager Assignment/
// Revocation milestone bổ sung: đọc/khoá MỘT thành viên hiệu lực (owner HOẶC manager) của
// (place,user) — dùng để chặn gán trùng (uq_member_active) và để xác nhận đúng dòng cần thu hồi —
// và tạo/thu hồi dòng manager. Business Ownership Transfer milestone tái dùng NGUYÊN VẸN
// `findActiveOwnerForUpdate`/`findActiveMembershipForUpdate`/`createOwner`/`revokeMembership` —
// không thêm method mới (chỉ `NewOwnerMembership.claimId` nới thành `string | null` cho owner phát
// sinh từ transfer).
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

  /**
   * Khoá dòng thành viên hiệu lực (owner HOẶC manager, KHÔNG lọc role) của một (place,user) TRONG
   * transaction gán/thu hồi manager — cùng cơ chế `findActiveOwnerForUpdate` nhưng không ràng buộc
   * role: `assign()` cần biết CÓ bất kỳ vai trò hiệu lực nào đã tồn tại chưa (chặn trùng theo
   * `uq_member_active`, kể cả trường hợp target đã là owner); `revoke()` cần khoá đúng dòng cần
   * thu hồi trước khi ghi.
   */
  findActiveMembershipForUpdate(
    manager: EntityManager,
    placeId: string,
    userId: string,
  ): Promise<BusinessMember | null> {
    return manager
      .getRepository(BusinessMember)
      .createQueryBuilder('m')
      .setLock('pessimistic_write')
      .where('m.placeId = :placeId', { placeId })
      .andWhere('m.userId = :userId', { userId })
      .andWhere('m.revokedAt IS NULL')
      .getOne();
  }

  /**
   * Tạo dòng manager-membership. `claim_id` LUÔN `null` — manager không phát sinh từ claim (chỉ
   * owner mới có nguồn gốc claim, business.md §3). PHẢI chạy trong transaction của caller.
   */
  async createManager(manager: EntityManager, data: NewManagerMembership): Promise<BusinessMember> {
    const repo = manager.getRepository(BusinessMember);
    const member = repo.create({
      placeId: data.placeId,
      userId: data.userId,
      role: MemberRole.MANAGER,
      claimId: null,
      grantedBy: data.grantedBy,
    });
    return repo.save(member);
  }

  /** Thu hồi (soft) một dòng membership theo id — ĐÃ được caller xác nhận đúng dòng/đúng role. */
  async revokeMembership(manager: EntityManager, id: string): Promise<void> {
    await manager.getRepository(BusinessMember).update({ id }, { revokedAt: new Date() });
  }

  /**
   * GET /business/{id}/managers — manager HIỆU LỰC (role='manager', revoked_at IS NULL) của một
   * cơ sở, kèm thông tin hiển thị tối thiểu từ `users` (join). CHỈ manager, KHÔNG owner — trang
   * "Quản lý người quản lý" không cần liệt chính owner đang xem nó (business-managers.controller.ts
   * đã tách bạch: DELETE ở đây từ chối target=owner, BR-B6).
   *
   * `.select([...])` liệt kê CHÍNH XÁC cột an toàn — `users.password_hash` KHÔNG bao giờ được nạp
   * ở đường này (cùng nguyên tắc chốt chặn kép đã dùng cho `BusinessClaimsRepository.
   * listByRequester()`). `m.id` có trong select CHỈ để làm tie-break `ORDER BY` xác định, KHÔNG lộ
   * ra response (mapper không dùng field này).
   */
  async listActiveManagers(placeId: string): Promise<ActiveManagerRow[]> {
    const rows = await this.repo
      .createQueryBuilder('m')
      .innerJoin('m.user', 'u')
      .where('m.placeId = :placeId', { placeId })
      .andWhere('m.role = :role', { role: MemberRole.MANAGER })
      .andWhere('m.revokedAt IS NULL')
      .select(['m.id', 'm.userId', 'm.grantedAt'])
      .addSelect(['u.id', 'u.email', 'u.displayName'])
      .orderBy('m.grantedAt', 'ASC')
      .addOrderBy('m.id', 'ASC')
      .getMany();

    return rows.map((r) => ({
      userId: r.userId,
      displayName: r.user.displayName,
      email: r.user.email,
      grantedAt: r.grantedAt,
    }));
  }
}
