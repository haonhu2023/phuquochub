import { MigrationInterface, QueryRunner } from 'typeorm';

// Sprint 1 — schema Users + RBAC (ADR-007). Migration-first (không synchronize).
// UUID sinh bằng gen_random_uuid() (pgcrypto — đã bật ở InitExtensions).
export class InitRbacAndUsers1720000100000 implements MigrationInterface {
  name = 'InitRbacAndUsers1720000100000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ---- Enums ----
    await queryRunner.query(`CREATE TYPE "user_provider" AS ENUM ('local','google')`);
    await queryRunner.query(`CREATE TYPE "role_perm_effect" AS ENUM ('allow','deny')`);
    await queryRunner.query(`CREATE TYPE "scope_type" AS ENUM ('global','managed','own')`);

    // ---- users ----
    await queryRunner.query(`
      CREATE TABLE "users" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "email" varchar(255) NOT NULL,
        "password_hash" varchar(255),
        "display_name" varchar(120) NOT NULL,
        "avatar_url" varchar(500),
        "provider" "user_provider" NOT NULL DEFAULT 'local',
        "is_active" boolean NOT NULL DEFAULT true,
        "is_service_account" boolean NOT NULL DEFAULT false,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`CREATE UNIQUE INDEX "uq_users_email" ON "users" ("email")`);

    // ---- roles ----
    await queryRunner.query(`
      CREATE TABLE "roles" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "code" varchar(60) NOT NULL,
        "name" varchar(120) NOT NULL,
        "description" varchar(300),
        "is_system" boolean NOT NULL DEFAULT true,
        "is_assignable" boolean NOT NULL DEFAULT true,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`CREATE UNIQUE INDEX "uq_roles_code" ON "roles" ("code")`);

    // ---- permissions ----
    await queryRunner.query(`
      CREATE TABLE "permissions" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "code" varchar(120) NOT NULL,
        "module" varchar(60) NOT NULL,
        "action" varchar(60) NOT NULL,
        "scope" varchar(20),
        "description" varchar(300),
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`CREATE UNIQUE INDEX "uq_permissions_code" ON "permissions" ("code")`);

    // ---- role_permissions (N–N + effect) ----
    await queryRunner.query(`
      CREATE TABLE "role_permissions" (
        "role_id" uuid NOT NULL REFERENCES "roles"("id") ON DELETE CASCADE,
        "permission_id" uuid NOT NULL REFERENCES "permissions"("id") ON DELETE CASCADE,
        "effect" "role_perm_effect" NOT NULL DEFAULT 'allow',
        "created_at" timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY ("role_id","permission_id")
      )
    `);

    // ---- role_parents (kế thừa DAG) ----
    await queryRunner.query(`
      CREATE TABLE "role_parents" (
        "role_id" uuid NOT NULL REFERENCES "roles"("id") ON DELETE CASCADE,
        "parent_role_id" uuid NOT NULL REFERENCES "roles"("id") ON DELETE NO ACTION,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY ("role_id","parent_role_id"),
        CONSTRAINT "chk_role_parent_not_self" CHECK ("role_id" <> "parent_role_id")
      )
    `);

    // ---- user_roles (gán vai trò + scope) ----
    // NOTE: business_id → places là FK theo ADR-015 nhưng `places` chưa tồn tại ở Sprint 1;
    //       FK sẽ được thêm trong migration Sprint 2 (Places). Hiện để uuid không FK.
    await queryRunner.query(`
      CREATE TABLE "user_roles" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "role_id" uuid NOT NULL REFERENCES "roles"("id") ON DELETE CASCADE,
        "scope_type" "scope_type" NOT NULL DEFAULT 'global',
        "business_id" uuid,
        "granted_by" uuid REFERENCES "users"("id") ON DELETE NO ACTION,
        "granted_at" timestamptz NOT NULL DEFAULT now(),
        "revoked_at" timestamptz
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "idx_user_roles_user" ON "user_roles" ("user_id") WHERE "revoked_at" IS NULL`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_user_roles_active" ON "user_roles" ("user_id","role_id","business_id") WHERE "revoked_at" IS NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "user_roles"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "role_parents"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "role_permissions"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "permissions"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "roles"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "users"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "scope_type"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "role_perm_effect"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "user_provider"`);
  }
}
