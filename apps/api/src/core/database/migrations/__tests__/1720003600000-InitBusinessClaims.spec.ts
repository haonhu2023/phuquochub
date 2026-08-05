import { InitBusinessClaims1720003600000 } from '../1720003600000-InitBusinessClaims';
import type { QueryRunner } from 'typeorm';

// Test cấu trúc migration (không cần DB) — cùng recordingRunner đã dùng cho InitModeration.spec.ts.
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

describe('InitBusinessClaims migration (ADR-015)', () => {
  it('up: tạo 3 enum type + 2 bảng mới', async () => {
    const { qr, calls } = recordingRunner();
    await new InitBusinessClaims1720003600000().up(qr);

    const all = sqlOf(calls);
    expect(all).toContain('CREATE TYPE "business_claim_status"');
    expect(all).toContain('CREATE TYPE "business_claim_reason_code"');
    expect(all).toContain('CREATE TYPE "business_member_role"');
    expect(all).toContain('CREATE TABLE "business_claims"');
    expect(all).toContain('CREATE TABLE "business_members"');
  });

  it('up: business_claim_status đúng 5 giá trị (business.md §4)', async () => {
    const { qr, calls } = recordingRunner();
    await new InitBusinessClaims1720003600000().up(qr);

    const sql = calls.find((c) => c.sql.includes('CREATE TYPE "business_claim_status"'))!.sql;
    expect(sql).toContain("'pending','approved','rejected','disputed','withdrawn'");
  });

  it('up: business_claims.place_id FK CASCADE tới places; requester_id/reviewer_id FK NO ACTION tới users', async () => {
    const { qr, calls } = recordingRunner();
    await new InitBusinessClaims1720003600000().up(qr);

    const sql = calls.find((c) => c.sql.includes('CREATE TABLE "business_claims"'))!.sql.replace(/\s+/g, ' ');
    expect(sql).toContain('"place_id" uuid NOT NULL REFERENCES "places"("id") ON DELETE CASCADE');
    expect(sql).toContain('"requester_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE NO ACTION');
    expect(sql).toContain('"reviewer_id" uuid REFERENCES "users"("id") ON DELETE NO ACTION');
    expect(sql).toContain(`"status" "business_claim_status" NOT NULL DEFAULT 'pending'`);
  });

  it('up: CHECK cưỡng chế reason_code bắt buộc khi rejected', async () => {
    const { qr, calls } = recordingRunner();
    await new InitBusinessClaims1720003600000().up(qr);

    const sql = calls.find((c) => c.sql.includes('CREATE TABLE "business_claims"'))!.sql.replace(/\s+/g, ' ');
    expect(sql).toContain(`CHECK ("status" <> 'rejected' OR "reason_code" IS NOT NULL)`);
  });

  it('up: uq_claim_pending đúng cột + WHERE status=pending (chống spam claim trùng)', async () => {
    const { qr, calls } = recordingRunner();
    await new InitBusinessClaims1720003600000().up(qr);

    const sql = calls.find((c) => c.sql.includes('uq_claim_pending'))!.sql.replace(/\s+/g, ' ');
    expect(sql).toContain(
      'CREATE UNIQUE INDEX "uq_claim_pending" ON "business_claims" ("place_id","requester_id")',
    );
    expect(sql).toContain(`WHERE "status" = 'pending'`);
  });

  it('up: business_members.place_id/user_id FK CASCADE; claim_id/granted_by FK NO ACTION', async () => {
    const { qr, calls } = recordingRunner();
    await new InitBusinessClaims1720003600000().up(qr);

    const sql = calls.find((c) => c.sql.includes('CREATE TABLE "business_members"'))!.sql.replace(/\s+/g, ' ');
    expect(sql).toContain('"place_id" uuid NOT NULL REFERENCES "places"("id") ON DELETE CASCADE');
    expect(sql).toContain('"user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE');
    expect(sql).toContain('"claim_id" uuid REFERENCES "business_claims"("id") ON DELETE NO ACTION');
    expect(sql).toContain('"granted_by" uuid REFERENCES "users"("id") ON DELETE NO ACTION');
  });

  it('up: uq_member_owner đúng cột + WHERE role=owner AND revoked_at IS NULL (BR-B2)', async () => {
    const { qr, calls } = recordingRunner();
    await new InitBusinessClaims1720003600000().up(qr);

    const sql = calls.find((c) => c.sql.includes('uq_member_owner'))!.sql.replace(/\s+/g, ' ');
    expect(sql).toContain('CREATE UNIQUE INDEX "uq_member_owner" ON "business_members" ("place_id")');
    expect(sql).toContain(`WHERE "role" = 'owner' AND "revoked_at" IS NULL`);
  });

  it('up: uq_member_active đúng cột + WHERE revoked_at IS NULL (một vai trò hiệu lực/người/cơ sở)', async () => {
    const { qr, calls } = recordingRunner();
    await new InitBusinessClaims1720003600000().up(qr);

    const sql = calls.find((c) => c.sql.includes('uq_member_active'))!.sql.replace(/\s+/g, ' ');
    expect(sql).toContain(
      'CREATE UNIQUE INDEX "uq_member_active" ON "business_members" ("place_id","user_id")',
    );
    expect(sql).toContain(`WHERE "revoked_at" IS NULL`);
  });

  it('down: KHÔNG có claim đã quyết định -> xoá 2 bảng + 3 enum type', async () => {
    const calls: Array<{ sql: string }> = [];
    const runner = {
      query: jest.fn().mockImplementation((sql: string) => {
        if (sql.includes('SELECT count(*)')) return Promise.resolve([{ count: '0' }]);
        calls.push({ sql });
        return Promise.resolve();
      }),
    } as unknown as QueryRunner;

    await new InitBusinessClaims1720003600000().down(runner);

    const all = calls.map((c) => c.sql).join('\n');
    expect(all).toContain('DROP TABLE IF EXISTS "business_members"');
    expect(all).toContain('DROP TABLE IF EXISTS "business_claims"');
    expect(all).toContain('DROP TYPE IF EXISTS "business_member_role"');
    expect(all).toContain('DROP TYPE IF EXISTS "business_claim_reason_code"');
    expect(all).toContain('DROP TYPE IF EXISTS "business_claim_status"');
  });

  it('down: CÓ claim đã quyết định (decided_at NOT NULL) -> TỪ CHỐI, không DROP gì cả', async () => {
    const dropCalls: string[] = [];
    const runner = {
      query: jest.fn().mockImplementation((sql: string) => {
        if (sql.includes('SELECT count(*)')) return Promise.resolve([{ count: '2' }]);
        dropCalls.push(sql);
        return Promise.resolve();
      }),
    } as unknown as QueryRunner;

    await expect(new InitBusinessClaims1720003600000().down(runner)).rejects.toThrow(
      /refused.*2 claim/i,
    );
    expect(dropCalls).toHaveLength(0);
  });
});
