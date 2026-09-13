import { QueryRunner } from 'typeorm';
import { InitPlaceEditProposals1720005700000 } from '../1720005700000-InitPlaceEditProposals';

describe('InitPlaceEditProposals1720005700000', () => {
  let migration: InitPlaceEditProposals1720005700000;
  let queryRunner: { query: jest.Mock };

  beforeEach(() => {
    migration = new InitPlaceEditProposals1720005700000();
    queryRunner = { query: jest.fn() };
  });

  it('has the correct migration name', () => {
    expect(migration.name).toBe('InitPlaceEditProposals1720005700000');
  });

  describe('up()', () => {
    it('field_key is a closed ENUM restricted to the 3 MVP fields', async () => {
      await migration.up(queryRunner as unknown as QueryRunner);
      const calls: string[] = queryRunner.query.mock.calls.map((c: [string]) => c[0]);
      const enumCreate = calls.find((q) => q.includes('CREATE TYPE "place_edit_proposal_field_key"'));
      expect(enumCreate).toContain("'opening_hours','address','short_description'");
    });

    it('place_id/proposer_id/reviewer_id have the expected FK ON DELETE behavior', async () => {
      await migration.up(queryRunner as unknown as QueryRunner);
      const calls: string[] = queryRunner.query.mock.calls.map((c: [string]) => c[0]);
      const table = calls.find((q) => q.includes('CREATE TABLE "place_edit_proposals"'));
      expect(table).toContain('REFERENCES "places" ("id") ON DELETE RESTRICT');
      expect(table).toContain('"proposer_id"      UUID NOT NULL REFERENCES "users" ("id") ON DELETE RESTRICT');
      expect(table).toContain('"reviewer_id"      UUID REFERENCES "users" ("id") ON DELETE SET NULL');
    });

    it('base_value_hash format is enforced (64 lowercase hex chars)', async () => {
      await migration.up(queryRunner as unknown as QueryRunner);
      const calls: string[] = queryRunner.query.mock.calls.map((c: [string]) => c[0]);
      const table = calls.find((q) => q.includes('CREATE TABLE "place_edit_proposals"'));
      expect(table).toContain("CHECK (\"base_value_hash\" ~ '^[0-9a-f]{64}$')");
    });

    it('reason must not be blank', async () => {
      await migration.up(queryRunner as unknown as QueryRunner);
      const calls: string[] = queryRunner.query.mock.calls.map((c: [string]) => c[0]);
      const table = calls.find((q) => q.includes('CREATE TABLE "place_edit_proposals"'));
      expect(table).toContain('CHECK (btrim("reason") <> \'\')');
    });

    it('decision-consistency CHECK: pending carries no reviewer/reviewed_at, every other status must', async () => {
      await migration.up(queryRunner as unknown as QueryRunner);
      const calls: string[] = queryRunner.query.mock.calls.map((c: [string]) => c[0]);
      const table = calls.find((q) => q.includes('CREATE TABLE "place_edit_proposals"'));
      expect(table).toContain('chk_place_edit_proposal_decision_consistency');
      expect(table).toContain("\"status\" = 'pending' AND \"reviewer_id\" IS NULL AND \"reviewed_at\" IS NULL");
      expect(table).toContain("\"status\" != 'pending' AND \"reviewer_id\" IS NOT NULL AND \"reviewed_at\" IS NOT NULL");
    });

    it('anti-duplicate: one pending proposal per (place_id, field_key, proposer_id)', async () => {
      await migration.up(queryRunner as unknown as QueryRunner);
      const calls: string[] = queryRunner.query.mock.calls.map((c: [string]) => c[0]);
      const index = calls.find((q) => q.includes('uq_place_edit_proposal_pending_per_proposer_field'));
      expect(index).toBeDefined();
      expect(index).toContain('("place_id", "field_key", "proposer_id")');
      expect(index).toContain("WHERE \"status\" = 'pending'");
    });
  });

  describe('down()', () => {
    it('refuses to drop the table if any proposal rows exist', async () => {
      queryRunner.query.mockImplementation((sql: string) => {
        if (sql.includes('SELECT COUNT(*)')) return Promise.resolve([{ proposal_count: '3' }]);
        return Promise.resolve();
      });

      await expect(migration.down(queryRunner as unknown as QueryRunner)).rejects.toThrow(
        /3 proposal\(s\) exist/,
      );
      const calls: string[] = queryRunner.query.mock.calls.map((c: [string]) => c[0]);
      expect(calls.some((q) => q.includes('DROP TABLE'))).toBe(false);
    });

    it('drops table and both enum types when empty', async () => {
      queryRunner.query.mockImplementation((sql: string) => {
        if (sql.includes('SELECT COUNT(*)')) return Promise.resolve([{ proposal_count: '0' }]);
        return Promise.resolve();
      });

      await migration.down(queryRunner as unknown as QueryRunner);
      const calls: string[] = queryRunner.query.mock.calls.map((c: [string]) => c[0]);
      expect(calls.some((q) => q.includes('DROP TABLE IF EXISTS "place_edit_proposals"'))).toBe(true);
      expect(calls.some((q) => q.includes('DROP TYPE IF EXISTS "place_edit_proposal_status"'))).toBe(true);
      expect(calls.some((q) => q.includes('DROP TYPE IF EXISTS "place_edit_proposal_field_key"'))).toBe(true);
    });
  });
});
