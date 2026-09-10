import { QueryRunner } from 'typeorm';
import { InitEvidenceReviews1720005500000 } from '../1720005500000-InitEvidenceReviews';

describe('InitEvidenceReviews1720005500000', () => {
  let migration: InitEvidenceReviews1720005500000;
  let queryRunner: { query: jest.Mock };

  beforeEach(() => {
    migration = new InitEvidenceReviews1720005500000();
    queryRunner = { query: jest.fn() };
  });

  it('has the correct migration name', () => {
    expect(migration.name).toBe('InitEvidenceReviews1720005500000');
  });

  describe('up()', () => {
    it('creates evidence_reviews with a RESTRICT FK to evidence_artifacts', async () => {
      await migration.up(queryRunner as unknown as QueryRunner);
      const calls: string[] = queryRunner.query.mock.calls.map((c: [string]) => c[0]);
      const table = calls.find((q) => q.includes('CREATE TABLE "evidence_reviews"'));
      expect(table).toBeDefined();
      expect(table).toContain('REFERENCES "evidence_artifacts" ("id") ON DELETE RESTRICT');
    });

    it('enforces the decision enum via a CHECK constraint', async () => {
      await migration.up(queryRunner as unknown as QueryRunner);
      const calls: string[] = queryRunner.query.mock.calls.map((c: [string]) => c[0]);
      const table = calls.find((q) => q.includes('CREATE TABLE "evidence_reviews"'));
      expect(table).toContain("CHECK (\"decision\" IN ('APPROVE', 'NEEDS_CHANGES', 'REJECT'))");
    });

    it('enforces reviewer_name/claim_type/policy_key/policy_version not blank', async () => {
      await migration.up(queryRunner as unknown as QueryRunner);
      const calls: string[] = queryRunner.query.mock.calls.map((c: [string]) => c[0]);
      const table = calls.find((q) => q.includes('CREATE TABLE "evidence_reviews"'));
      expect(table).toContain('CHECK (btrim("reviewer_name") <> \'\')');
      expect(table).toContain('CHECK (btrim("claim_type") <> \'\')');
      expect(table).toContain('CHECK (btrim("policy_key") <> \'\')');
      expect(table).toContain('CHECK (btrim("policy_version") <> \'\')');
    });

    it('enforces both SHA-256 digest columns are 64 lowercase hex chars', async () => {
      await migration.up(queryRunner as unknown as QueryRunner);
      const calls: string[] = queryRunner.query.mock.calls.map((c: [string]) => c[0]);
      const table = calls.find((q) => q.includes('CREATE TABLE "evidence_reviews"'));
      expect(table).toContain("CHECK (\"approval_artifact_sha256\" ~ '^[0-9a-f]{64}$')");
      expect(table).toContain("CHECK (\"evidence_content_sha256\" ~ '^[0-9a-f]{64}$')");
    });

    it('requires an APPROVE decision to also record verification_expires_at', async () => {
      await migration.up(queryRunner as unknown as QueryRunner);
      const calls: string[] = queryRunner.query.mock.calls.map((c: [string]) => c[0]);
      const table = calls.find((q) => q.includes('CREATE TABLE "evidence_reviews"'));
      expect(table).toContain('CHECK ("decision" <> \'APPROVE\' OR "verification_expires_at" IS NOT NULL)');
    });

    it('dedupes by (evidence_artifact_id, approval_artifact_sha256) for idempotent replay', async () => {
      await migration.up(queryRunner as unknown as QueryRunner);
      const calls: string[] = queryRunner.query.mock.calls.map((c: [string]) => c[0]);
      const table = calls.find((q) => q.includes('CREATE TABLE "evidence_reviews"'));
      expect(table).toContain('UNIQUE ("evidence_artifact_id", "approval_artifact_sha256")');
    });

    it('creates the evidence-artifact and reviewed_at lookup indexes', async () => {
      await migration.up(queryRunner as unknown as QueryRunner);
      const calls: string[] = queryRunner.query.mock.calls.map((c: [string]) => c[0]);
      expect(calls.some((q) => q.includes('idx_evidence_reviews_evidence_artifact') && q.includes('("evidence_artifact_id")'))).toBe(true);
      expect(calls.some((q) => q.includes('idx_evidence_reviews_reviewed_at') && q.includes('("reviewed_at")'))).toBe(true);
    });

    it('adds the four denormalized governance columns to evidence_artifacts, all nullable', async () => {
      await migration.up(queryRunner as unknown as QueryRunner);
      const calls: string[] = queryRunner.query.mock.calls.map((c: [string]) => c[0]);
      expect(calls.some((q) => q.includes('ADD COLUMN "verification_expires_at" TIMESTAMPTZ'))).toBe(true);
      expect(calls.some((q) => q.includes('ADD COLUMN "approval_artifact_sha256" CHAR(64)'))).toBe(true);
      expect(calls.some((q) => q.includes('ADD COLUMN "freshness_policy_key" VARCHAR(80)'))).toBe(true);
      expect(calls.some((q) => q.includes('ADD COLUMN "freshness_policy_version" VARCHAR(20)'))).toBe(true);
      // None of the ADD COLUMN statements declare NOT NULL — existing rows must stay untouched.
      calls
        .filter((q) => q.includes('ADD COLUMN'))
        .forEach((q) => expect(q).not.toContain('NOT NULL'));
    });

    it('creates a partial expiry index that skips never-reviewed rows', async () => {
      await migration.up(queryRunner as unknown as QueryRunner);
      const calls: string[] = queryRunner.query.mock.calls.map((c: [string]) => c[0]);
      const idx = calls.find((q) => q.includes('idx_evidence_artifacts_verification_expires_at'));
      expect(idx).toBeDefined();
      expect(idx).toContain('WHERE "verification_expires_at" IS NOT NULL');
    });

    it('never issues an UPDATE against evidence_artifacts — existing rows are untouched', async () => {
      await migration.up(queryRunner as unknown as QueryRunner);
      const calls: string[] = queryRunner.query.mock.calls.map((c: [string]) => c[0]);
      expect(calls.some((q) => /UPDATE\s+"evidence_artifacts"/i.test(q))).toBe(false);
    });
  });

  describe('down()', () => {
    it('refuses when evidence_reviews rows exist', async () => {
      queryRunner.query.mockResolvedValueOnce([{ count: '3' }]);
      await expect(migration.down(queryRunner as unknown as QueryRunner)).rejects.toThrow(/refused/);
    });

    it('refuses when evidence_artifacts carries governance state even with zero evidence_reviews rows', async () => {
      queryRunner.query.mockResolvedValueOnce([{ count: '0' }]).mockResolvedValueOnce([{ count: '1' }]);
      await expect(migration.down(queryRunner as unknown as QueryRunner)).rejects.toThrow(/refused/);
    });

    it('drops the table and columns when both guards are clear', async () => {
      queryRunner.query.mockResolvedValueOnce([{ count: '0' }]).mockResolvedValueOnce([{ count: '0' }]).mockResolvedValue(undefined);
      await migration.down(queryRunner as unknown as QueryRunner);
      const calls: string[] = queryRunner.query.mock.calls.slice(2).map((c: [string]) => c[0]);
      expect(calls.some((q) => q.includes('DROP TABLE IF EXISTS "evidence_reviews"'))).toBe(true);
      expect(calls.some((q) => q.includes('DROP COLUMN IF EXISTS "verification_expires_at"'))).toBe(true);
      expect(calls.some((q) => q.includes('DROP COLUMN IF EXISTS "approval_artifact_sha256"'))).toBe(true);
      expect(calls.some((q) => q.includes('DROP COLUMN IF EXISTS "freshness_policy_key"'))).toBe(true);
      expect(calls.some((q) => q.includes('DROP COLUMN IF EXISTS "freshness_policy_version"'))).toBe(true);
    });
  });
});
