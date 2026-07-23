import { MigrationInterface, QueryRunner } from 'typeorm';

// Provenance subsystem (source.md) — `sources` (danh mục nguồn) + `source_attributions`
// (quy chiếu nguồn, đa hình). Quyết định triển khai (ADR chờ bổ sung — xem trao đổi
// Module 10/11/12 của phiên làm việc):
//  - entity_type là VARCHAR(30) lowercase, KHÔNG enum — theo đúng B-3 (data-dictionary),
//    nhất quán với contacts.owner_type / price_history.entity_type (KHÔNG theo wiki_revisions,
//    vì entity_type ở đây là tập mở/sẽ mở rộng — review, future entities — không phải tập đóng).
//  - type/kind LÀ enum thật (tập đóng, hữu hạn, giống verification_status/price_range).
//  - Giai đoạn 1: chỉ mức bản ghi (place/media/contact/…); field-level (`field` cột) đã có
//    sẵn trong schema nhưng KHÔNG bắt buộc — mở rộng dần không cần migration thêm.
//  - source_id trên price_history (đã tồn tại từ InitPlaces, chưa FK) được nối FK ở đây —
//    đúng như comment gốc trên PriceHistory entity: "source_id chưa FK (bảng sources thuộc Wave sau)".
export class InitSources1720001700000 implements MigrationInterface {
  name = 'InitSources1720001700000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ---- Enums (source.md §4) ----
    await queryRunner.query(`
      CREATE TYPE "source_type" AS ENUM (
        'official_website','business_owner','government','google_maps','openstreetmap',
        'press','facebook','community','field_survey','moderator','ai','other'
      )
    `);
    await queryRunner.query(
      `CREATE TYPE "source_kind" AS ENUM ('url','dataset','platform_user','ai_model','offline')`,
    );

    // ---- sources (danh mục nguồn, source.md §4) ----
    await queryRunner.query(`
      CREATE TABLE "sources" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "type" "source_type" NOT NULL,
        "kind" "source_kind" NOT NULL,
        "title" varchar(200),
        "url" varchar(500),
        "external_ref" varchar(150),
        "publisher" varchar(200),
        "author_user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
        "license" varchar(60),
        "reliability" smallint NOT NULL,
        "language" char(2),
        "retrieved_at" timestamptz,
        "metadata" jsonb,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "deleted_at" timestamptz,
        CONSTRAINT "chk_source_reliability_range" CHECK ("reliability" BETWEEN 0 AND 100)
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_sources_type_external_ref" ON "sources" ("type","external_ref") WHERE "external_ref" IS NOT NULL`,
    );
    await queryRunner.query(`CREATE INDEX "idx_sources_type" ON "sources" ("type")`);
    await queryRunner.query(
      `CREATE INDEX "idx_sources_author" ON "sources" ("author_user_id") WHERE "author_user_id" IS NOT NULL`,
    );

    // ---- source_attributions (quy chiếu nguồn, đa hình — source.md §5) ----
    // entity_type: place, place_field, contact, media, price_history, place_faq, review, wiki_revision
    // (review chưa có bảng — attribution vẫn ghi được, toàn vẹn ở tầng ứng dụng, giống
    // contacts.owner_type/price_history.entity_type đã làm với 'business'/'hotel'/… trước khi
    // các bảng đó tồn tại).
    await queryRunner.query(`
      CREATE TABLE "source_attributions" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "source_id" uuid NOT NULL REFERENCES "sources"("id") ON DELETE CASCADE,
        "entity_type" varchar(30) NOT NULL,
        "entity_id" uuid NOT NULL,
        "field" varchar(60),
        "confidence" smallint,
        "note" varchar(300),
        "is_primary" boolean NOT NULL DEFAULT false,
        "verified_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
        "verified_at" timestamptz,
        "created_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "chk_source_attr_confidence_range" CHECK ("confidence" IS NULL OR "confidence" BETWEEN 0 AND 100)
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "idx_source_attr_entity" ON "source_attributions" ("entity_type","entity_id")`,
    );
    await queryRunner.query(`CREATE INDEX "idx_source_attr_source" ON "source_attributions" ("source_id")`);
    // Lưu ý (ghi lại, không "sửa" thiết kế): UNIQUE trên cột nullable "field" — theo ngữ nghĩa
    // Postgres, NULL <> NULL nên nhiều dòng cùng (entity_type, entity_id, source_id, field=NULL)
    // KHÔNG vi phạm ràng buộc này. Giữ đúng như source.md §5 đặc tả; không tự ý thêm COALESCE.
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_source_attr_entity_field_source" ON "source_attributions" ("entity_type","entity_id","field","source_id")`,
    );

    // ---- Nối FK còn thiếu: price_history.source_id → sources.id ----
    await queryRunner.query(
      `ALTER TABLE "price_history" ADD CONSTRAINT "fk_price_history_source" FOREIGN KEY ("source_id") REFERENCES "sources"("id") ON DELETE SET NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "price_history" DROP CONSTRAINT IF EXISTS "fk_price_history_source"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "source_attributions"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "sources"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "source_kind"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "source_type"`);
  }
}
