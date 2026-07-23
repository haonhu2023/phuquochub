import { MigrationInterface, QueryRunner } from 'typeorm';

// Sprint 1 — seed RBAC lõi (vai trò + tập permission đại diện + kế thừa DAG).
// Đủ để đăng ký (gán `member`) và cưỡng chế permission cho endpoint Sprint 1.
// Danh mục đầy đủ theo rbac.md §3–§4 sẽ bổ sung dần theo Sprint.
export class SeedRbac1720000300000 implements MigrationInterface {
  name = 'SeedRbac1720000300000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ---- Roles (rbac.md §4) ----
    await queryRunner.query(`
      INSERT INTO "roles" ("code","name","description","is_system","is_assignable") VALUES
        ('guest','Guest','Khách chưa đăng nhập', true, false),
        ('member','Member','Người dùng đã đăng ký', true, true),
        ('local_guide','Local Guide','Thành viên bản địa uy tín', true, true),
        ('contributor','Contributor','Biên tập viên dữ liệu', true, true),
        ('business_manager','Business Manager','Nhân sự vận hành cơ sở', true, true),
        ('business_owner','Business Owner','Chủ sở hữu cơ sở', true, true),
        ('moderator','Moderator','Kiểm duyệt nội dung', true, true),
        ('administrator','Administrator','Quản trị vận hành', true, true),
        ('super_administrator','Super Administrator','Quản trị RBAC & hệ thống', true, true),
        ('ai_agent','AI Agent','Service principal (phi con người)', true, false)
    `);

    // ---- Permissions (tập đại diện — Module.Action[.Scope]) ----
    await queryRunner.query(`
      INSERT INTO "permissions" ("code","module","action","scope") VALUES
        ('*','*','*',NULL),
        ('Place.View','Place','View',NULL),
        ('Place.Create','Place','Create',NULL),
        ('Place.Approve','Place','Approve',NULL),
        ('Category.View','Category','View',NULL),
        ('Category.Manage','Category','Manage',NULL),
        ('Review.Create','Review','Create',NULL),
        ('Search.Query','Search','Query',NULL),
        ('Map.View','Map','View',NULL),
        ('User.View','User','View',NULL),
        ('User.Edit.Own','User','Edit','Own'),
        ('User.Ban','User','Ban',NULL),
        ('Business.Claim','Business','Claim',NULL),
        ('Verification.Verify','Verification','Verify',NULL),
        ('Verification.Reject','Verification','Reject',NULL),
        ('Role.Assign','Role','Assign',NULL),
        ('Role.Create','Role','Create',NULL),
        ('Role.Edit','Role','Edit',NULL),
        ('Role.Delete','Role','Delete',NULL),
        ('Permission.Manage','Permission','Manage',NULL),
        ('AI.GenerateSummary','AI','GenerateSummary',NULL),
        ('AI.Translate','AI','Translate',NULL)
    `);

    // ---- Kế thừa DAG (role_parents) — rbac.md §5 ----
    await this.link(queryRunner, [
      ['member', 'guest'],
      ['local_guide', 'member'],
      ['contributor', 'member'],
      ['business_manager', 'member'],
      ['business_owner', 'business_manager'],
      ['moderator', 'contributor'],
      ['moderator', 'local_guide'],
      ['administrator', 'moderator'],
      ['super_administrator', 'administrator'],
    ]);

    // ---- Gán permission cho role (chỉ khai báo bổ sung; phần kế thừa do PDP hợp nhất) ----
    await this.grant(queryRunner, 'guest', ['Place.View', 'Search.Query', 'Map.View', 'User.View']);
    await this.grant(queryRunner, 'member', [
      'Review.Create',
      'Place.Create',
      'Business.Claim',
      'User.Edit.Own',
      'Category.View',
    ]);
    await this.grant(queryRunner, 'moderator', [
      'Place.Approve',
      'Verification.Verify',
      'Verification.Reject',
      'Category.Manage',
    ]);
    await this.grant(queryRunner, 'administrator', ['Role.Assign', 'User.Ban', 'Category.Manage']);
    await this.grant(queryRunner, 'super_administrator', ['*']);
    await this.grant(queryRunner, 'ai_agent', ['AI.GenerateSummary', 'AI.Translate']);
  }

  private async link(queryRunner: QueryRunner, pairs: [string, string][]): Promise<void> {
    for (const [child, parent] of pairs) {
      await queryRunner.query(
        `INSERT INTO "role_parents" ("role_id","parent_role_id")
         SELECT c.id, p.id FROM "roles" c, "roles" p WHERE c.code = $1 AND p.code = $2`,
        [child, parent],
      );
    }
  }

  private async grant(queryRunner: QueryRunner, roleCode: string, permCodes: string[]): Promise<void> {
    await queryRunner.query(
      `INSERT INTO "role_permissions" ("role_id","permission_id","effect")
       SELECT r.id, p.id, 'allow'
       FROM "roles" r JOIN "permissions" p ON p.code = ANY($2)
       WHERE r.code = $1`,
      [roleCode, permCodes],
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DELETE FROM "role_parents"`);
    await queryRunner.query(`DELETE FROM "role_permissions"`);
    await queryRunner.query(`DELETE FROM "permissions"`);
    await queryRunner.query(`DELETE FROM "roles"`);
  }
}
