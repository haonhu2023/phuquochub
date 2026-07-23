import { InitAuditLogs1720001500000 } from '../1720001500000-InitAuditLogs';
import type { QueryRunner } from 'typeorm';

// Migration test cấu trúc (không cần DB): xác nhận SQL khớp schema audit_logs (data-dictionary §10).
function recordingRunner() {
  const queries: string[] = [];
  const qr = { query: (sql: string) => (queries.push(sql), Promise.resolve()) } as QueryRunner;
  return { qr, queries };
}

describe('InitAuditLogs migration', () => {
  it('up: tạo enum audit_result + bảng audit_logs với đủ cột + 4 index', async () => {
    const { qr, queries } = recordingRunner();
    await new InitAuditLogs1720001500000().up(qr);
    const all = queries.join('\n');

    expect(all).toContain('CREATE TYPE "audit_result" AS ENUM');
    expect(all).toContain('CREATE TABLE "audit_logs"');
    for (const col of [
      'event',
      'actor_id',
      'actor_role',
      'is_service_account',
      'permission',
      'scope',
      'entity_type',
      'entity_id',
      'result',
      'ip',
      'user_agent',
      'before',
      'after',
      'context',
      'correlation_id',
      'created_at',
    ]) {
      expect(all).toContain(`"${col}"`);
    }
    expect(all).toContain('idx_audit_entity');
    expect(all).toContain('idx_audit_actor');
    expect(all).toContain('idx_audit_event');
    expect(all).toContain('idx_audit_correlation');
    expect(all).toContain('WHERE "correlation_id" IS NOT NULL'); // partial index
    expect(all).not.toContain('updated_at'); // append-only: chỉ created_at
  });

  it('down: drop bảng + enum (revert sạch)', async () => {
    const { qr, queries } = recordingRunner();
    await new InitAuditLogs1720001500000().down(qr);
    const all = queries.join('\n');
    expect(all).toContain('DROP TABLE IF EXISTS "audit_logs"');
    expect(all).toContain('DROP TYPE IF EXISTS "audit_result"');
  });
});
