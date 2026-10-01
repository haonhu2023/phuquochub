import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { AmenitiesService } from '../src/modules/amenities/amenities.service';

// PUT /places/:id/amenities — live Postgres, real AmenitiesService.updateForPlace(). Amenities dùng
// CHUNG cho hotel/restaurant (place_amenities.place_id, không phải bảng riêng theo category) — CAS
// ở đây bảo vệ ĐÚNG token `places.content_version` mà hotel/restaurant details đã dùng, xem
// hotel-details-patch-semantics.e2e-spec.ts's ghi chú đầy đủ về vì sao "SELECT ... FOR UPDATE" cũ
// không đủ và vì sao phải chứng minh trên Postgres thật, không phải mock.
describe('Amenities PUT semantics (replace-all, CAS thật) — live Postgres', () => {
  let app: INestApplication;
  let ds: DataSource;
  let amenitiesService: AmenitiesService;
  let categoryId: string;
  let actorId: string;

  const placeIds: string[] = [];
  const userIds: string[] = [];

  async function mkPlace(label: string): Promise<string> {
    const rows: Array<{ id: string }> = await ds.query(
      `INSERT INTO places (name, slug, category_id, location, status)
       VALUES ($1, $2, $3, ST_SetSRID(ST_MakePoint(103.9, 10.2), 4326)::geography, 'draft')
       RETURNING id`,
      [`E2E Amenities ${label}`, `e2e-amenities-${label}-${Date.now()}-${Math.random().toString(36).slice(2)}`, categoryId],
    );
    placeIds.push(rows[0].id);
    return rows[0].id;
  }

  async function readCodes(placeId: string): Promise<string[]> {
    const rows: Array<{ code: string }> = await ds.query(
      `SELECT a.code FROM place_amenities pa JOIN amenities a ON a.id = pa.amenity_id WHERE pa.place_id = $1 ORDER BY a.code`,
      [placeId],
    );
    return rows.map((r) => r.code);
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();

    ds = app.get<DataSource>(getDataSourceToken());
    amenitiesService = app.get(AmenitiesService);

    const [{ id }] = await ds.query(`SELECT id FROM categories WHERE slug = 'hotel' LIMIT 1`);
    categoryId = id;

    const [{ id: uid }] = await ds.query(
      `INSERT INTO users (email, display_name) VALUES ($1, $2) RETURNING id`,
      [`e2e-amenities-cas-${Date.now()}@example.test`, 'E2E Amenities CAS Actor'],
    );
    actorId = uid;
    userIds.push(uid);
  }, 60_000);

  afterAll(async () => {
    try {
      if (ds?.isInitialized) {
        if (placeIds.length) {
          await ds.query(`DELETE FROM audit_logs WHERE entity_id = ANY($1)`, [placeIds]);
          await ds.query(`DELETE FROM place_amenities WHERE place_id = ANY($1)`, [placeIds]);
          await ds.query(`DELETE FROM places WHERE id = ANY($1)`, [placeIds]);
        }
        if (userIds.length) await ds.query(`DELETE FROM users WHERE id = ANY($1)`, [userIds]);
      }
    } finally {
      if (app) await app.close();
    }
  }, 60_000);

  it('CAS thật: hai request cùng expected_content_version -> một thành công, một 409, DB giữ đúng kết quả request thắng', async () => {
    const placeId = await mkPlace('cas-conflict');

    // "Tab A" và "Tab B" cùng đọc content_version=1 (place vừa tạo, mặc định).
    const winner = await amenitiesService.updateForPlace(placeId, ['wifi', 'pool'], 1, actorId);
    expect(winner.content_version).toBe(2);
    expect(readCodesFrom(winner.amenities)).toEqual(['pool', 'wifi']);

    // "Tab B" gửi SAU nhưng vẫn mang version=1 đã cũ -> phải 409, KHÔNG được ghi đè.
    await expect(amenitiesService.updateForPlace(placeId, ['parking'], 1, actorId)).rejects.toMatchObject({ status: 409 });

    // DB giữ nguyên gán của Tab A — request thua không đổi được gì.
    expect(await readCodes(placeId)).toEqual(['pool', 'wifi']);

    // Rollback đúng cả version lẫn dữ liệu — content_version không bị tăng thêm bởi request thất bại.
    const [{ content_version: placeVersionAfter }] = await ds.query(`SELECT content_version FROM places WHERE id = $1`, [placeId]);
    expect(placeVersionAfter).toBe(2);
  }, 30_000);

  it('mã tiện ích không tồn tại -> rollback TOÀN BỘ, không đổi gán hiện có, content_version không tăng', async () => {
    const placeId = await mkPlace('invalid-code-rollback');

    const created = await amenitiesService.updateForPlace(placeId, ['wifi'], 1, actorId);
    expect(created.content_version).toBe(2);

    await expect(amenitiesService.updateForPlace(placeId, ['wifi', 'khong_ton_tai_thuc_su'], 2, actorId)).rejects.toThrow(
      /khong_ton_tai_thuc_su/,
    );

    expect(await readCodes(placeId)).toEqual(['wifi']); // gán cũ giữ nguyên, không bị xoá giữa chừng
    const [{ content_version: placeVersionAfter }] = await ds.query(`SELECT content_version FROM places WHERE id = $1`, [placeId]);
    expect(placeVersionAfter).toBe(2); // không tăng thêm bởi request thất bại
  }, 30_000);

  function readCodesFrom(amenities: Array<{ code: string }>): string[] {
    return amenities.map((a) => a.code).sort();
  }
});
