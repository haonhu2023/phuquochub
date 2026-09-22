import { AddGuideArticleRevisionEntityType1720005900000 } from '../1720005900000-AddGuideArticleRevisionEntityType';
import type { QueryRunner } from 'typeorm';

function recordingRunner() {
  const calls: Array<{ sql: string; params?: unknown[] }> = [];
  const qr = {
    query: (sql: string, params?: unknown[]) => (calls.push({ sql, params }), Promise.resolve()),
  } as QueryRunner;
  return { qr, calls };
}

describe('AddGuideArticleRevisionEntityType migration (Guide CMS candidate, 2026-09-18)', () => {
  it('up: adds guide_article to revision_entity_type idempotently, touches nothing else', async () => {
    const { qr, calls } = recordingRunner();
    await new AddGuideArticleRevisionEntityType1720005900000().up(qr);

    expect(calls).toHaveLength(1);
    expect(calls[0].sql).toContain(`ALTER TYPE "revision_entity_type" ADD VALUE IF NOT EXISTS 'guide_article'`);
  });

  it('down: no-op — never attempts to remove the enum value', async () => {
    const { calls } = recordingRunner();
    await new AddGuideArticleRevisionEntityType1720005900000().down();

    expect(calls).toHaveLength(0);
  });
});
