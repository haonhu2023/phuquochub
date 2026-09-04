import { QueryRunner } from 'typeorm';
import { InitEvidenceArtifacts1720005000000 } from '../1720005000000-InitEvidenceArtifacts';

describe('InitEvidenceArtifacts1720005000000', () => {
  let migration: InitEvidenceArtifacts1720005000000;
  let queryRunner: { query: jest.Mock };

  beforeEach(() => {
    migration = new InitEvidenceArtifacts1720005000000();
    queryRunner = { query: jest.fn() };
  });

  it('has the correct migration name', () => {
    expect(migration.name).toBe('InitEvidenceArtifacts1720005000000');
  });

  describe('up()', () => {
    it('creates evidence_artifacts with a FK to sources and no FK to place_translations.evidence_id', async () => {
      await migration.up(queryRunner as unknown as QueryRunner);
      const calls: string[] = queryRunner.query.mock.calls.map((c: [string]) => c[0]);
      const table = calls.find((q) => q.includes('CREATE TABLE "evidence_artifacts"'));
      expect(table).toBeDefined();
      expect(table).toContain('REFERENCES "sources" ("id")');
      expect(table).toContain('"content_hash_sha256"  CHAR(64) NOT NULL');
      expect(table).toContain('"verification_status"  VARCHAR(40) NOT NULL');
    });

    it('creates the unique business_key index (idempotency key)', async () => {
      await migration.up(queryRunner as unknown as QueryRunner);
      const calls: string[] = queryRunner.query.mock.calls.map((c: [string]) => c[0]);
      const idx = calls.find((q) => q.includes('uq_evidence_artifacts_business_key'));
      expect(idx).toBeDefined();
      expect(idx).toContain('("business_key")');
    });

    it('creates source/verification_status/content_hash indexes', async () => {
      await migration.up(queryRunner as unknown as QueryRunner);
      const calls: string[] = queryRunner.query.mock.calls.map((c: [string]) => c[0]);
      expect(calls.some((q) => q.includes('idx_evidence_artifacts_source'))).toBe(true);
      expect(calls.some((q) => q.includes('idx_evidence_artifacts_verification_status'))).toBe(true);
      expect(calls.some((q) => q.includes('idx_evidence_artifacts_content_hash'))).toBe(true);
    });

    it('creates place_translation_evidence_links as a real many-to-many join table with FKs to both sides', async () => {
      await migration.up(queryRunner as unknown as QueryRunner);
      const calls: string[] = queryRunner.query.mock.calls.map((c: [string]) => c[0]);
      const table = calls.find((q) => q.includes('CREATE TABLE "place_translation_evidence_links"'));
      expect(table).toBeDefined();
      expect(table).toContain('REFERENCES "place_translations" ("id") ON DELETE CASCADE');
      expect(table).toContain('REFERENCES "evidence_artifacts" ("id") ON DELETE RESTRICT');
      expect(table).toContain('UNIQUE ("translation_id", "evidence_id")');
    });

    it('creates the translation_id and evidence_id link indexes', async () => {
      await migration.up(queryRunner as unknown as QueryRunner);
      const calls: string[] = queryRunner.query.mock.calls.map((c: [string]) => c[0]);
      expect(calls.some((q) => q.includes('idx_place_trans_evidence_link_translation'))).toBe(true);
      expect(calls.some((q) => q.includes('idx_place_trans_evidence_link_evidence'))).toBe(true);
    });
  });

  describe('down()', () => {
    it('refuses when evidence artifacts exist', async () => {
      queryRunner.query.mockResolvedValue([{ evidence_count: '3', link_count: '0' }]);
      await expect(migration.down(queryRunner as unknown as QueryRunner)).rejects.toThrow(/refused/);
    });

    it('refuses when links exist even if evidence_count is 0', async () => {
      queryRunner.query.mockResolvedValue([{ evidence_count: '0', link_count: '8' }]);
      await expect(migration.down(queryRunner as unknown as QueryRunner)).rejects.toThrow(/refused/);
    });

    it('drops both tables when both counts are 0', async () => {
      queryRunner.query.mockResolvedValueOnce([{ evidence_count: '0', link_count: '0' }]).mockResolvedValue(undefined);
      await migration.down(queryRunner as unknown as QueryRunner);
      const calls: string[] = queryRunner.query.mock.calls.slice(1).map((c: [string]) => c[0]);
      expect(calls.some((q) => q.includes('DROP TABLE IF EXISTS "place_translation_evidence_links"'))).toBe(true);
      expect(calls.some((q) => q.includes('DROP TABLE IF EXISTS "evidence_artifacts"'))).toBe(true);
    });
  });
});
