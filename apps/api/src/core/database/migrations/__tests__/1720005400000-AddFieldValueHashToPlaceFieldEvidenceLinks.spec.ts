import { QueryRunner } from 'typeorm';
import { AddFieldValueHashToPlaceFieldEvidenceLinks1720005400000 } from '../1720005400000-AddFieldValueHashToPlaceFieldEvidenceLinks';

describe('AddFieldValueHashToPlaceFieldEvidenceLinks1720005400000', () => {
  let migration: AddFieldValueHashToPlaceFieldEvidenceLinks1720005400000;
  let queryRunner: { query: jest.Mock };

  beforeEach(() => {
    migration = new AddFieldValueHashToPlaceFieldEvidenceLinks1720005400000();
    queryRunner = { query: jest.fn() };
  });

  it('has the correct migration name', () => {
    expect(migration.name).toBe('AddFieldValueHashToPlaceFieldEvidenceLinks1720005400000');
  });

  describe('up()', () => {
    it('refuses when existing field-evidence links have no field_value_hash to backfill', async () => {
      queryRunner.query.mockResolvedValue([{ link_count: '4' }]);
      await expect(migration.up(queryRunner as unknown as QueryRunner)).rejects.toThrow(/refused/);
    });

    it('adds field_value_hash as NOT NULL when the table is empty', async () => {
      queryRunner.query.mockResolvedValueOnce([{ link_count: '0' }]).mockResolvedValue(undefined);
      await migration.up(queryRunner as unknown as QueryRunner);
      const calls: string[] = queryRunner.query.mock.calls.slice(1).map((c: [string]) => c[0]);
      expect(calls.some((q) => q.includes('ADD COLUMN "field_value_hash" CHAR(64) NOT NULL'))).toBe(true);
    });

    it('replaces the UNIQUE constraint to include field_value_hash', async () => {
      queryRunner.query.mockResolvedValueOnce([{ link_count: '0' }]).mockResolvedValue(undefined);
      await migration.up(queryRunner as unknown as QueryRunner);
      const calls: string[] = queryRunner.query.mock.calls.slice(1).map((c: [string]) => c[0]);
      expect(calls.some((q) => q.includes('DROP CONSTRAINT "uq_place_field_evidence_link"'))).toBe(true);
      const addConstraint = calls.find((q) => q.includes('ADD CONSTRAINT "uq_place_field_evidence_link"'));
      expect(addConstraint).toBeDefined();
      expect(addConstraint).toContain('UNIQUE ("place_id", "field_name", "evidence_artifact_id", "field_value_hash")');
    });
  });

  describe('down()', () => {
    it('refuses when field-evidence links exist', async () => {
      queryRunner.query.mockResolvedValue([{ link_count: '2' }]);
      await expect(migration.down(queryRunner as unknown as QueryRunner)).rejects.toThrow(/refused/);
    });

    it('restores the original 3-column UNIQUE constraint and drops the column when empty', async () => {
      queryRunner.query.mockResolvedValueOnce([{ link_count: '0' }]).mockResolvedValue(undefined);
      await migration.down(queryRunner as unknown as QueryRunner);
      const calls: string[] = queryRunner.query.mock.calls.slice(1).map((c: [string]) => c[0]);
      const addConstraint = calls.find((q) => q.includes('ADD CONSTRAINT "uq_place_field_evidence_link"'));
      expect(addConstraint).toContain('UNIQUE ("place_id", "field_name", "evidence_artifact_id")');
      expect(addConstraint).not.toContain('field_value_hash');
      expect(calls.some((q) => q.includes('DROP COLUMN "field_value_hash"'))).toBe(true);
    });
  });
});
