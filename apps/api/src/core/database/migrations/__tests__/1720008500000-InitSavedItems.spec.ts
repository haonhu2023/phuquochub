import { InitSavedItems1720008500000 } from '../1720008500000-InitSavedItems';
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

describe('InitSavedItems migration', () => {
  it('up: tạo enum target_type + bảng saved_items', async () => {
    const { qr, calls } = recordingRunner();
    await new InitSavedItems1720008500000().up(qr);

    const all = sqlOf(calls);
    expect(all).toContain(`CREATE TYPE "saved_item_target_type" AS ENUM ('job_listing', 'real_estate_listing')`);
    expect(all).toContain('CREATE TABLE "saved_items"');
  });

  it('up: user_id FK CASCADE (xoá tài khoản thì xoá luôn tin đã lưu), target_id KHÔNG FK cứng (đa hình)', async () => {
    const { qr, calls } = recordingRunner();
    await new InitSavedItems1720008500000().up(qr);

    const sql = calls.find((c) => c.sql.includes('CREATE TABLE "saved_items"'))!.sql.replace(/\s+/g, ' ');
    expect(sql).toContain('"user_id" UUID NOT NULL REFERENCES "users" ("id") ON DELETE CASCADE');
    expect(sql).toContain('"target_id"   UUID NOT NULL'.replace(/\s+/g, ' '));
    expect(sql).not.toMatch(/"target_id"[^,]*REFERENCES/);
  });

  it('up: UNIQUE (user_id, target_type, target_id) — lưu trùng không tạo hai dòng', async () => {
    const { qr, calls } = recordingRunner();
    await new InitSavedItems1720008500000().up(qr);

    const sql = calls.find((c) => c.sql.includes('CREATE TABLE "saved_items"'))!.sql;
    expect(sql).toContain('CONSTRAINT "uq_saved_items_user_target" UNIQUE ("user_id", "target_type", "target_id")');
  });

  it('up: có index cho user_id (truy vấn "tin đã lưu") và (target_type, target_id)', async () => {
    const { qr, calls } = recordingRunner();
    await new InitSavedItems1720008500000().up(qr);

    const all = sqlOf(calls);
    expect(all).toContain('CREATE INDEX "idx_saved_items_user_id" ON "saved_items" ("user_id")');
    expect(all).toContain('CREATE INDEX "idx_saved_items_target" ON "saved_items" ("target_type", "target_id")');
  });

  it('down: xoá bảng rồi enum type', async () => {
    const { qr, calls } = recordingRunner();
    await new InitSavedItems1720008500000().down(qr);

    const all = sqlOf(calls);
    expect(all).toContain('DROP TABLE IF EXISTS "saved_items"');
    expect(all).toContain('DROP TYPE IF EXISTS "saved_item_target_type"');
  });
});
