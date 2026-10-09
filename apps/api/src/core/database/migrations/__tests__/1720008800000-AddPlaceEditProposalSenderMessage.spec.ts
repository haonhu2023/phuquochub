import { AddPlaceEditProposalSenderMessage1720008800000 } from '../1720008800000-AddPlaceEditProposalSenderMessage';
import type { QueryRunner } from 'typeorm';

function recordingRunner() {
  const calls: Array<{ sql: string; params?: unknown[] }> = [];
  const qr = {
    query: (sql: string, params?: unknown[]) => (calls.push({ sql, params }), Promise.resolve()),
  } as QueryRunner;
  return { qr, calls };
}

describe('AddPlaceEditProposalSenderMessage migration (phản hồi public cho người gửi góp ý)', () => {
  it('up: thêm cột sender_message NULLABLE vào place_edit_proposals', async () => {
    const { qr, calls } = recordingRunner();
    await new AddPlaceEditProposalSenderMessage1720008800000().up(qr);

    const sqls = calls.map((c) => c.sql);
    expect(sqls.some((s) => s.includes('ALTER TABLE "place_edit_proposals"') && s.includes('ADD COLUMN "sender_message" varchar(1000) NULL'))).toBe(true);
  });

  it('down: gỡ cột sender_message', async () => {
    const { qr, calls } = recordingRunner();
    await new AddPlaceEditProposalSenderMessage1720008800000().down(qr);

    const sqls = calls.map((c) => c.sql);
    expect(sqls.some((s) => s.includes('DROP COLUMN IF EXISTS "sender_message"'))).toBe(true);
  });
});
