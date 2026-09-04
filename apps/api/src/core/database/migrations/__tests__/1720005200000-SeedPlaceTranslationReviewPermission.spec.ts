import { SeedPlaceTranslationReviewPermission1720005200000 } from '../1720005200000-SeedPlaceTranslationReviewPermission';
import type { QueryRunner } from 'typeorm';

function recordingRunner() {
  const calls: Array<{ sql: string; params?: unknown[] }> = [];
  const qr = {
    query: (sql: string, params?: unknown[]) => (calls.push({ sql, params }), Promise.resolve()),
  } as QueryRunner;
  return { qr, calls };
}

function sqlOf(calls: Array<{ sql: string }>): string {
  return calls.map((c) => c.sql).join('\n').replace(/\s+/g, ' ');
}

describe('SeedPlaceTranslationReviewPermission migration (human-translation-review, 2026-09-04)', () => {
  it('up: seeds exactly one PlaceTranslation.Review.Any permission', async () => {
    const { qr, calls } = recordingRunner();
    await new SeedPlaceTranslationReviewPermission1720005200000().up(qr);

    const all = sqlOf(calls);
    expect(all).toContain(`('PlaceTranslation.Review.Any','PlaceTranslation','Review','Any')`);
    expect(all).toContain('ON CONFLICT ("code") DO NOTHING');
  });

  it('up: grants ONLY moderator, not administrator/contributor/business roles explicitly', async () => {
    const { qr, calls } = recordingRunner();
    await new SeedPlaceTranslationReviewPermission1720005200000().up(qr);

    const grantCalls = calls.filter((c) => c.sql.includes('INSERT INTO "role_permissions"'));
    expect(grantCalls).toHaveLength(1);
    const sql = grantCalls[0].sql.replace(/\s+/g, ' ');
    expect(sql).toContain(`p.code = 'PlaceTranslation.Review.Any'`);
    expect(sql).toContain(`r.code = 'moderator'`);
    expect(sql).toContain('ON CONFLICT ("role_id","permission_id") DO NOTHING');
    expect(sql).not.toContain('administrator');
    expect(sql).not.toContain('contributor');
    expect(sql).not.toContain('business_owner');
  });

  it('down: deletes exactly the new permission', async () => {
    const { qr, calls } = recordingRunner();
    await new SeedPlaceTranslationReviewPermission1720005200000().down(qr);

    const sql = sqlOf(calls);
    expect(sql).toContain(`DELETE FROM "permissions" WHERE "code" = 'PlaceTranslation.Review.Any'`);
  });
});
