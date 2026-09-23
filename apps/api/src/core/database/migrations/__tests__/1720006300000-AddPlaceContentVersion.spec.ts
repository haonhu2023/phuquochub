import { AddPlaceContentVersion1720006300000 } from '../1720006300000-AddPlaceContentVersion';
import type { QueryRunner } from 'typeorm';

function recordingRunner() {
  const calls: Array<{ sql: string; params?: unknown[] }> = [];
  const qr = {
    query: (sql: string, params?: unknown[]) => (calls.push({ sql, params }), Promise.resolve()),
  } as QueryRunner;
  return { qr, calls };
}

describe('AddPlaceContentVersion migration (launch-readiness, 2026-09-22)', () => {
  it('up: adds content_version as NOT NULL with a constant default — catalog-only, no backfill', async () => {
    const { qr, calls } = recordingRunner();
    await new AddPlaceContentVersion1720006300000().up(qr);

    expect(calls).toHaveLength(1);
    expect(calls[0].sql).toContain('ALTER TABLE "places" ADD COLUMN "content_version" integer NOT NULL DEFAULT 1');
  });

  it('down: drops the column — reverting only removes CAS protection, no data loss elsewhere', async () => {
    const { qr, calls } = recordingRunner();
    await new AddPlaceContentVersion1720006300000().down(qr);

    expect(calls).toHaveLength(1);
    expect(calls[0].sql).toContain('ALTER TABLE "places" DROP COLUMN "content_version"');
  });
});
