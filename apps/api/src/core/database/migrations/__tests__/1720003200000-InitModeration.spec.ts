import { InitModeration1720003200000 } from '../1720003200000-InitModeration';
import type { QueryRunner } from 'typeorm';

// Test cấu trúc migration (không cần DB) — cùng recordingRunner đã dùng cho InitBooking.spec.ts.
// Chỉ dùng cho up() (không có SELECT nào cần kết quả trả về). down() tự dựng runner riêng bên
// dưới vì nó cần SELECT count(*) trả về một giá trị cụ thể trước khi quyết định có DROP hay không.
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

describe('InitModeration migration (Moderation Foundation, M1)', () => {
  it('up: tạo 7 enum type + 2 bảng mới', async () => {
    const { qr, calls } = recordingRunner();
    await new InitModeration1720003200000().up(qr);

    const all = sqlOf(calls);
    expect(all).toContain('CREATE TYPE "moderation_target_type"');
    expect(all).toContain('CREATE TYPE "moderation_case_status"');
    expect(all).toContain('CREATE TYPE "moderation_case_source"');
    expect(all).toContain('CREATE TYPE "moderation_case_severity"');
    expect(all).toContain('CREATE TYPE "moderation_decision"');
    expect(all).toContain('CREATE TYPE "report_reason"');
    expect(all).toContain('CREATE TYPE "report_status"');
    expect(all).toContain('CREATE TABLE "moderation_cases"');
    expect(all).toContain('CREATE TABLE "reports"');
  });

  it('up: moderation_target_type đúng 3 giá trị review/media/place (khớp design §6.1)', async () => {
    const { qr, calls } = recordingRunner();
    await new InitModeration1720003200000().up(qr);

    const sql = calls.find((c) => c.sql.includes('CREATE TYPE "moderation_target_type"'))!.sql;
    expect(sql).toContain("'review','media','place'");
  });

  it('up: moderation_cases KHÔNG có cột nào cho trạng thái hiển thị nội dung (INV-2)', async () => {
    const { qr, calls } = recordingRunner();
    await new InitModeration1720003200000().up(qr);

    const sql = calls.find((c) => c.sql.includes('CREATE TABLE "moderation_cases"'))!.sql;
    expect(sql).not.toMatch(/"published"|"visible"|"content_status"/i);
  });

  it('up: moderation_cases.target_id KHÔNG có FK cứng (đa hình, ADR-018 D9); assigned_to/resolved_by CÓ FK tới users ON DELETE SET NULL', async () => {
    const { qr, calls } = recordingRunner();
    await new InitModeration1720003200000().up(qr);

    const sql = calls
      .find((c) => c.sql.includes('CREATE TABLE "moderation_cases"'))!
      .sql.replace(/\s+/g, ' ');
    expect(sql).toContain('"target_id" uuid NOT NULL,');
    expect(sql).not.toMatch(/"target_id"[^,]*REFERENCES/);
    expect(sql).toContain('"assigned_to" uuid REFERENCES "users"("id") ON DELETE SET NULL');
    expect(sql).toContain('"resolved_by" uuid REFERENCES "users"("id") ON DELETE SET NULL');
  });

  it('up: moderation_cases mặc định status=open, severity=low, priority=0, report_count=0', async () => {
    const { qr, calls } = recordingRunner();
    await new InitModeration1720003200000().up(qr);

    const sql = calls.find((c) => c.sql.includes('CREATE TABLE "moderation_cases"'))!.sql;
    expect(sql).toContain(`"status" "moderation_case_status" NOT NULL DEFAULT 'open'`);
    expect(sql).toContain(`"severity" "moderation_case_severity" NOT NULL DEFAULT 'low'`);
    expect(sql).toContain('"priority" smallint NOT NULL DEFAULT 0');
    expect(sql).toContain('"report_count" int NOT NULL DEFAULT 0');
  });

  it('up: partial unique index uq_moderation_cases_open_target đúng cột và WHERE (INV-3)', async () => {
    const { qr, calls } = recordingRunner();
    await new InitModeration1720003200000().up(qr);

    const sql = calls
      .find((c) => c.sql.includes('uq_moderation_cases_open_target'))!
      .sql.replace(/\s+/g, ' ');
    expect(sql).toContain(
      'CREATE UNIQUE INDEX "uq_moderation_cases_open_target" ON "moderation_cases" ("target_type","target_id")',
    );
    expect(sql).toContain(`WHERE "status" IN ('open','claimed')`);
  });

  it('up: index hàng chờ đúng thứ tự cột (priority DESC, report_count DESC, created_at ASC)', async () => {
    const { qr, calls } = recordingRunner();
    await new InitModeration1720003200000().up(qr);

    const sql = calls.find((c) => c.sql.includes('idx_moderation_cases_queue'))!.sql.replace(/\s+/g, ' ');
    expect(sql).toContain('("priority" DESC,"report_count" DESC,"created_at" ASC)');
    expect(sql).toContain(`WHERE "status" IN ('open','claimed')`);
  });

  it('up: reports.case_id FK THẬT + CASCADE tới moderation_cases; target_id KHÔNG FK', async () => {
    const { qr, calls } = recordingRunner();
    await new InitModeration1720003200000().up(qr);

    const sql = calls.find((c) => c.sql.includes('CREATE TABLE "reports"'))!.sql.replace(/\s+/g, ' ');
    expect(sql).toContain(
      '"case_id" uuid NOT NULL REFERENCES "moderation_cases"("id") ON DELETE CASCADE',
    );
    expect(sql).toContain('"reporter_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE');
    expect(sql).not.toMatch(/"target_id"[^,]*REFERENCES/);
  });

  it('up: uq_reports_one_per_reporter đúng 3 cột (chống report trùng, WF-12)', async () => {
    const { qr, calls } = recordingRunner();
    await new InitModeration1720003200000().up(qr);

    const sql = calls.find((c) => c.sql.includes('uq_reports_one_per_reporter'))!.sql;
    expect(sql).toContain(
      'CREATE UNIQUE INDEX "uq_reports_one_per_reporter" ON "reports" ("target_type","target_id","reporter_id")',
    );
  });

  it('down: KHÔNG có case resolved -> xoá 2 bảng + 7 enum type', async () => {
    const calls: Array<{ sql: string }> = [];
    const runner = {
      query: jest.fn().mockImplementation((sql: string) => {
        if (sql.includes('SELECT count(*)')) return Promise.resolve([{ count: '0' }]);
        calls.push({ sql });
        return Promise.resolve();
      }),
    } as unknown as QueryRunner;

    await new InitModeration1720003200000().down(runner);

    const all = calls.map((c) => c.sql).join('\n');
    expect(all).toContain('DROP TABLE IF EXISTS "reports"');
    expect(all).toContain('DROP TABLE IF EXISTS "moderation_cases"');
    expect(all).toContain('DROP TYPE IF EXISTS "report_status"');
    expect(all).toContain('DROP TYPE IF EXISTS "report_reason"');
    expect(all).toContain('DROP TYPE IF EXISTS "moderation_decision"');
    expect(all).toContain('DROP TYPE IF EXISTS "moderation_case_severity"');
    expect(all).toContain('DROP TYPE IF EXISTS "moderation_case_source"');
    expect(all).toContain('DROP TYPE IF EXISTS "moderation_case_status"');
    expect(all).toContain('DROP TYPE IF EXISTS "moderation_target_type"');
  });

  it('down: CÓ case resolved -> TỪ CHỐI (ném lỗi), không DROP gì cả (MR-5)', async () => {
    const dropCalls: string[] = [];
    const runner = {
      query: jest.fn().mockImplementation((sql: string) => {
        if (sql.includes('SELECT count(*)')) return Promise.resolve([{ count: '3' }]);
        dropCalls.push(sql);
        return Promise.resolve();
      }),
    } as unknown as QueryRunner;

    await expect(new InitModeration1720003200000().down(runner)).rejects.toThrow(
      /refused.*3 case/i,
    );
    expect(dropCalls).toHaveLength(0);
  });
});
