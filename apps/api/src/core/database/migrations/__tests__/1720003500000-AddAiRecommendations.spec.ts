import { AddAiRecommendations1720003500000 } from '../1720003500000-AddAiRecommendations';
import type { QueryRunner } from 'typeorm';

function recordingRunner() {
  const calls: Array<{ sql: string; params?: unknown[] }> = [];
  const qr = {
    query: (sql: string, params?: unknown[]) => (calls.push({ sql, params }), Promise.resolve()),
  } as QueryRunner;
  return { qr, calls };
}

describe('AddAiRecommendations migration (Moderation M7 — AI Shadow Mode)', () => {
  it('up: tạo ĐÚNG một bảng mới, KHÔNG enum type mới', async () => {
    const { qr, calls } = recordingRunner();
    await new AddAiRecommendations1720003500000().up(qr);

    const creates = calls.filter((c) => c.sql.includes('CREATE TABLE'));
    expect(creates).toHaveLength(1);
    expect(creates[0].sql).toContain('CREATE TABLE "ai_recommendations"');
    expect(calls.some((c) => c.sql.includes('CREATE TYPE'))).toBe(false);
  });

  it('up: case_id FK THẬT + CASCADE tới moderation_cases (cùng khuôn reports.case_id)', async () => {
    const { qr, calls } = recordingRunner();
    await new AddAiRecommendations1720003500000().up(qr);

    const sql = calls.find((c) => c.sql.includes('CREATE TABLE "ai_recommendations"'))!.sql.replace(/\s+/g, ' ');
    expect(sql).toContain('"case_id" uuid NOT NULL REFERENCES "moderation_cases"("id") ON DELETE CASCADE');
  });

  it('up: decision/moderator_decision TÁI DÙNG type "moderation_decision" đã có, KHÔNG enum riêng', async () => {
    const { qr, calls } = recordingRunner();
    await new AddAiRecommendations1720003500000().up(qr);

    const sql = calls.find((c) => c.sql.includes('CREATE TABLE "ai_recommendations"'))!.sql.replace(/\s+/g, ' ');
    expect(sql).toContain('"decision" "moderation_decision" NOT NULL');
    expect(sql).toContain('"moderator_decision" "moderation_decision"');
  });

  it('up: KHÔNG cột nào trùng media.status/reviews.status/moderation_cases.status (INV-1/INV-2 giữ nguyên)', async () => {
    const { qr, calls } = recordingRunner();
    await new AddAiRecommendations1720003500000().up(qr);

    const sql = calls.find((c) => c.sql.includes('CREATE TABLE "ai_recommendations"'))!.sql;
    expect(sql).not.toMatch(/"status"\s/);
  });

  it('up: evaluated_at/moderator_decision/matched đều NULLABLE (chưa evaluate lúc tạo)', async () => {
    const { qr, calls } = recordingRunner();
    await new AddAiRecommendations1720003500000().up(qr);

    const sql = calls.find((c) => c.sql.includes('CREATE TABLE "ai_recommendations"'))!.sql.replace(/\s+/g, ' ');
    expect(sql).toContain('"evaluated_at" timestamptz,');
    expect(sql).toContain('"moderator_decision" "moderation_decision",');
    expect(sql).toContain('"matched" boolean,');
  });

  it('up: index (case_id, created_at DESC) cho findLatestByCase()', async () => {
    const { qr, calls } = recordingRunner();
    await new AddAiRecommendations1720003500000().up(qr);

    const sql = calls.find((c) => c.sql.includes('idx_ai_recommendations_case'))!.sql.replace(/\s+/g, ' ');
    expect(sql).toContain('("case_id","created_at" DESC)');
  });

  it('down: KHÔNG kiểm tra case resolved nào — chỉ DROP đúng một bảng (shadow mode không giữ quyết định thật)', async () => {
    const { qr, calls } = recordingRunner();
    await new AddAiRecommendations1720003500000().down(qr);

    expect(calls).toHaveLength(1);
    expect(calls[0].sql).toContain('DROP TABLE IF EXISTS "ai_recommendations"');
  });

  it('down: KHÔNG DROP TYPE nào (type moderation_decision thuộc về InitModeration, không phải migration này)', async () => {
    const { qr, calls } = recordingRunner();
    await new AddAiRecommendations1720003500000().down(qr);

    expect(calls.some((c) => c.sql.includes('DROP TYPE'))).toBe(false);
  });
});
