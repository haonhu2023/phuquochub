import { AddNeedsChangesRevisionStatus1720005100000 } from '../1720005100000-AddNeedsChangesRevisionStatus';
import type { QueryRunner } from 'typeorm';

function recordingRunner() {
  const calls: Array<{ sql: string; params?: unknown[] }> = [];
  const qr = {
    query: (sql: string, params?: unknown[]) => (calls.push({ sql, params }), Promise.resolve()),
  } as QueryRunner;
  return { qr, calls };
}

describe('AddNeedsChangesRevisionStatus migration (human-translation-review, 2026-09-04)', () => {
  it('up: adds needs_changes to revision_status idempotently, touches nothing else', async () => {
    const { qr, calls } = recordingRunner();
    await new AddNeedsChangesRevisionStatus1720005100000().up(qr);

    expect(calls).toHaveLength(1);
    expect(calls[0].sql).toContain(`ALTER TYPE "revision_status" ADD VALUE IF NOT EXISTS 'needs_changes'`);
  });

  it('down: no-op — never attempts to remove the enum value', async () => {
    const { calls } = recordingRunner();
    await new AddNeedsChangesRevisionStatus1720005100000().down();

    expect(calls).toHaveLength(0);
  });
});
