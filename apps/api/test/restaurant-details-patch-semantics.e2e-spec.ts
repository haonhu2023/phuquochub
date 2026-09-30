import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { RestaurantsService } from '../src/modules/restaurants/restaurants.service';

// PATCH /restaurants/:id/details — live Postgres, real RestaurantsService.updateDetails(). Chứng
// minh `dietary` (jsonb, có khái niệm "xoá" thật) giữ/đổi/xoá đúng trên DB thật — trường boolean
// is_local_specialty không có khái niệm xoá nên không cần phép thử đó.
describe('Restaurant details PATCH semantics (giữ/đổi/xoá dietary) — live Postgres', () => {
  let app: INestApplication;
  let ds: DataSource;
  let restaurantsService: RestaurantsService;
  let categoryId: string;
  let actorId: string;

  const placeIds: string[] = [];
  const userIds: string[] = [];

  async function mkRestaurantPlace(label: string): Promise<string> {
    const rows: Array<{ id: string }> = await ds.query(
      `INSERT INTO places (name, slug, category_id, location, status)
       VALUES ($1, $2, $3, ST_SetSRID(ST_MakePoint(103.9, 10.2), 4326)::geography, 'draft')
       RETURNING id`,
      [`E2E Restaurant ${label}`, `e2e-restaurant-${label}-${Date.now()}-${Math.random().toString(36).slice(2)}`, categoryId],
    );
    placeIds.push(rows[0].id);
    return rows[0].id;
  }

  async function readDetails(placeId: string) {
    const rows = await ds.query(
      `SELECT is_local_specialty, dietary FROM place_restaurant_details WHERE place_id = $1`,
      [placeId],
    );
    return rows[0] ?? null;
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();

    ds = app.get<DataSource>(getDataSourceToken());
    restaurantsService = app.get(RestaurantsService);

    const [{ id }] = await ds.query(`SELECT id FROM categories WHERE slug = 'restaurant' LIMIT 1`);
    categoryId = id;

    const [{ id: uid }] = await ds.query(
      `INSERT INTO users (email, display_name) VALUES ($1, $2) RETURNING id`,
      [`e2e-restaurant-details-${Date.now()}@example.test`, 'E2E Restaurant Details Actor'],
    );
    actorId = uid;
    userIds.push(uid);
  }, 60_000);

  afterAll(async () => {
    try {
      if (ds?.isInitialized) {
        if (placeIds.length) {
          await ds.query(`DELETE FROM audit_logs WHERE entity_id = ANY($1)`, [placeIds]);
          await ds.query(`DELETE FROM place_restaurant_details WHERE place_id = ANY($1)`, [placeIds]);
          await ds.query(`DELETE FROM places WHERE id = ANY($1)`, [placeIds]);
        }
        if (userIds.length) await ds.query(`DELETE FROM users WHERE id = ANY($1)`, [userIds]);
      }
    } finally {
      if (app) await app.close();
    }
  }, 60_000);

  it('REQUIRED SEQUENCE: tạo -> PATCH is_local_specialty không xoá dietary -> PATCH dietary=null xoá đúng dietary', async () => {
    const placeId = await mkRestaurantPlace('keep-change-clear');
    // CAS thật (2026-09-30) — xem hotel-details-patch-semantics.e2e-spec.ts's ghi chú đầy đủ:
    // version phải được thread từ response của lần gọi trước, không hardcode lại 1 mỗi lần.
    let version = 1;

    // 1) Tạo lần đầu: cả hai trường.
    let result = await restaurantsService.updateDetails(placeId, { expected_content_version: version, is_local_specialty: true, dietary: { vegetarian: true } }, actorId);
    version = result.content_version!;
    let row = await readDetails(placeId);
    expect(row).toMatchObject({ is_local_specialty: true, dietary: { vegetarian: true } });

    // 2) PATCH CHỈ is_local_specialty (đổi false) — dietary phải GIỮ NGUYÊN.
    result = await restaurantsService.updateDetails(placeId, { expected_content_version: version, is_local_specialty: false }, actorId);
    version = result.content_version!;
    row = await readDetails(placeId);
    expect(row).toMatchObject({ is_local_specialty: false, dietary: { vegetarian: true } });

    // 3) PATCH dietary = null (XOÁ tường minh) — is_local_specialty vẫn giữ nguyên.
    result = await restaurantsService.updateDetails(placeId, { expected_content_version: version, dietary: null }, actorId);
    version = result.content_version!;
    row = await readDetails(placeId);
    expect(row.dietary).toBeNull();
    expect(row.is_local_specialty).toBe(false);
  }, 30_000);

  // CAS thật (2026-09-30) — xem hotel-details-patch-semantics.e2e-spec.ts's test cùng tên cho ghi
  // chú đầy đủ về kịch bản "hai tab cùng đọc, một ghi trước, một ghi sau với version cũ".
  it('CAS thật: hai request cùng expected_content_version -> một thành công, một 409, DB giữ đúng kết quả request thắng', async () => {
    const placeId = await mkRestaurantPlace('cas-conflict');

    const winner = await restaurantsService.updateDetails(placeId, { expected_content_version: 1, is_local_specialty: true }, actorId);
    expect(winner.content_version).toBe(2);

    await expect(
      restaurantsService.updateDetails(placeId, { expected_content_version: 1, is_local_specialty: false }, actorId),
    ).rejects.toMatchObject({ status: 409 });

    const row = await readDetails(placeId);
    expect(row.is_local_specialty).toBe(true);
  }, 30_000);
});
