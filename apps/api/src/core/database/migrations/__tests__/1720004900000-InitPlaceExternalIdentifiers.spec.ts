import { QueryRunner } from 'typeorm';
import { InitPlaceExternalIdentifiers1720004900000 } from '../1720004900000-InitPlaceExternalIdentifiers';

describe('InitPlaceExternalIdentifiers1720004900000', () => {
  let migration: InitPlaceExternalIdentifiers1720004900000;
  let queryRunner: { query: jest.Mock };

  beforeEach(() => {
    migration = new InitPlaceExternalIdentifiers1720004900000();
    queryRunner = { query: jest.fn() };
  });

  it('has the correct migration name', () => {
    expect(migration.name).toBe('InitPlaceExternalIdentifiers1720004900000');
  });

  describe('up()', () => {
    it('creates the provider enum with GOOGLE_PLACES', async () => {
      await migration.up(queryRunner as unknown as QueryRunner);
      const calls: string[] = queryRunner.query.mock.calls.map((c: [string]) => c[0]);
      const enumCall = calls.find(q => q.includes('CREATE TYPE "place_external_identifier_provider"'));
      expect(enumCall).toBeDefined();
      expect(enumCall).toContain("'GOOGLE_PLACES'");
    });

    it('creates the table with place_id FK, cascade delete, and no Google Place ID as primary key', async () => {
      await migration.up(queryRunner as unknown as QueryRunner);
      const calls: string[] = queryRunner.query.mock.calls.map((c: [string]) => c[0]);
      const table = calls.find(q => q.includes('CREATE TABLE "place_external_identifiers"'));
      expect(table).toBeDefined();
      expect(table).toContain('"id"           UUID PRIMARY KEY');
      expect(table).toContain('REFERENCES "places" ("id") ON DELETE CASCADE');
      expect(table).not.toMatch(/"external_id"[^,]*PRIMARY KEY/);
    });

    it('creates the unique (provider, external_id) index', async () => {
      await migration.up(queryRunner as unknown as QueryRunner);
      const calls: string[] = queryRunner.query.mock.calls.map((c: [string]) => c[0]);
      const idx = calls.find(q => q.includes('uq_place_ext_id_provider_external_id'));
      expect(idx).toBeDefined();
      expect(idx).toContain('("provider", "external_id")');
    });

    it('creates the place_id and provider indexes', async () => {
      await migration.up(queryRunner as unknown as QueryRunner);
      const calls: string[] = queryRunner.query.mock.calls.map((c: [string]) => c[0]);
      expect(calls.some(q => q.includes('idx_place_ext_id_place'))).toBe(true);
      expect(calls.some(q => q.includes('idx_place_ext_id_provider'))).toBe(true);
    });
  });

  describe('down()', () => {
    it('refuses to drop when identifiers exist', async () => {
      queryRunner.query.mockResolvedValue([{ count: '3' }]);
      await expect(migration.down(queryRunner as unknown as QueryRunner)).rejects.toThrow(/refused/);
    });

    it('drops table and enum when count is 0', async () => {
      queryRunner.query.mockResolvedValueOnce([{ count: '0' }]).mockResolvedValue(undefined);
      await migration.down(queryRunner as unknown as QueryRunner);
      const calls: string[] = queryRunner.query.mock.calls.slice(1).map((c: [string]) => c[0]);
      expect(calls.some(q => q.includes('DROP TABLE IF EXISTS "place_external_identifiers"'))).toBe(true);
      expect(calls.some(q => q.includes('DROP TYPE IF EXISTS "place_external_identifier_provider"'))).toBe(true);
    });
  });
});
