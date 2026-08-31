import { InitPlaceTranslations1720004600000 } from '../1720004600000-InitPlaceTranslations';
import type { QueryRunner } from 'typeorm';

function recordingRunner(queryResults: unknown[] = []) {
  const calls: Array<{ sql: string; params?: unknown[] }> = [];
  let i = 0;
  const qr = {
    query: (sql: string, params?: unknown[]) => {
      calls.push({ sql, params });
      const result = queryResults[i];
      i += 1;
      return Promise.resolve(result);
    },
  } as unknown as QueryRunner;
  return { qr, calls };
}

function sqlOf(calls: Array<{ sql: string }>): string {
  return calls
    .map((c) => c.sql)
    .join('\n')
    .replace(/\s+/g, ' ');
}

describe('InitPlaceTranslations migration (ADR-020)', () => {
  describe('up', () => {
    it('extends revision_entity_type additively — never drops/recreates the enum', async () => {
      const { qr, calls } = recordingRunner();
      await new InitPlaceTranslations1720004600000().up(qr);
      const all = sqlOf(calls);
      expect(all).toContain(`ALTER TYPE "revision_entity_type" ADD VALUE 'place_translation'`);
      expect(all).not.toMatch(/DROP TYPE "revision_entity_type"/);
    });

    it('creates supported_locales with exactly-one-default and PLANNED-not-public constraints', async () => {
      const { qr, calls } = recordingRunner();
      await new InitPlaceTranslations1720004600000().up(qr);
      const all = sqlOf(calls);
      expect(all).toContain('CREATE TABLE "supported_locales"');
      expect(all).toContain('"locale_code" varchar(35) PRIMARY KEY');
      expect(all).toContain('CONSTRAINT "ck_locale_fallback_not_self"');
      expect(all).toContain('CONSTRAINT "ck_locale_planned_not_public"');
      expect(all).toMatch(/CREATE UNIQUE INDEX "uq_locale_default" ON "supported_locales" \("is_default"\)\s*WHERE "is_default"/);
    });

    it('seeds exactly vi (default, source) and en (target_primary, fallback vi) — no PLANNED rows', async () => {
      const { qr, calls } = recordingRunner();
      await new InitPlaceTranslations1720004600000().up(qr);
      const insertCall = calls.find((c) => c.sql.includes('INSERT INTO "supported_locales"'));
      expect(insertCall).toBeDefined();
      const sql = insertCall!.sql.replace(/\s+/g, ' ');
      expect(sql).toContain(`('vi','Vietnamese','Tiếng Việt','ltr','source_default','active',true,true,true,NULL)`);
      expect(sql).toContain(`('en','English','English','ltr','target_primary','active',false,true,true,'vi')`);
      // Only two rows seeded — no fr/de/ru/ko/ja/zh-Hans/th planned locales in this migration.
      expect(sql.match(/\('[a-z]{2}(-[A-Za-z]+)?',/g)).toHaveLength(2);
    });

    it('creates place_translations with the current-row-scoped unique index (not a plain composite unique)', async () => {
      const { qr, calls } = recordingRunner();
      await new InitPlaceTranslations1720004600000().up(qr);
      const all = sqlOf(calls);
      expect(all).toContain('CREATE TABLE "place_translations"');
      expect(all).toContain('REFERENCES "places"("id") ON DELETE CASCADE');
      expect(all).toContain('REFERENCES "wiki_revisions"("id")');
      expect(all).toMatch(
        /CREATE UNIQUE INDEX "uq_place_trans_current" ON "place_translations" \("place_id","field_key","locale_code"\)\s*WHERE "is_current"/,
      );
      expect(all).toContain('CONSTRAINT "ck_place_trans_ai_needs_review"');
    });

    it('creates place_translation_routes with slug uniqueness scoped per locale', async () => {
      const { qr, calls } = recordingRunner();
      await new InitPlaceTranslations1720004600000().up(qr);
      const all = sqlOf(calls);
      expect(all).toContain('CREATE TABLE "place_translation_routes"');
      expect(all).toMatch(
        /CREATE UNIQUE INDEX "uq_place_route_slug_current" ON "place_translation_routes" \("locale_code","localized_slug"\)\s*WHERE "is_current"/,
      );
    });

    it('creates place_translation_seo with the anti-fallback CHECK (robots_index requires translation_id_title)', async () => {
      const { qr, calls } = recordingRunner();
      await new InitPlaceTranslations1720004600000().up(qr);
      const all = sqlOf(calls);
      expect(all).toContain('CREATE TABLE "place_translation_seo"');
      expect(all).toContain('CONSTRAINT "ck_place_seo_index_needs_translation" CHECK ( "robots_index" = false OR "translation_id_title" IS NOT NULL )'.replace(/\s+/g, ' '));
      expect(all).toMatch(
        /CREATE UNIQUE INDEX "uq_place_seo_current" ON "place_translation_seo" \("place_id","locale_code"\)\s*WHERE "is_current"/,
      );
    });
  });

  describe('down — self-refuses when translation data already exists', () => {
    it('place_translations has rows → refuses, drops nothing', async () => {
      const { qr, calls } = recordingRunner([[{ count: 3 }]]);
      await expect(new InitPlaceTranslations1720004600000().down(qr)).rejects.toThrow(/3 place_translations row/);
      expect(calls.filter((c) => c.sql.includes('DROP'))).toHaveLength(0);
    });

    it('place_translations empty → proceeds, drops tables/types', async () => {
      const { qr, calls } = recordingRunner([[{ count: 0 }]]);
      await new InitPlaceTranslations1720004600000().down(qr);
      const all = sqlOf(calls);
      expect(all).toContain('DROP TABLE IF EXISTS "place_translation_seo"');
      expect(all).toContain('DROP TABLE IF EXISTS "place_translation_routes"');
      expect(all).toContain('DROP TABLE IF EXISTS "place_translations"');
      expect(all).toContain('DROP TABLE IF EXISTS "supported_locales"');
      // revision_entity_type's added enum value is deliberately NOT stripped on down (see comment
      // in the migration) — Postgres cannot DROP a single enum value without a full type rewrite.
      expect(all).not.toContain('DROP TYPE IF EXISTS "revision_entity_type"');
    });
  });
});
