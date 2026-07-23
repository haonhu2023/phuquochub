import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Role } from '../entities/role.entity';

export interface RolePermissionRow {
  code: string;
  effect: 'allow' | 'deny';
}

// Repository cho `roles` + truy vấn kế thừa DAG & permission (phục vụ PDP).
@Injectable()
export class RolesRepository {
  constructor(
    @InjectRepository(Role)
    private readonly repo: Repository<Role>,
  ) {}

  findById(id: string): Promise<Role | null> {
    return this.repo.findOne({ where: { id } });
  }

  findByCode(code: string): Promise<Role | null> {
    return this.repo.findOne({ where: { code } });
  }

  findAll(): Promise<Role[]> {
    return this.repo.find({ order: { code: 'ASC' } });
  }

  /**
   * Trả về TẤT CẢ role id hiệu lực = tập role đầu vào + mọi role cha (kế thừa DAG),
   * dùng đệ quy trên `role_parents` (WITH RECURSIVE).
   */
  async expandWithAncestors(roleIds: string[]): Promise<string[]> {
    if (roleIds.length === 0) {
      return [];
    }
    const rows: Array<{ id: string }> = await this.repo.query(
      `
      WITH RECURSIVE anc AS (
        SELECT parent_role_id FROM role_parents WHERE role_id = ANY($1)
        UNION
        SELECT rp.parent_role_id
        FROM role_parents rp
        JOIN anc ON rp.role_id = anc.parent_role_id
      )
      SELECT DISTINCT parent_role_id AS id FROM anc
      `,
      [roleIds],
    );
    const ancestors = rows.map((r) => r.id);
    return Array.from(new Set([...roleIds, ...ancestors]));
  }

  /** Lấy mọi (permission code, effect) của tập role id (đã gồm kế thừa). */
  async getPermissionsForRoles(roleIds: string[]): Promise<RolePermissionRow[]> {
    if (roleIds.length === 0) {
      return [];
    }
    return this.repo.query(
      `
      SELECT p.code AS code, rp.effect AS effect
      FROM role_permissions rp
      JOIN permissions p ON p.id = rp.permission_id
      WHERE rp.role_id = ANY($1)
      `,
      [roleIds],
    );
  }
}
