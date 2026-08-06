import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, FindOptionsWhere, IsNull, Repository } from 'typeorm';
import { UserRole } from '../entities/user-role.entity';
import { ScopeType } from '../rbac.enums';
import type { ScopedGrant } from '../../authz/scoped-grant';

interface ScopedGrantRow {
  scope_type: 'global' | 'managed' | 'own';
  business_id: string | null;
  code: string;
  effect: 'allow' | 'deny';
}

// Repository cho `user_roles` — gán/thu hồi vai trò (soft revoke), truy vấn role hiệu lực.
@Injectable()
export class UserRolesRepository {
  constructor(
    @InjectRepository(UserRole)
    private readonly repo: Repository<UserRole>,
  ) {}

  /** Role id đang hiệu lực (revoked_at IS NULL) của một principal. */
  async findActiveRoleIds(userId: string): Promise<string[]> {
    const rows = await this.repo.find({
      where: { userId, revokedAt: IsNull() },
      select: { roleId: true },
    });
    return rows.map((r) => r.roleId);
  }

  findActiveByUser(userId: string): Promise<UserRole[]> {
    return this.repo.find({ where: { userId, revokedAt: IsNull() }, relations: { role: true } });
  }

  /**
   * `manager` TUỲ CHỌN (ADR-015 Business Ownership Transfer) — đọc grant hiệu lực TRONG transaction
   * của caller trước khi thu hồi (transfer cần biết id của grant CŨ để ghi audit "old scoped role
   * grant/revoke result" trước khi nó biến mất). Bỏ trống dùng `this.repo` như trước.
   */
  async findActive(
    userId: string,
    roleId: string,
    businessId: string | null,
    manager?: EntityManager,
  ): Promise<UserRole | null> {
    const repo = manager ? manager.getRepository(UserRole) : this.repo;
    return repo.findOne({
      where: { userId, roleId, businessId: businessId ?? IsNull(), revokedAt: IsNull() },
    });
  }

  /**
   * `manager` TUỲ CHỌN (ADR-015 Claim Decision Workflow) — cùng quy ước `recalculateRating()`/
   * `PlacesRepository.updateScalars()`: truyền vào khi caller (BusinessClaimsService.decide())
   * cần gán role CÙNG transaction với business_claims/business_members/places; bỏ trống dùng
   * `this.repo` như trước (không phá vỡ lời gọi cũ nào ngoài transaction).
   */
  assign(
    params: {
      userId: string;
      roleId: string;
      scopeType?: ScopeType;
      businessId?: string | null;
      grantedBy?: string | null;
    },
    manager?: EntityManager,
  ): Promise<UserRole> {
    const repo = manager ? manager.getRepository(UserRole) : this.repo;
    const userRole = repo.create({
      userId: params.userId,
      roleId: params.roleId,
      scopeType: params.scopeType ?? ScopeType.GLOBAL,
      businessId: params.businessId ?? null,
      grantedBy: params.grantedBy ?? null,
    });
    return repo.save(userRole);
  }

  /**
   * Thu hồi (soft) bản gán đang hiệu lực của (user, role). `businessId` TUỲ CHỌN — bỏ trống (giữ
   * `undefined`) thu hồi MỌI dòng hiệu lực của (user, role) bất kể scope (hành vi CŨ, dùng cho
   * `UsersService.revokeRole()` — hành động admin "gỡ hẳn vai trò này khỏi user", không có khái
   * niệm business cụ thể). Truyền `businessId` tường minh (kể cả `null`) thu hồi ĐÚNG MỘT dòng
   * scope đó — bắt buộc cho revoke theo cơ sở cụ thể (vd Business.Manager.Revoke.Managed: một user
   * có thể là manager của NHIỀU cơ sở, thu hồi ở cơ sở A không được đụng tới cơ sở B).
   *
   * `manager` TUỲ CHỌN — cùng quy ước `assign()`: truyền vào khi caller cần chạy trong transaction
   * của họ; bỏ trống dùng `this.repo` như trước.
   */
  async revoke(
    userId: string,
    roleId: string,
    businessId?: string | null,
    manager?: EntityManager,
  ): Promise<void> {
    const repo = manager ? manager.getRepository(UserRole) : this.repo;
    const where: FindOptionsWhere<UserRole> = { userId, roleId, revokedAt: IsNull() };
    if (businessId !== undefined) {
      where.businessId = businessId ?? IsNull();
    }
    await repo.update(where, { revokedAt: new Date() });
  }

  /**
   * ADR-019 D12 (M0.1 — PDP Foundation). MỘT recursive CTE thay thế chuỗi 3 truy vấn cũ
   * (`findActiveRoleIds` → `RolesRepository.expandWithAncestors` → `getPermissionsForRoles`) —
   * chuỗi đó đánh mất `scope_type`/`business_id` ngay ở bước đầu, không cách nào truy ngược một
   * permission kế thừa qua DAG về đúng dòng `user_roles` đã sinh ra nó. Truy vấn dưới đây mang
   * scope của dòng GỐC đi xuyên suốt qua toàn bộ tổ tiên DAG.
   *
   * `seed`: neo trên MỌI dòng `user_roles` đang hiệu lực (`revoked_at IS NULL`) của user này — dùng
   * `idx_user_roles_user` sẵn có, không cần index mới.
   *
   * `expanded`: mở rộng qua `role_parents` bằng `UNION` (KHÔNG `UNION ALL`) — Postgres tự dừng đệ
   * quy khi một vòng lặp không sinh thêm dòng MỚI (so trùng toàn bộ cột), nên một DAG hình thoi
   * (vd `moderator` kế thừa CẢ `contributor` LẪN `local_guide`, cả hai cùng kế thừa `member`) không
   * nhân bản `member` — cùng cơ chế `RolesRepository.expandWithAncestors()` đã dùng, chỉ khác: ở
   * đây MỖI dòng mở rộng vẫn mang theo `user_role_id`/`scope_type`/`business_id` của dòng SEED đã
   * sinh ra nó, nên hai dòng `user_roles` scope tới hai `business_id` khác nhau của CÙNG một user
   * không bao giờ trộn lẫn scope của nhau qua DAG.
   *
   * `SELECT DISTINCT` gồm `user_role_id` để việc dừng đệ quy đúng cấu trúc (một cặp
   * role_id/user_role_id có thể tới được qua nhiều đường trong DAG). Kết quả JS sau đó khử trùng
   * lần nữa theo (scope_type, business_id, code, effect) — bỏ `user_role_id` khỏi hình dạng
   * `ScopedGrant` cuối cùng (không cần cho quyết định phân quyền, chỉ cần cho việc dừng CTE đúng).
   */
  async getScopedGrants(userId: string): Promise<ScopedGrant[]> {
    const rows: ScopedGrantRow[] = await this.repo.query(
      `
      WITH RECURSIVE seed AS (
        SELECT id AS user_role_id, role_id, scope_type, business_id
          FROM user_roles
         WHERE user_id = $1 AND revoked_at IS NULL
      ),
      expanded AS (
        SELECT user_role_id, role_id, scope_type, business_id FROM seed
        UNION
        SELECT e.user_role_id, rp.parent_role_id, e.scope_type, e.business_id
          FROM expanded e
          JOIN role_parents rp ON rp.role_id = e.role_id
      )
      SELECT DISTINCT e.user_role_id, e.scope_type, e.business_id, p.code, rperm.effect
        FROM expanded e
        JOIN role_permissions rperm ON rperm.role_id = e.role_id
        JOIN permissions      p     ON p.id = rperm.permission_id
       ORDER BY e.scope_type, e.business_id NULLS FIRST, p.code, rperm.effect
      `,
      [userId],
    );

    const seen = new Set<string>();
    const grants: ScopedGrant[] = [];
    for (const r of rows) {
      const key = `${r.effect}|${r.scope_type}|${r.business_id ?? ''}|${r.code}`;
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      grants.push({ code: r.code, effect: r.effect, scopeType: r.scope_type, businessId: r.business_id });
    }
    return grants;
  }
}
