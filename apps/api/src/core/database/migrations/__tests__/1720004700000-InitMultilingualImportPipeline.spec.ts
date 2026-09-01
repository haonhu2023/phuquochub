import { QueryRunner } from 'typeorm';
import { InitMultilingualImportPipeline1720004700000 } from '../1720004700000-InitMultilingualImportPipeline';

// Migration unit tests — guard the down() safety gate without running a real DB.

describe('InitMultilingualImportPipeline1720004700000', () => {
  let migration: InitMultilingualImportPipeline1720004700000;
  let queryRunner: { query: jest.Mock };

  beforeEach(() => {
    migration = new InitMultilingualImportPipeline1720004700000();
    queryRunner = { query: jest.fn() };
  });

  it('has the correct migration name', () => {
    expect(migration.name).toBe('InitMultilingualImportPipeline1720004700000');
  });

  describe('up()', () => {
    it('creates both enums and both tables', async () => {
      await migration.up(queryRunner as unknown as QueryRunner);

      const calls: string[] = queryRunner.query.mock.calls.map((c: [string]) => c[0]);

      expect(calls.some(q => q.includes('multilingual_import_batch_status'))).toBe(true);
      expect(calls.some(q => q.includes('multilingual_import_row_outcome'))).toBe(true);
      expect(calls.some(q => q.includes('CREATE TABLE "multilingual_import_batches"'))).toBe(true);
      expect(calls.some(q => q.includes('CREATE TABLE "multilingual_import_rows"'))).toBe(true);
    });

    it('creates the unique index on batch_id', async () => {
      await migration.up(queryRunner as unknown as QueryRunner);
      const calls: string[] = queryRunner.query.mock.calls.map((c: [string]) => c[0]);
      expect(calls.some(q => q.includes('uq_import_batch_id'))).toBe(true);
    });

    it('creates the partial unique index on source_checksum WHERE status=succeeded', async () => {
      await migration.up(queryRunner as unknown as QueryRunner);
      const calls: string[] = queryRunner.query.mock.calls.map((c: [string]) => c[0]);
      expect(calls.some(q => q.includes('uq_import_batch_source_checksum_succeeded') && q.includes("'succeeded'"))).toBe(true);
    });

    it('creates FK from multilingual_import_rows to multilingual_import_batches', async () => {
      await migration.up(queryRunner as unknown as QueryRunner);
      const calls: string[] = queryRunner.query.mock.calls.map((c: [string]) => c[0]);
      const rowsTable = calls.find(q => q.includes('CREATE TABLE "multilingual_import_rows"'));
      expect(rowsTable).toBeDefined();
      expect(rowsTable).toContain('REFERENCES "multilingual_import_batches"');
    });
  });

  describe('down()', () => {
    it('refuses to drop tables when batch records exist', async () => {
      queryRunner.query.mockResolvedValue([{ count: '5' }]);
      await expect(migration.down(queryRunner as unknown as QueryRunner)).rejects.toThrow(/refused/);
    });

    it('refuses when count is "1"', async () => {
      queryRunner.query.mockResolvedValue([{ count: '1' }]);
      await expect(migration.down(queryRunner as unknown as QueryRunner)).rejects.toThrow();
    });

    it('drops tables and enums when count is 0', async () => {
      queryRunner.query
        .mockResolvedValueOnce([{ count: '0' }]) // COUNT check
        .mockResolvedValue(undefined);           // subsequent DROPs

      await migration.down(queryRunner as unknown as QueryRunner);

      const calls: string[] = queryRunner.query.mock.calls.slice(1).map((c: [string]) => c[0]);
      expect(calls.some(q => q.includes('DROP TABLE IF EXISTS "multilingual_import_rows"'))).toBe(true);
      expect(calls.some(q => q.includes('DROP TABLE IF EXISTS "multilingual_import_batches"'))).toBe(true);
      expect(calls.some(q => q.includes('DROP TYPE IF EXISTS "multilingual_import_row_outcome"'))).toBe(true);
      expect(calls.some(q => q.includes('DROP TYPE IF EXISTS "multilingual_import_batch_status"'))).toBe(true);
    });
  });
});
