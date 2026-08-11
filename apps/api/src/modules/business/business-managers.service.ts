import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { BusinessMembersRepository } from './repositories/business-members.repository';
import { UsersRepository } from '../users/repositories/users.repository';
import { RolesRepository } from '../rbac/repositories/roles.repository';
import { UserRolesRepository } from '../rbac/repositories/user-roles.repository';
import { ScopeType } from '../rbac/rbac.enums';
import { MemberRole } from './business.enums';
import { AuditService } from '../../core/audit/audit.service';
import { AuditResult } from '../../core/audit/audit.enums';
import { BusinessMember } from './entities/business-member.entity';
import {
  toBusinessMemberResponse,
  toBusinessManagerListItem,
  type BusinessMemberResponse,
  type BusinessManagerListItem,
} from './business-member.mapper';

const BUSINESS_MANAGER_ROLE_CODE = 'business_manager';

// BusinessManagersService — UC-B6 (business.md §5 "Ủy quyền nhân sự"). Actor authorization ĐÃ được
// PermissionsGuard + @AuthorizationContext (ADR-019, Business.Manager.Assign.Managed/
// Revoke.Managed — CÓ hậu tố scope) xác nhận TRƯỚC KHI hai method dưới đây chạy: actor phải giữ
// một grant Managed mà `business_id` khớp ĐÚNG `placeId` của route — tức actor chính là owner hiệu
// lực của cơ sở đó (chỉ `business_owner` được seed hai permission này). KHÔNG có kiểm tra "actor
// có phải owner không" lặp lại ở đây — Owner Decision 5: dùng ĐÚNG đường Managed sẵn có, không xây
// cơ chế song song.
@Injectable()
export class BusinessManagersService {
  constructor(
    private readonly membersRepo: BusinessMembersRepository,
    private readonly usersRepo: UsersRepository,
    private readonly rolesRepo: RolesRepository,
    private readonly userRolesRepo: UserRolesRepository,
    private readonly audit: AuditService,
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  /** POST /business/{placeId}/managers. */
  async assign(placeId: string, targetUserId: string, actorId: string): Promise<BusinessMemberResponse> {
    const targetUser = await this.usersRepo.findById(targetUserId);
    if (!targetUser) {
      throw new NotFoundException('Không tìm thấy user cần gán làm manager');
    }

    const result = await this.dataSource.transaction<BusinessMember>(async (manager) => {
      // Khoá + kiểm tra KHÔNG có vai trò hiệu lực nào (owner HOẶC manager) đã tồn tại cho user này
      // tại cơ sở này — chặn trùng theo `uq_member_active` với một 409 rõ ràng thay vì để lộ
      // unique-violation thô. Bao trùm CẢ trường hợp target đã là owner của chính cơ sở này.
      const existing = await this.membersRepo.findActiveMembershipForUpdate(manager, placeId, targetUserId);
      if (existing) {
        throw new ConflictException('User đã có vai trò hiệu lực (owner hoặc manager) tại cơ sở này.');
      }

      const created = await this.membersRepo.createManager(manager, {
        placeId,
        userId: targetUserId,
        grantedBy: actorId,
      });

      const managerRole = await this.rolesRepo.findByCode(BUSINESS_MANAGER_ROLE_CODE);
      if (!managerRole) {
        throw new Error(`Role '${BUSINESS_MANAGER_ROLE_CODE}' không tồn tại (SeedRbac chưa chạy?).`);
      }
      await this.userRolesRepo.assign(
        {
          userId: targetUserId,
          roleId: managerRole.id,
          scopeType: ScopeType.MANAGED,
          businessId: placeId,
          grantedBy: actorId,
        },
        manager,
      );

      return created;
    });

    await this.audit.record({
      event: 'business.manager_assigned',
      entityType: 'business_member',
      entityId: result.id,
      actorId,
      result: AuditResult.SUCCESS,
      after: { place_id: placeId, user_id: targetUserId, role: MemberRole.MANAGER },
    });

    return toBusinessMemberResponse(result);
  }

  /**
   * GET /business/{placeId}/managers. Actor authorization ĐÃ được PermissionsGuard +
   * `@AuthorizationContext` xác nhận TRƯỚC (cùng `Business.Manager.Assign.Managed` — chỉ
   * `business_owner` giữ, xem chú thích đầu class) — service chỉ đọc, KHÔNG kiểm tra owner lần hai.
   * CHỈ manager hiệu lực (không owner, không revoked) — xem
   * `BusinessMembersRepository.listActiveManagers()`.
   */
  async listManagers(placeId: string): Promise<BusinessManagerListItem[]> {
    const rows = await this.membersRepo.listActiveManagers(placeId);
    return rows.map(toBusinessManagerListItem);
  }

  /**
   * GET /business/{placeId}/managers/lookup?email=... — tra `user_id` từ email CHÍNH XÁC để điền
   * vào form gán manager (Phase 4 quyết định B, xem `dto/business-manager.dto.ts`
   * `LookupBusinessUserQueryDto`). `placeId` KHÔNG lọc dữ liệu ở đây (tra cứu user vốn không có
   * khái niệm "thuộc về một cơ sở") — nó chỉ tồn tại trên route để tái dùng ĐÚNG
   * `@AuthorizationContext` mà assign/revoke đã có, giữ CÙNG một cổng phân quyền (chỉ owner hiệu
   * lực của ĐÚNG cơ sở `id` mới gọi được).
   */
  async lookupUserByEmail(email: string): Promise<{ user_id: string; display_name: string }> {
    const user = await this.usersRepo.findByEmail(email);
    if (!user) {
      throw new NotFoundException('Không tìm thấy người dùng với email này.');
    }
    return { user_id: user.id, display_name: user.displayName };
  }

  /** DELETE /business/{placeId}/managers/{userId}. */
  async revoke(placeId: string, targetUserId: string, actorId: string): Promise<void> {
    const result = await this.dataSource.transaction<BusinessMember>(async (manager) => {
      const membership = await this.membersRepo.findActiveMembershipForUpdate(manager, placeId, targetUserId);
      // BR-B6: endpoint này CHỈ thu hồi manager — KHÔNG thể dùng để gỡ owner (gỡ owner là
      // Ownership Transfer, `BusinessTransferService`, một luồng riêng với transaction khác hẳn).
      // Không tìm thấy HOẶC tìm thấy nhưng là owner -> 404 đồng nhất (không tiết lộ "có owner
      // nhưng bạn không được đụng vào" so với "không có gì cả").
      if (!membership || membership.role !== MemberRole.MANAGER) {
        throw new NotFoundException('Không tìm thấy manager hiệu lực tại cơ sở này.');
      }

      await this.membersRepo.revokeMembership(manager, membership.id);

      const managerRole = await this.rolesRepo.findByCode(BUSINESS_MANAGER_ROLE_CODE);
      if (!managerRole) {
        throw new Error(`Role '${BUSINESS_MANAGER_ROLE_CODE}' không tồn tại (SeedRbac chưa chạy?).`);
      }
      // businessId truyền TƯỜNG MINH — chỉ thu hồi đúng grant tại cơ sở này, KHÔNG đụng grant
      // business_manager của user đó ở cơ sở khác (nếu có).
      await this.userRolesRepo.revoke(targetUserId, managerRole.id, placeId, manager);

      return membership;
    });

    await this.audit.record({
      event: 'business.manager_revoked',
      entityType: 'business_member',
      entityId: result.id,
      actorId,
      result: AuditResult.SUCCESS,
      after: { place_id: placeId, user_id: targetUserId },
    });
  }
}
