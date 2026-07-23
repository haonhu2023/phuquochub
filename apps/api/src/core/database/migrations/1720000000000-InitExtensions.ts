import { MigrationInterface, QueryRunner } from 'typeorm';

// Migration nền: bật các extension PostgreSQL cần thiết.
// Idempotent (IF NOT EXISTS) — an toàn khi DB đã bật sẵn qua docker init script.
export class InitExtensions1720000000000 implements MigrationInterface {
  name = 'InitExtensions1720000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('CREATE EXTENSION IF NOT EXISTS postgis;');
    await queryRunner.query('CREATE EXTENSION IF NOT EXISTS unaccent;');
    await queryRunner.query('CREATE EXTENSION IF NOT EXISTS pg_trgm;');
    await queryRunner.query('CREATE EXTENSION IF NOT EXISTS pgcrypto;');
  }

  public async down(_queryRunner: QueryRunner): Promise<void> {
    // Không DROP EXTENSION khi revert: các extension có thể được dùng bởi
    // object khác; gỡ thủ công nếu thực sự cần.
  }
}
