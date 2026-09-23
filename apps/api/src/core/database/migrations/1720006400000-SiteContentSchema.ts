import { MigrationInterface, QueryRunner } from 'typeorm';

// S1 (launch-readiness pass, 2026-09-22) — owner-editable site content (homepage hero/about/
// featured-places + social channels), the CMS gap identified in the plan (G11: "không tồn tại
// site_content ở đâu — chữ trang chủ nằm cứng trong home.copy.ts").
//
// SCHEMA: one row per (key, locale). `locale` is NEVER NULL — locale-INDEPENDENT content
// (featured places, social links) uses the sentinel `'*'` instead of NULL, specifically to avoid
// Postgres's "NULL is distinct from NULL" unique-constraint pitfall, which would let duplicate
// rows accumulate for the same key under a nullable locale column. `value` is a single JSONB blob
// per row (not normalized columns) because each key's shape differs (hero: eyebrow/title/lede/
// heroMediaId; social: facebook/zalo/instagram/whatsapp/phone) and none of these fields are
// queried/filtered on individually — only ever read whole and written whole, same reasoning
// guide_blocks.content already established for structured-but-heterogeneous JSON.
//
// content_version is the SAME CAS idiom as guide_articles/places: SiteContentService.upsert() does
// a single `INSERT ... ON CONFLICT (key, locale) DO UPDATE ... WHERE content_version = $expected`
// statement — one round trip handles BOTH first-ever creation (expectedContentVersion=0, the
// INSERT branch runs unconditionally since the WHERE only gates the UPDATE branch) and subsequent
// CAS-protected edits.
//
// `SiteContent.Edit` is granted ONLY to `content_owner` here — this is the permission
// SeedContentOwnerRole1720006200000's own migration comment said would be created and granted at
// this exact point ("that permission does not exist until SiteContentSchema, which grants it to
// content_owner itself once the permission row exists").
export class SiteContentSchema1720006400000 implements MigrationInterface {
  name = 'SiteContentSchema1720006400000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "site_content" (
        "key"              VARCHAR(60)   NOT NULL,
        "locale"           VARCHAR(5)    NOT NULL,
        "value"            JSONB         NOT NULL,
        "content_version"  INTEGER       NOT NULL DEFAULT 1,
        "updated_by"       UUID          REFERENCES "users"("id"),
        "updated_at"       TIMESTAMPTZ   NOT NULL DEFAULT now(),
        PRIMARY KEY ("key", "locale")
      )
    `);

    await queryRunner.query(`
      INSERT INTO "permissions" ("code","module","action","scope") VALUES
        ('SiteContent.Edit','SiteContent','Edit','Any')
      ON CONFLICT ("code") DO NOTHING
    `);

    await queryRunner.query(
      `INSERT INTO "role_permissions" ("role_id","permission_id","effect")
       SELECT r.id, p.id, 'allow'
       FROM "roles" r JOIN "permissions" p ON p.code = 'SiteContent.Edit'
       WHERE r.code = 'content_owner'
       ON CONFLICT ("role_id","permission_id") DO NOTHING`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DELETE FROM "permissions" WHERE "code" = 'SiteContent.Edit'`);
    await queryRunner.query(`DROP TABLE IF EXISTS "site_content"`);
  }
}
