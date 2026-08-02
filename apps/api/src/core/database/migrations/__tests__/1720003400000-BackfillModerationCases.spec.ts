import { BackfillModerationCases1720003400000 } from '../1720003400000-BackfillModerationCases';
import type { QueryRunner } from 'typeorm';

function sql(query: string): string {
  return query.replace(/\s+/g, ' ').trim();
}

describe('BackfillModerationCases migration (Moderation Foundation, M3 — D14/O7)', () => {
  let logSpy: jest.SpyInstance;

  beforeEach(() => {
    logSpy = jest.spyOn(console, 'log').mockImplementation();
  });

  afterEach(() => {
    logSpy.mockRestore();
  });

  function runnerForUp(candidateCount: string, createdRows: Array<{ id: string }>) {
    const calls: Array<{ sql: string; params?: unknown[] }> = [];
    let call = 0;
    const qr = {
      query: (query: string, params?: unknown[]) => {
        calls.push({ sql: query, params });
        call++;
        if (call === 1) return Promise.resolve([{ count: candidateCount }]); // MR-1 count
        if (call === 2) return Promise.resolve(createdRows); // INSERT ... RETURNING
        return Promise.resolve(); // audit insert
      },
    } as unknown as QueryRunner;
    return { qr, calls };
  }

  it('up: đếm ứng viên TRƯỚC khi ghi (MR-1) — đúng 3 điều kiện D14', async () => {
    const { qr, calls } = runnerForUp('0', []);
    await new BackfillModerationCases1720003400000().up(qr);

    const countSql = sql(calls[0].sql);
    expect(countSql).toContain("\"status\" = 'pending'");
    expect(countSql).toContain('"review_id" IS NOT NULL');
    expect(countSql).toContain('"deleted_at" IS NULL');
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('0 media row(s) eligible'));
  });

  it('up: INSERT đúng nguồn/severity/priority (source=new_content, severity=normal, priority=10), report_count=0', async () => {
    const { qr, calls } = runnerForUp('5', [{ id: 'c1' }]);
    await new BackfillModerationCases1720003400000().up(qr);

    const insertSql = sql(calls[1].sql);
    expect(insertSql).toContain("SELECT 'media', m.\"id\", 'open', 'new_content', 'normal', 10, 0");
    expect(insertSql).toContain('FROM "media" m');
    expect(insertSql).toContain("m.\"status\" = 'pending'");
    expect(insertSql).toContain('m."review_id" IS NOT NULL');
    expect(insertSql).toContain('m."deleted_at" IS NULL');
  });

  it('up: KHÔNG có lệnh UPDATE "media" nào ở bất kỳ câu SQL nào (O7 — không publish hàng loạt)', async () => {
    const { qr, calls } = runnerForUp('5', [{ id: 'c1' }]);
    await new BackfillModerationCases1720003400000().up(qr);

    const all = calls.map((c) => sql(c.sql)).join('\n');
    expect(all).not.toMatch(/UPDATE\s+"?media"?/i);
  });

  it('up: ON CONFLICT DO NOTHING (idempotent, khớp partial unique index D8), KHÔNG chỉ định target tường minh (đúng T4)', async () => {
    const { qr, calls } = runnerForUp('5', [{ id: 'c1' }]);
    await new BackfillModerationCases1720003400000().up(qr);

    const insertSql = sql(calls[1].sql);
    expect(insertSql).toContain('ON CONFLICT DO NOTHING');
    expect(insertSql).toContain('RETURNING "id"');
  });

  it('up: ghi đúng MỘT dòng audit tổng hợp moderation.backfilled kèm candidate_count/created_count', async () => {
    const { qr, calls } = runnerForUp('5', [{ id: 'c1' }, { id: 'c2' }]);
    await new BackfillModerationCases1720003400000().up(qr);

    const auditCall = calls[2];
    expect(sql(auditCall.sql)).toContain('INSERT INTO "audit_logs"');
    expect(auditCall.params).toEqual([
      'moderation.backfilled',
      'media',
      true,
      'success',
      JSON.stringify({ candidate_count: 5, created_count: 2 }),
    ]);
  });

  it('down: KHÔNG có case backfill nào đã resolved/dismissed -> xoá đúng source=new_content AND status=open AND report_count=0, và dòng audit', async () => {
    const calls: Array<{ sql: string }> = [];
    const runner = {
      query: jest.fn().mockImplementation((query: string) => {
        if (query.includes('SELECT count(*)')) return Promise.resolve([{ count: '0' }]);
        calls.push({ sql: query });
        return Promise.resolve();
      }),
    } as unknown as QueryRunner;

    await new BackfillModerationCases1720003400000().down(runner);

    const all = calls.map((c) => sql(c.sql)).join('\n');
    expect(all).toContain('DELETE FROM "moderation_cases"');
    expect(all).toContain("\"source\" = 'new_content' AND \"status\" = 'open' AND \"report_count\" = 0");
    expect(all).toContain("DELETE FROM \"audit_logs\" WHERE \"event\" = 'moderation.backfilled'");
  });

  it('down: CÓ case backfill đã resolved/dismissed -> TỪ CHỐI (ném lỗi), không DELETE gì cả (MR-5)', async () => {
    const deleteCalls: string[] = [];
    const runner = {
      query: jest.fn().mockImplementation((query: string) => {
        if (query.includes('SELECT count(*)')) return Promise.resolve([{ count: '2' }]);
        deleteCalls.push(query);
        return Promise.resolve();
      }),
    } as unknown as QueryRunner;

    await expect(new BackfillModerationCases1720003400000().down(runner)).rejects.toThrow(/refused.*2 backfilled case/i);
    expect(deleteCalls).toHaveLength(0);
  });
});
