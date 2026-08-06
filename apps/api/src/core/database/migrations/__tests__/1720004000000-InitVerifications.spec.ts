import { InitVerifications1720004000000 } from '../1720004000000-InitVerifications';
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

describe('InitVerifications migration (ADR-008)', () => {
  it('up: tạo 3 enum type MỚI + 3 bảng — KHÔNG tạo lại verification_status (dùng chung InitPlaces)', async () => {
    const { qr, calls } = recordingRunner();
    await new InitVerifications1720004000000().up(qr);

    const all = sqlOf(calls);
    expect(all).toContain('CREATE TYPE "verification_method"');
    expect(all).toContain('CREATE TYPE "verification_reason_code"');
    expect(all).toContain('CREATE TYPE "verification_vote_choice"');
    expect(all).not.toContain('CREATE TYPE "verification_status"');
    expect(all).toContain('CREATE TABLE "verifications"');
    expect(all).toContain('CREATE TABLE "verification_events"');
    expect(all).toContain('CREATE TABLE "verification_votes"');
  });

  it('up: verification_method đúng 5 giá trị, verification_reason_code đúng 7 giá trị (§4.1)', async () => {
    const { qr, calls } = recordingRunner();
    await new InitVerifications1720004000000().up(qr);

    const method = calls.find((c) => c.sql.includes('CREATE TYPE "verification_method"'))!.sql;
    expect(method).toContain("'moderator','owner_claim','source_match','community_vote','system_auto'");

    const reason = calls.find((c) => c.sql.includes('CREATE TYPE "verification_reason_code"'))!.sql;
    expect(reason).toContain(
      "'duplicate','fabricated','outdated','insufficient_evidence','policy_violation','wrong_target','other'",
    );
  });

  it('up: verifications.status dùng ĐÚNG type "verification_status" (dùng chung places/contacts/price_history)', async () => {
    const { qr, calls } = recordingRunner();
    await new InitVerifications1720004000000().up(qr);

    const sql = calls.find((c) => c.sql.includes('CREATE TABLE "verifications"'))!.sql.replace(/\s+/g, ' ');
    expect(sql).toContain(`"status" "verification_status" NOT NULL DEFAULT 'pending'`);
  });

  it('up: verifications — 3 cột FK target CASCADE tới places/contacts/price_history (exclusive arc)', async () => {
    const { qr, calls } = recordingRunner();
    await new InitVerifications1720004000000().up(qr);

    const sql = calls.find((c) => c.sql.includes('CREATE TABLE "verifications"'))!.sql.replace(/\s+/g, ' ');
    expect(sql).toContain('"place_id" uuid REFERENCES "places"("id") ON DELETE CASCADE');
    expect(sql).toContain('"contact_id" uuid REFERENCES "contacts"("id") ON DELETE CASCADE');
    expect(sql).toContain('"price_history_id" uuid REFERENCES "price_history"("id") ON DELETE CASCADE');
  });

  it('up: CHECK exclusive arc đúng-một target, official cần source_id, rejected cần reason_code, confidence 0-100', async () => {
    const { qr, calls } = recordingRunner();
    await new InitVerifications1720004000000().up(qr);

    const sql = calls.find((c) => c.sql.includes('CREATE TABLE "verifications"'))!.sql.replace(/\s+/g, ' ');
    expect(sql).toContain('CONSTRAINT "ck_verif_one_target" CHECK');
    expect(sql).toContain('("place_id" IS NOT NULL)::int');
    expect(sql).toContain('("contact_id" IS NOT NULL)::int');
    expect(sql).toContain('("price_history_id" IS NOT NULL)::int');
    expect(sql).toContain(`CONSTRAINT "ck_verif_official_source" CHECK ("status" <> 'official' OR "source_id" IS NOT NULL)`);
    expect(sql).toContain(`CONSTRAINT "ck_verif_rejected_reason" CHECK ("status" <> 'rejected' OR "reason_code" IS NOT NULL)`);
    expect(sql).toContain('CONSTRAINT "ck_verif_confidence_range" CHECK');
  });

  it('up: source_id FK NO ACTION (bảo vệ CHECK official khỏi bị SET NULL khi xoá source)', async () => {
    const { qr, calls } = recordingRunner();
    await new InitVerifications1720004000000().up(qr);

    const sql = calls.find((c) => c.sql.includes('CREATE TABLE "verifications"'))!.sql.replace(/\s+/g, ' ');
    expect(sql).toContain('"source_id" uuid REFERENCES "sources"("id") ON DELETE NO ACTION');
  });

  it('up: assigned_to/verified_by/created_by FK SET NULL tới users (cùng quy ước ModerationCase/Source)', async () => {
    const { qr, calls } = recordingRunner();
    await new InitVerifications1720004000000().up(qr);

    const sql = calls.find((c) => c.sql.includes('CREATE TABLE "verifications"'))!.sql.replace(/\s+/g, ' ');
    expect(sql).toContain('"verified_by" uuid REFERENCES "users"("id") ON DELETE SET NULL');
    expect(sql).toContain('"assigned_to" uuid REFERENCES "users"("id") ON DELETE SET NULL');
    expect(sql).toContain('"created_by" uuid REFERENCES "users"("id") ON DELETE SET NULL');
  });

  it('up: lock_version int default 0 (optimistic lock, §5C)', async () => {
    const { qr, calls } = recordingRunner();
    await new InitVerifications1720004000000().up(qr);

    const sql = calls.find((c) => c.sql.includes('CREATE TABLE "verifications"'))!.sql.replace(/\s+/g, ' ');
    expect(sql).toContain('"lock_version" int NOT NULL DEFAULT 0');
  });

  it('up: 3 partial-unique index (một xác minh hiện hành/target) + index hàng đợi', async () => {
    const { qr, calls } = recordingRunner();
    await new InitVerifications1720004000000().up(qr);

    const all = sqlOf(calls);
    expect(all).toContain(
      'CREATE UNIQUE INDEX "uq_verif_place" ON "verifications" ("place_id") WHERE "place_id" IS NOT NULL',
    );
    expect(all).toContain(
      'CREATE UNIQUE INDEX "uq_verif_contact" ON "verifications" ("contact_id") WHERE "contact_id" IS NOT NULL',
    );
    expect(all).toContain(
      'CREATE UNIQUE INDEX "uq_verif_price" ON "verifications" ("price_history_id") WHERE "price_history_id" IS NOT NULL',
    );
    expect(all).toContain('idx_verif_queue" ON "verifications" ("assigned_to","sla_due_at") WHERE "status" = \'pending\'');
    expect(all).toContain('idx_verif_sla" ON "verifications" ("sla_due_at") WHERE "status" = \'pending\'');
    expect(all).toContain("idx_verif_expires\" ON \"verifications\" (\"expires_at\") WHERE \"status\" IN ('verified','official','community_verified')");
  });

  it('up: verification_events — FK CASCADE tới verifications, actor_id SET NULL, index (verification_id,created_at)', async () => {
    const { qr, calls } = recordingRunner();
    await new InitVerifications1720004000000().up(qr);

    const sql = calls.find((c) => c.sql.includes('CREATE TABLE "verification_events"'))!.sql.replace(/\s+/g, ' ');
    expect(sql).toContain('"verification_id" uuid NOT NULL REFERENCES "verifications"("id") ON DELETE CASCADE');
    expect(sql).toContain('"actor_id" uuid REFERENCES "users"("id") ON DELETE SET NULL');
    const all = sqlOf(calls);
    expect(all).toContain('"idx_verif_event_verif" ON "verification_events" ("verification_id","created_at")');
  });

  it('up: verification_votes — FK CASCADE tới verifications VÀ users, uq_vote_user (một người một phiếu)', async () => {
    const { qr, calls } = recordingRunner();
    await new InitVerifications1720004000000().up(qr);

    const sql = calls.find((c) => c.sql.includes('CREATE TABLE "verification_votes"'))!.sql.replace(/\s+/g, ' ');
    expect(sql).toContain('"verification_id" uuid NOT NULL REFERENCES "verifications"("id") ON DELETE CASCADE');
    expect(sql).toContain('"user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE');
    const all = sqlOf(calls);
    expect(all).toContain('CREATE UNIQUE INDEX "uq_vote_user" ON "verification_votes" ("verification_id","user_id")');
  });

  it('down: KHÔNG có verification_events nào -> xoá 3 bảng + 3 enum type', async () => {
    const calls: Array<{ sql: string }> = [];
    const runner = {
      query: jest.fn().mockImplementation((sql: string) => {
        if (sql.includes('SELECT count(*)')) return Promise.resolve([{ count: '0' }]);
        calls.push({ sql });
        return Promise.resolve();
      }),
    } as unknown as QueryRunner;

    await new InitVerifications1720004000000().down(runner);

    const all = calls.map((c) => c.sql).join('\n');
    expect(all).toContain('DROP TABLE IF EXISTS "verification_votes"');
    expect(all).toContain('DROP TABLE IF EXISTS "verification_events"');
    expect(all).toContain('DROP TABLE IF EXISTS "verifications"');
    expect(all).toContain('DROP TYPE IF EXISTS "verification_vote_choice"');
    expect(all).toContain('DROP TYPE IF EXISTS "verification_reason_code"');
    expect(all).toContain('DROP TYPE IF EXISTS "verification_method"');
    expect(all).not.toContain('DROP TYPE IF EXISTS "verification_status"');
  });

  it('down: CÓ verification_events (transition thật đã xảy ra) -> TỪ CHỐI, không DROP gì cả', async () => {
    const dropCalls: string[] = [];
    const runner = {
      query: jest.fn().mockImplementation((sql: string) => {
        if (sql.includes('SELECT count(*)')) return Promise.resolve([{ count: '3' }]);
        dropCalls.push(sql);
        return Promise.resolve();
      }),
    } as unknown as QueryRunner;

    await expect(new InitVerifications1720004000000().down(runner)).rejects.toThrow(/refused.*3 verification_events/i);
    expect(dropCalls).toHaveLength(0);
  });
});
