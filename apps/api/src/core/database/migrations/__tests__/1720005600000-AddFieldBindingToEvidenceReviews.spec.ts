import { QueryRunner } from 'typeorm';
import { AddFieldBindingToEvidenceReviews1720005600000 } from '../1720005600000-AddFieldBindingToEvidenceReviews';

describe('AddFieldBindingToEvidenceReviews1720005600000', () => {
  let migration: AddFieldBindingToEvidenceReviews1720005600000;
  let queryRunner: { query: jest.Mock };

  beforeEach(() => {
    migration = new AddFieldBindingToEvidenceReviews1720005600000();
    queryRunner = { query: jest.fn() };
  });

  it('has the correct migration name', () => {
    expect(migration.name).toBe('AddFieldBindingToEvidenceReviews1720005600000');
  });

  describe('up()', () => {
    it('adds place_id as a nullable FK to places with ON DELETE RESTRICT', async () => {
      await migration.up(queryRunner as unknown as QueryRunner);
      const calls: string[] = queryRunner.query.mock.calls.map((c: [string]) => c[0]);
      const col = calls.find((q) => q.includes('ADD COLUMN "place_id"'));
      expect(col).toBeDefined();
      expect(col).toContain('REFERENCES "places" ("id") ON DELETE RESTRICT');
      expect(col).not.toContain('NOT NULL');
    });

    it('adds field_name and field_value_hash as nullable columns', async () => {
      await migration.up(queryRunner as unknown as QueryRunner);
      const calls: string[] = queryRunner.query.mock.calls.map((c: [string]) => c[0]);
      const fieldNameCol = calls.find((q) => q.includes('ADD COLUMN "field_name" VARCHAR(60)'));
      const hashCol = calls.find((q) => q.includes('ADD COLUMN "field_value_hash" CHAR(64)'));
      expect(fieldNameCol).toBeDefined();
      expect(fieldNameCol).not.toContain('NOT NULL');
      expect(hashCol).toBeDefined();
      expect(hashCol).not.toContain('NOT NULL');
    });

    it('enforces all-three-or-none binding consistency via a CHECK constraint', async () => {
      await migration.up(queryRunner as unknown as QueryRunner);
      const calls: string[] = queryRunner.query.mock.calls.map((c: [string]) => c[0]);
      const chk = calls.find((q) => q.includes('chk_evidence_review_binding_all_or_none'));
      expect(chk).toBeDefined();
      expect(chk).toContain('"place_id" IS NULL AND "field_name" IS NULL AND "field_value_hash" IS NULL');
      expect(chk).toContain('"place_id" IS NOT NULL AND "field_name" IS NOT NULL AND "field_value_hash" IS NOT NULL');
    });

    it('enforces field_name not blank and field_value_hash hex64 format when present', async () => {
      await migration.up(queryRunner as unknown as QueryRunner);
      const calls: string[] = queryRunner.query.mock.calls.map((c: [string]) => c[0]);
      const fieldNameChk = calls.find((q) => q.includes('chk_evidence_review_field_name_not_blank'));
      const hashChk = calls.find((q) => q.includes('chk_evidence_review_field_value_hash_format'));
      expect(fieldNameChk).toContain('"field_name" IS NULL OR btrim("field_name") <> \'\'');
      expect(hashChk).toContain('"field_value_hash" IS NULL OR "field_value_hash" ~ \'^[0-9a-f]{64}$\'');
    });

    it('creates a partial covering index for the (evidence_artifact_id, place_id, field_name, field_value_hash) tuple lookup, skipping unbound rows', async () => {
      await migration.up(queryRunner as unknown as QueryRunner);
      const calls: string[] = queryRunner.query.mock.calls.map((c: [string]) => c[0]);
      const idx = calls.find((q) => q.includes('idx_evidence_reviews_field_binding_tuple'));
      expect(idx).toBeDefined();
      expect(idx).toContain('("evidence_artifact_id", "place_id", "field_name", "field_value_hash", "reviewed_at")');
      expect(idx).toContain('WHERE "place_id" IS NOT NULL');
    });

    it('never issues an UPDATE against evidence_reviews — existing (legacy V1) rows are untouched', async () => {
      await migration.up(queryRunner as unknown as QueryRunner);
      const calls: string[] = queryRunner.query.mock.calls.map((c: [string]) => c[0]);
      expect(calls.some((q) => /UPDATE\s+"evidence_reviews"/i.test(q))).toBe(false);
    });
  });

  describe('down()', () => {
    it('refuses when any evidence_reviews row carries a V2 field binding', async () => {
      queryRunner.query.mockResolvedValueOnce([{ count: '2' }]);
      await expect(migration.down(queryRunner as unknown as QueryRunner)).rejects.toThrow(/refused/);
    });

    it('drops the columns and constraints when no bound rows exist', async () => {
      queryRunner.query.mockResolvedValueOnce([{ count: '0' }]).mockResolvedValue(undefined);
      await migration.down(queryRunner as unknown as QueryRunner);
      const calls: string[] = queryRunner.query.mock.calls.slice(1).map((c: [string]) => c[0]);
      expect(calls.some((q) => q.includes('DROP INDEX IF EXISTS "idx_evidence_reviews_field_binding_tuple"'))).toBe(true);
      expect(calls.some((q) => q.includes('DROP COLUMN IF EXISTS "field_value_hash"'))).toBe(true);
      expect(calls.some((q) => q.includes('DROP COLUMN IF EXISTS "field_name"'))).toBe(true);
      expect(calls.some((q) => q.includes('DROP COLUMN IF EXISTS "place_id"'))).toBe(true);
    });
  });
});
