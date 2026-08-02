import { MigrationInterface, QueryRunner } from 'typeorm';

// Moderation Foundation, M1 (ADR-018 §D10). Sáu quyền mới, scope Any (O6 — Managed hoãn tới khi
// business_claims/business_members thực sự migrate). KHÔNG role mới: `moderator`/`ai_agent` đã
// tồn tại (SeedRbac); administrator/super_administrator kế thừa qua role_parents DAG sẵn có, KHÔNG
// seed tường minh (tránh nguồn sự thật thứ hai cho thứ PDP đã tự tính — đúng ghi chú SeedRbac gốc).
//
// Then chốt (ADR-018 D5/D10): ai_agent CHỈ nhận AI.ModerateMedia, KHÔNG BAO GIỜ Media.Moderate —
// "AI không tự duyệt" (WF-09) và "AI không xoá cứng" (WF-18) được cưỡng chế bởi việc KHÔNG cấp
// quyền, không phải bởi một câu `if` ở tầng service.
export class SeedModerationPermissions1720003300000 implements MigrationInterface {
  name = 'SeedModerationPermissions1720003300000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      INSERT INTO "permissions" ("code","module","action","scope") VALUES
        ('Report.Create','Report','Create',NULL),
        ('Moderation.Queue.View','Moderation','Queue.View',NULL),
        ('Media.Moderate','Media','Moderate',NULL),
        ('Review.Moderate','Review','Moderate',NULL),
        ('Report.Resolve','Report','Resolve',NULL),
        ('AI.ModerateMedia','AI','ModerateMedia',NULL)
      ON CONFLICT ("code") DO NOTHING
    `);

    await this.grant(queryRunner, 'member', ['Report.Create']);
    await this.grant(queryRunner, 'moderator', [
      'Moderation.Queue.View',
      'Media.Moderate',
      'Review.Moderate',
      'Report.Resolve',
    ]);
    await this.grant(queryRunner, 'ai_agent', ['AI.ModerateMedia']);
  }

  private async grant(queryRunner: QueryRunner, roleCode: string, permCodes: string[]): Promise<void> {
    await queryRunner.query(
      `INSERT INTO "role_permissions" ("role_id","permission_id","effect")
       SELECT r.id, p.id, 'allow'
       FROM "roles" r JOIN "permissions" p ON p.code = ANY($2)
       WHERE r.code = $1
       ON CONFLICT ("role_id","permission_id") DO NOTHING`,
      [roleCode, permCodes],
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM "permissions" WHERE "code" IN (
        'Report.Create','Moderation.Queue.View','Media.Moderate','Review.Moderate',
        'Report.Resolve','AI.ModerateMedia'
      )
    `);
  }
}
