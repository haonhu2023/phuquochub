import { MigrationInterface, QueryRunner } from 'typeorm';

// ADR-016 (Accepted 2026-07-13) — `audit_logs`: tầng kiểm toán xuyên suốt, append-only, bất biến,
// đa hình (entity_type/entity_id, KHÔNG FK cứng; chỉ FK mềm actor_id→users, không cascade).
// Schema khớp data-dictionary §10 / database.md §3.21. Chỉ INSERT (không UPDATE/DELETE/soft-delete).
export class InitAuditLogs1720001500000 implements MigrationInterface {
  name = 'InitAuditLogs1720001500000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TYPE "audit_result" AS ENUM ('success','failure','allow','deny')`);

    await queryRunner.query(`
      CREATE TABLE "audit_logs" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "event" varchar(60) NOT NULL,
        "actor_id" uuid REFERENCES "users"("id") ON DELETE NO ACTION,
        "actor_role" varchar(40),
        "is_service_account" boolean NOT NULL DEFAULT false,
        "permission" varchar(60),
        "scope" varchar(10),
        "entity_type" varchar(40) NOT NULL,
        "entity_id" uuid,
        "result" "audit_result" NOT NULL,
        "ip" inet,
        "user_agent" varchar(300),
        "before" jsonb,
        "after" jsonb,
        "context" jsonb,
        "correlation_id" uuid,
        "created_at" timestamptz NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(
      `CREATE INDEX "idx_audit_entity" ON "audit_logs" ("entity_type","entity_id","created_at")`,
    );
    await queryRunner.query(`CREATE INDEX "idx_audit_actor" ON "audit_logs" ("actor_id","created_at")`);
    await queryRunner.query(`CREATE INDEX "idx_audit_event" ON "audit_logs" ("event","created_at")`);
    await queryRunner.query(
      `CREATE INDEX "idx_audit_correlation" ON "audit_logs" ("correlation_id") WHERE "correlation_id" IS NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "audit_logs"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "audit_result"`);
  }
}
