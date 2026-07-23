import { InitSources1720001700000 } from '../1720001700000-InitSources';
import type { QueryRunner } from 'typeorm';

// Test cấu trúc migration (không cần DB) — xác nhận SQL khớp thiết kế source.md §4/§5.
// CHỦ Ý đặt ngoài migrations/ (không phải migrations/*.spec.ts): glob nạp migration của
// TypeORM là "migrations/*.{ts,js}" — không khớp thư mục con — nên file này không bị
// migration:run/-revert/-generate nạp nhầm như một migration (xem Module 07: đúng lỗi
// InitAuditLogs.spec.ts đã mắc phải do nằm cùng cấp migrations/).
function recordingRunner() {
  const queries: string[] = [];
  const qr = { query: (sql: string) => (queries.push(sql), Promise.resolve()) } as QueryRunner;
  return { qr, queries };
}

describe('InitSources migration', () => {
  it('up: tạo enum source_type/source_kind + bảng sources đủ cột + index', async () => {
    const { qr, queries } = recordingRunner();
    await new InitSources1720001700000().up(qr);
    const all = queries.join('\n');

    expect(all).toContain('CREATE TYPE "source_type" AS ENUM');
    expect(all).toContain('CREATE TYPE "source_kind" AS ENUM');
    expect(all).toContain('CREATE TABLE "sources"');
    for (const col of [
      'type', 'kind', 'title', 'url', 'external_ref', 'publisher', 'author_user_id',
      'license', 'reliability', 'language', 'retrieved_at', 'metadata',
      'created_at', 'updated_at', 'deleted_at',
    ]) {
      expect(all).toContain(`"${col}"`);
    }
    expect(all).toContain('uq_sources_type_external_ref');
    expect(all).toContain('idx_sources_type');
    expect(all).toContain('idx_sources_author');
  });

  it('up: tạo bảng source_attributions đủ cột + index đa hình', async () => {
    const { qr, queries } = recordingRunner();
    await new InitSources1720001700000().up(qr);
    const all = queries.join('\n');

    expect(all).toContain('CREATE TABLE "source_attributions"');
    for (const col of [
      'source_id', 'entity_type', 'entity_id', 'field', 'confidence', 'note',
      'is_primary', 'verified_by', 'verified_at', 'created_by', 'created_at',
    ]) {
      expect(all).toContain(`"${col}"`);
    }
    // entity_type PHẢI là varchar (B-3), KHÔNG được là kiểu enum tham chiếu.
    expect(all).toMatch(/"entity_type" varchar\(30\) NOT NULL/);
    expect(all).toContain('idx_source_attr_entity');
    expect(all).toContain('idx_source_attr_source');
    expect(all).toContain('uq_source_attr_entity_field_source');
  });

  it('up: nối FK price_history.source_id → sources.id', async () => {
    const { qr, queries } = recordingRunner();
    await new InitSources1720001700000().up(qr);
    const all = queries.join('\n');

    expect(all).toContain('ALTER TABLE "price_history" ADD CONSTRAINT "fk_price_history_source"');
    expect(all).toContain('REFERENCES "sources"("id") ON DELETE SET NULL');
  });

  it('down: drop FK + 2 bảng + 2 enum theo đúng thứ tự phụ thuộc (revert sạch)', async () => {
    const { qr, queries } = recordingRunner();
    await new InitSources1720001700000().down(qr);

    expect(queries[0]).toContain('DROP CONSTRAINT IF EXISTS "fk_price_history_source"');
    expect(queries[1]).toContain('DROP TABLE IF EXISTS "source_attributions"');
    expect(queries[2]).toContain('DROP TABLE IF EXISTS "sources"');
    expect(queries[3]).toContain('DROP TYPE IF EXISTS "source_kind"');
    expect(queries[4]).toContain('DROP TYPE IF EXISTS "source_type"');
  });
});
