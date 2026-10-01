import { MigrationInterface, QueryRunner } from 'typeorm';

// New read-only operational permission. Do not reuse content editing permissions for audit access.
export class SeedOwnerDashboardPermission1720007000000 implements MigrationInterface {
  name = 'SeedOwnerDashboardPermission1720007000000';
  async up(q: QueryRunner): Promise<void> {
    await q.query(`INSERT INTO permissions (code,module,action,scope)
      VALUES ('Ops.Dashboard.View','Ops','View','Any') ON CONFLICT (code) DO NOTHING`);
    await q.query(`INSERT INTO role_permissions (role_id,permission_id,effect)
      SELECT r.id,p.id,'allow' FROM roles r CROSS JOIN permissions p
      WHERE r.code = 'content_owner' AND p.code = 'Ops.Dashboard.View'
      ON CONFLICT (role_id,permission_id) DO NOTHING`);
  }
  async down(q: QueryRunner): Promise<void> {
    await q.query(`DELETE FROM permissions WHERE code = 'Ops.Dashboard.View'`);
  }
}
