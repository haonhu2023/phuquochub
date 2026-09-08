import { QueryRunner } from 'typeorm';
import { InitPlaceFieldEvidenceLinks1720005300000 } from '../1720005300000-InitPlaceFieldEvidenceLinks';

describe('InitPlaceFieldEvidenceLinks1720005300000', () => {
  let migration: InitPlaceFieldEvidenceLinks1720005300000;
  let queryRunner: { query: jest.Mock };

  beforeEach(() => {
    migration = new InitPlaceFieldEvidenceLinks1720005300000();
    queryRunner = { query: jest.fn() };
  });

  it('has the correct migration name', () => {
    expect(migration.name).toBe('InitPlaceFieldEvidenceLinks1720005300000');
  });

  describe('up()', () => {
    it('creates place_field_evidence_links with FKs to both places and evidence_artifacts', async () => {
      await migration.up(queryRunner as unknown as QueryRunner);
      const calls: string[] = queryRunner.query.mock.calls.map((c: [string]) => c[0]);
      const table = calls.find((q) => q.includes('CREATE TABLE "place_field_evidence_links"'));
      expect(table).toBeDefined();
      expect(table).toContain('REFERENCES "places" ("id") ON DELETE CASCADE');
      expect(table).toContain('REFERENCES "evidence_artifacts" ("id") ON DELETE RESTRICT');
    });

    it('enforces a non-blank field_name via a CHECK constraint', async () => {
      await migration.up(queryRunner as unknown as QueryRunner);
      const calls: string[] = queryRunner.query.mock.calls.map((c: [string]) => c[0]);
      const table = calls.find((q) => q.includes('CREATE TABLE "place_field_evidence_links"'));
      expect(table).toContain("CHECK (btrim(\"field_name\") <> '')");
    });

    it('prevents duplicate identical links via a UNIQUE(place_id, field_name, evidence_artifact_id) constraint', async () => {
      await migration.up(queryRunner as unknown as QueryRunner);
      const calls: string[] = queryRunner.query.mock.calls.map((c: [string]) => c[0]);
      const table = calls.find((q) => q.includes('CREATE TABLE "place_field_evidence_links"'));
      expect(table).toContain('UNIQUE ("place_id", "field_name", "evidence_artifact_id")');
    });

    it('creates the place+field and evidence lookup indexes', async () => {
      await migration.up(queryRunner as unknown as QueryRunner);
      const calls: string[] = queryRunner.query.mock.calls.map((c: [string]) => c[0]);
      expect(calls.some((q) => q.includes('idx_place_field_evidence_link_place_field') && q.includes('("place_id", "field_name")'))).toBe(true);
      expect(calls.some((q) => q.includes('idx_place_field_evidence_link_evidence') && q.includes('("evidence_artifact_id")'))).toBe(true);
    });
  });

  describe('down()', () => {
    it('refuses when field-evidence links exist', async () => {
      queryRunner.query.mockResolvedValue([{ link_count: '5' }]);
      await expect(migration.down(queryRunner as unknown as QueryRunner)).rejects.toThrow(/refused/);
    });

    it('drops the table when zero links exist', async () => {
      queryRunner.query.mockResolvedValueOnce([{ link_count: '0' }]).mockResolvedValue(undefined);
      await migration.down(queryRunner as unknown as QueryRunner);
      const calls: string[] = queryRunner.query.mock.calls.slice(1).map((c: [string]) => c[0]);
      expect(calls.some((q) => q.includes('DROP TABLE IF EXISTS "place_field_evidence_links"'))).toBe(true);
    });
  });
});
