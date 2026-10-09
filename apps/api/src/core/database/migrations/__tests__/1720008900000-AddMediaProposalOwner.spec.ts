import { AddMediaProposalOwner1720008900000 } from '../1720008900000-AddMediaProposalOwner';
import type { QueryRunner } from 'typeorm';

function recordingRunner(queryResults: unknown[] = []) {
  const calls: Array<{ sql: string; params?: unknown[] }> = [];
  let i = 0;
  const qr = {
    query: (sql: string, params?: unknown[]) => {
      calls.push({ sql, params });
      return Promise.resolve(queryResults[i++]);
    },
  } as QueryRunner;
  return { qr, calls };
}

describe('AddMediaProposalOwner migration ("ảnh góp ý qua media moderation")', () => {
  it('up: thêm cột proposal_id (FK place_edit_proposals) rồi sửa lại CHECK constraint để cộng thêm nhánh thứ 6', async () => {
    const { qr, calls } = recordingRunner();
    await new AddMediaProposalOwner1720008900000().up(qr);

    const sqls = calls.map((c) => c.sql);
    expect(sqls.some((s) => s.includes('ADD COLUMN "proposal_id"') && s.includes('REFERENCES "place_edit_proposals"("id") ON DELETE CASCADE'))).toBe(true);
    expect(sqls.some((s) => s.includes('DROP CONSTRAINT "chk_media_at_most_one_owner"'))).toBe(true);
    const addConstraint = sqls.find((s) => s.includes('ADD CONSTRAINT "chk_media_at_most_one_owner"'));
    expect(addConstraint).toBeDefined();
    expect(addConstraint).toContain('"proposal_id" IS NOT NULL');
    expect(addConstraint).toContain('<= 1');
  });

  it('down: không có hàng nào dùng proposal_id → phục hồi CHECK constraint 5 nhánh rồi gỡ cột', async () => {
    const { qr, calls } = recordingRunner([[{ count: '0' }]]);
    await new AddMediaProposalOwner1720008900000().down(qr);

    const sqls = calls.map((c) => c.sql);
    expect(sqls.some((s) => s.includes('SELECT count(*)'))).toBe(true);
    const restoredConstraint = sqls.find((s) => s.includes('ADD CONSTRAINT "chk_media_at_most_one_owner"'));
    expect(restoredConstraint).toBeDefined();
    expect(restoredConstraint).not.toContain('proposal_id');
    expect(sqls.some((s) => s.includes('DROP COLUMN IF EXISTS "proposal_id"'))).toBe(true);
  });

  it('down: CÓ hàng dùng proposal_id → từ chối (throw), KHÔNG gỡ cột hay sửa constraint (không âm thầm mất dữ liệu)', async () => {
    const { qr, calls } = recordingRunner([[{ count: '2' }]]);

    await expect(new AddMediaProposalOwner1720008900000().down(qr)).rejects.toThrow(/refused/i);

    const sqls = calls.map((c) => c.sql);
    expect(sqls.some((s) => s.includes('DROP COLUMN'))).toBe(false);
    expect(sqls.some((s) => s.includes('DROP CONSTRAINT'))).toBe(false);
  });
});
