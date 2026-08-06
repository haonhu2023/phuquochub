import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { BusinessMembersRepository } from './repositories/business-members.repository';
import { UsersRepository } from '../users/repositories/users.repository';
import { RolesRepository } from '../rbac/repositories/roles.repository';
import { UserRolesRepository } from '../rbac/repositories/user-roles.repository';
import { ScopeType } from '../rbac/rbac.enums';
import { AuditService } from '../../core/audit/audit.service';
import { AuditResult } from '../../core/audit/audit.enums';
import { BusinessMember } from './entities/business-member.entity';
import { toBusinessMemberResponse, type BusinessMemberResponse } from './business-member.mapper';

const BUSINESS_OWNER_ROLE_CODE = 'business_owner';

interface TransferOutcome {
  newMembership: BusinessMember;
  oldMembershipId: string;
  oldUserRoleId: string | null;
  newUserRoleId: string;
}

// BusinessTransferService — UC-B7 (business.md §5, product/business.md UC-B7). Actor authorization
// ĐÃ được PermissionsGuard + @AuthorizationContext (ADR-019, `Business.Transfer.Managed` — CÓ hậu
// tố scope, Owner Decision 2) xác nhận TRƯỚC KHI transfer() chạy: actor phải giữ grant Managed mà
// `business_id` khớp ĐÚNG `placeId` route. Bước "verify actor is that owner" bên dưới (Owner
// Decision 4, bước tường minh trong danh sách transaction) là một xác nhận BỔ SUNG đối chiếu với
// `business_members` — sổ sở hữu nghiệp vụ (rbac.md) — KHÔNG phải một cơ chế phân quyền song song:
// nó xác nhận đúng cùng một sự thật mà ADR-019 đã gác, lần này từ góc nhìn của bảng ghi chép
// nghiệp vụ thay vì bảng cấp quyền, phòng trường hợp hai bảng lệch nhau (không có gì cưỡng chế
// đồng bộ giữa chúng ngoài kỷ luật ứng dụng).
//
// Owner Decision 1: KHÔNG bảng `business_transfers` mới — tái dùng mô hình sẵn có (revoke owner cũ
// + insert owner mới trên `business_members`, đồng bộ `user_roles`), ghi lại đầy đủ trong
// `audit_logs`. Owner Decision 3: hành động trực tiếp của owner hiện tại, KHÔNG qua moderator,
// KHÔNG bước chấp thuận từ owner mới, có hiệu lực NGAY sau khi transaction commit. Manager giữ
// nguyên — transfer KHÔNG đụng tới bất kỳ dòng `business_members(role='manager')` nào.
@Injectable()
export class BusinessTransferService {
  constructor(
    private readonly membersRepo: BusinessMembersRepository,
    private readonly usersRepo: UsersRepository,
    private readonly rolesRepo: RolesRepository,
    private readonly userRolesRepo: UserRolesRepository,
    private readonly audit: AuditService,
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  /** POST /business/{placeId}/transfer. */
  async transfer(
    placeId: string,
    newOwnerUserId: string,
    actorId: string,
    reason: string | undefined,
  ): Promise<BusinessMemberResponse> {
    const outcome = await this.dataSource.transaction<TransferOutcome>(async (manager) => {
      // Bước 1 — khoá + đọc owner hiệu lực hiện tại của cơ sở.
      const currentOwner = await this.membersRepo.findActiveOwnerForUpdate(manager, placeId);
      if (!currentOwner) {
        // Không thể xảy ra qua HTTP thật (ADR-019 đã đòi actor giữ grant Managed business_owner
        // cho ĐÚNG placeId này, tức business_members phải có owner hiệu lực) — fail-safe nếu hai
        // bảng lệch nhau, KHÔNG bao giờ coi là "không có gì để chuyển".
        throw new NotFoundException('Cơ sở chưa có owner hiệu lực.');
      }

      // Bước 2 — xác nhận actor CHÍNH LÀ owner hiệu lực đó (đối chiếu sổ sở hữu nghiệp vụ).
      if (currentOwner.userId !== actorId) {
        throw new ForbiddenException('Chỉ owner hiệu lực của cơ sở mới được chuyển nhượng.');
      }

      // Bước 3 — xác nhận target user tồn tại (TRONG transaction, Owner Decision 4).
      const targetUser = await this.usersRepo.findById(newOwnerUserId, manager);
      if (!targetUser) {
        throw new NotFoundException('Không tìm thấy user nhận chuyển nhượng.');
      }

      // Bước 4 — xác nhận target CHƯA là owner hiệu lực (transfer cho chính mình = vô nghĩa).
      if (currentOwner.userId === newOwnerUserId) {
        throw new ConflictException('User này đã là owner hiệu lực của cơ sở.');
      }
      // Mở rộng cần thiết ngoài danh sách Owner (BR-B2/uq_member_active): target KHÔNG được có bất
      // kỳ vai trò hiệu lực nào khác (vd đang là manager) — nếu không, INSERT owner mới ở bước 7 sẽ
      // vi phạm `uq_member_active` (place_id,user_id) WHERE revoked_at IS NULL thô, thay vì một 409
      // rõ ràng. "Managers giữ nguyên" (Owner Decision 3) nghĩa là transfer KHÔNG được ngầm định
      // thu hồi vai trò manager của target để "thăng chức" họ — nếu target đang là manager, chủ cũ
      // phải tự thu hồi vai trò manager đó trước (qua BusinessManagersService) rồi mới transfer.
      const targetExisting = await this.membersRepo.findActiveMembershipForUpdate(manager, placeId, newOwnerUserId);
      if (targetExisting) {
        throw new ConflictException(
          'User nhận chuyển nhượng đang có vai trò hiệu lực khác (vd manager) tại cơ sở này — thu hồi vai trò đó trước.',
        );
      }

      const ownerRole = await this.rolesRepo.findByCode(BUSINESS_OWNER_ROLE_CODE);
      if (!ownerRole) {
        throw new Error(`Role '${BUSINESS_OWNER_ROLE_CODE}' không tồn tại (SeedRbac chưa chạy?).`);
      }

      // Đọc id của grant CŨ trước khi thu hồi — chỉ để ghi audit "old scoped role grant/revoke
      // result" đầy đủ; không ảnh hưởng quyết định.
      const oldGrant = await this.userRolesRepo.findActive(actorId, ownerRole.id, placeId, manager);

      // Bước 5 — thu hồi owner-membership cũ.
      await this.membersRepo.revokeMembership(manager, currentOwner.id);
      // Bước 6 — thu hồi scoped business_owner role CŨ, CHỈ tại cơ sở này (businessId tường minh —
      // không đụng grant business_owner của actor ở cơ sở khác, nếu multi-branch phát sinh sau này).
      await this.userRolesRepo.revoke(actorId, ownerRole.id, placeId, manager);

      // Bước 7 — tạo owner-membership mới. claim_id = null (không phát sinh từ claim, giống manager).
      const newMembership = await this.membersRepo.createOwner(manager, {
        placeId,
        userId: newOwnerUserId,
        claimId: null,
        grantedBy: actorId,
      });
      // Bước 8 — gán scoped business_owner role mới.
      const newGrant = await this.userRolesRepo.assign(
        {
          userId: newOwnerUserId,
          roleId: ownerRole.id,
          scopeType: ScopeType.MANAGED,
          businessId: placeId,
          grantedBy: actorId,
        },
        manager,
      );

      return {
        newMembership,
        oldMembershipId: currentOwner.id,
        oldUserRoleId: oldGrant?.id ?? null,
        newUserRoleId: newGrant.id,
      };
    });

    // Bước 9 — audit CHỈ SAU khi transaction commit (cùng nguyên tắc INV-9 mọi service khác).
    await this.audit.record({
      event: 'business.ownership_transferred',
      entityType: 'business_member',
      entityId: outcome.newMembership.id,
      actorId,
      result: AuditResult.SUCCESS,
      context: {
        business_id: placeId,
        from_user_id: actorId,
        to_user_id: newOwnerUserId,
        initiated_by: actorId,
        reason: reason ?? null,
        old_membership_id: outcome.oldMembershipId,
        new_membership_id: outcome.newMembership.id,
        old_user_role_id: outcome.oldUserRoleId,
        old_user_role_revoked: true,
        new_user_role_id: outcome.newUserRoleId,
      },
    });

    return toBusinessMemberResponse(outcome.newMembership);
  }
}
