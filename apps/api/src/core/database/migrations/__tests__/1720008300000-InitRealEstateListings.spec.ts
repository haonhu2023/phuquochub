import { InitRealEstateListings1720008300000 } from '../1720008300000-InitRealEstateListings';
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

describe('InitRealEstateListings migration', () => {
  it('up: tạo 9 enum type + bảng real_estate_listings', async () => {
    const { qr, calls } = recordingRunner();
    await new InitRealEstateListings1720008300000().up(qr);

    const all = sqlOf(calls);
    for (const t of [
      'real_estate_listing_status',
      'real_estate_deal_status',
      'real_estate_poster_role',
      'real_estate_transaction_type',
      'real_estate_property_type',
      'real_estate_address_precision',
      'real_estate_rent_period',
      'real_estate_sale_price_basis',
      'real_estate_furniture_status',
    ]) {
      expect(all).toContain(`CREATE TYPE "${t}"`);
    }
    expect(all).toContain('CREATE TABLE "real_estate_listings"');
  });

  it('up: created_by FK RESTRICT, status/deal_status mặc định draft/available', async () => {
    const { qr, calls } = recordingRunner();
    await new InitRealEstateListings1720008300000().up(qr);

    const sql = calls.find((c) => c.sql.includes('CREATE TABLE "real_estate_listings"'))!.sql.replace(/\s+/g, ' ');
    expect(sql).toContain('"created_by" UUID NOT NULL REFERENCES "users" ("id") ON DELETE RESTRICT');
    expect(sql).toContain('"status" "real_estate_listing_status" NOT NULL DEFAULT \'draft\'');
    expect(sql).toContain('"deal_status" "real_estate_deal_status" NOT NULL DEFAULT \'available\'');
  });

  it('up: CHECK chặn field thuê lọt vào tin bán và ngược lại (không chỉ validate ở DTO)', async () => {
    const { qr, calls } = recordingRunner();
    await new InitRealEstateListings1720008300000().up(qr);

    const sql = calls.find((c) => c.sql.includes('CREATE TABLE "real_estate_listings"'))!.sql;
    expect(sql).toContain('chk_rel_rent_fields_scope');
    expect(sql).toContain('chk_rel_sale_fields_scope');
  });

  it('up: CHECK deal_status khác available chỉ hợp lệ khi status đã từng published/closed', async () => {
    const { qr, calls } = recordingRunner();
    await new InitRealEstateListings1720008300000().up(qr);

    const sql = calls.find((c) => c.sql.includes('CREATE TABLE "real_estate_listings"'))!.sql.replace(/\s+/g, ' ');
    expect(sql).toContain(
      `CONSTRAINT "chk_rel_deal_status_scope" CHECK ( "deal_status" = 'available' OR "status" IN ('published','closed') )`,
    );
  });

  it('up: CHECK address_precision=exact cần address_text hoặc lat+lng', async () => {
    const { qr, calls } = recordingRunner();
    await new InitRealEstateListings1720008300000().up(qr);

    const sql = calls.find((c) => c.sql.includes('CREATE TABLE "real_estate_listings"'))!.sql;
    expect(sql).toContain('chk_rel_address_exact_has_location');
  });

  it('up: có index cho status/deal_status/expires_at/ward/property_type/transaction_type/created_by', async () => {
    const { qr, calls } = recordingRunner();
    await new InitRealEstateListings1720008300000().up(qr);

    const all = sqlOf(calls);
    for (const idx of [
      'idx_real_estate_listings_status',
      'idx_real_estate_listings_deal_status',
      'idx_real_estate_listings_expires_at',
      'idx_real_estate_listings_ward',
      'idx_real_estate_listings_property_type',
      'idx_real_estate_listings_transaction_type',
      'idx_real_estate_listings_created_by',
    ]) {
      expect(all).toContain(`CREATE INDEX "${idx}"`);
    }
  });

  it('down: xoá bảng rồi 9 enum type', async () => {
    const { qr, calls } = recordingRunner();
    await new InitRealEstateListings1720008300000().down(qr);

    const all = sqlOf(calls);
    expect(all).toContain('DROP TABLE IF EXISTS "real_estate_listings"');
    for (const t of [
      'real_estate_furniture_status',
      'real_estate_sale_price_basis',
      'real_estate_rent_period',
      'real_estate_address_precision',
      'real_estate_property_type',
      'real_estate_transaction_type',
      'real_estate_poster_role',
      'real_estate_deal_status',
      'real_estate_listing_status',
    ]) {
      expect(all).toContain(`DROP TYPE IF EXISTS "${t}"`);
    }
  });
});
