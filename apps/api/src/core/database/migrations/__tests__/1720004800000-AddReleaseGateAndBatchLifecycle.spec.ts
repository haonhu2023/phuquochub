import { QueryRunner } from 'typeorm';
import { AddReleaseGateAndBatchLifecycle1720004800000 } from '../1720004800000-AddReleaseGateAndBatchLifecycle';

describe('AddReleaseGateAndBatchLifecycle1720004800000', () => {
  let migration: AddReleaseGateAndBatchLifecycle1720004800000;
  let queryRunner: { query: jest.Mock };

  beforeEach(() => {
    migration = new AddReleaseGateAndBatchLifecycle1720004800000();
    queryRunner = { query: jest.fn() };
  });

  it('has the correct migration name', () => {
    expect(migration.name).toBe('AddReleaseGateAndBatchLifecycle1720004800000');
  });

  describe('up()', () => {
    it('adds cancelled and superseded to the batch status enum', async () => {
      await migration.up(queryRunner as unknown as QueryRunner);
      const calls: string[] = queryRunner.query.mock.calls.map((c: [string]) => c[0]);
      expect(calls.some(q => q.includes("ADD VALUE IF NOT EXISTS 'cancelled'"))).toBe(true);
      expect(calls.some(q => q.includes("ADD VALUE IF NOT EXISTS 'superseded'"))).toBe(true);
    });

    it('adds every release-gate and lifecycle column', async () => {
      await migration.up(queryRunner as unknown as QueryRunner);
      const calls: string[] = queryRunner.query.mock.calls.map((c: [string]) => c[0]);
      const alter = calls.find(q => q.includes('ALTER TABLE "multilingual_import_batches"') && q.includes('ADD COLUMN'));
      expect(alter).toBeDefined();
      for (const col of [
        '"release_item_id"',
        '"release_manifest_digest"',
        '"evidence_digest"',
        '"policy_status"',
        '"preflight_status"',
        '"idempotency_key"',
        '"cancellation_reason"',
        '"superseded_by_batch_id"',
      ]) {
        expect(alter).toContain(col);
      }
    });

    it('creates the partial unique index on idempotency_key', async () => {
      await migration.up(queryRunner as unknown as QueryRunner);
      const calls: string[] = queryRunner.query.mock.calls.map((c: [string]) => c[0]);
      const idx = calls.find(q => q.includes('uq_import_batch_idempotency_key'));
      expect(idx).toBeDefined();
      expect(idx).toContain('WHERE "idempotency_key" IS NOT NULL');
    });

    it('creates the release_item_id index', async () => {
      await migration.up(queryRunner as unknown as QueryRunner);
      const calls: string[] = queryRunner.query.mock.calls.map((c: [string]) => c[0]);
      expect(calls.some(q => q.includes('idx_import_batch_release_item'))).toBe(true);
    });
  });

  describe('down()', () => {
    it('refuses when any batch already uses the release gate or new lifecycle statuses', async () => {
      queryRunner.query.mockResolvedValue([{ count: '2' }]);
      await expect(migration.down(queryRunner as unknown as QueryRunner)).rejects.toThrow(/refused/);
    });

    it('drops the columns and indexes when count is 0', async () => {
      queryRunner.query.mockResolvedValueOnce([{ count: '0' }]).mockResolvedValue(undefined);
      await migration.down(queryRunner as unknown as QueryRunner);
      const calls: string[] = queryRunner.query.mock.calls.slice(1).map((c: [string]) => c[0]);
      expect(calls.some(q => q.includes('DROP INDEX IF EXISTS "idx_import_batch_release_item"'))).toBe(true);
      expect(calls.some(q => q.includes('DROP INDEX IF EXISTS "uq_import_batch_idempotency_key"'))).toBe(true);
      expect(calls.some(q => q.includes('DROP COLUMN IF EXISTS "release_item_id"'))).toBe(true);
      expect(calls.some(q => q.includes('DROP COLUMN IF EXISTS "superseded_by_batch_id"'))).toBe(true);
    });
  });
});
