import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { ToursService } from '../src/modules/tours/tours.service';

// PATCH /tours/:id/details — live Postgres, real ToursService.updateDetails(). Chứng minh
// pickup_point/organizer_id giữ/đổi/xoá đúng trên DB thật (bug cũ: COALESCE trên tham số đã ??
// null hoá khiến "không gửi" và "gửi null để xoá" không thể phân biệt).
describe('Tour details PATCH semantics (giữ/đổi/xoá) — live Postgres', () => {
  let app: INestApplication;
  let ds: DataSource;
  let toursService: ToursService;
  let categoryId: string;
  let actorId: string;

  const placeIds: string[] = [];
  const userIds: string[] = [];

  async function mkTourPlace(label: string): Promise<string> {
    const rows: Array<{ id: string }> = await ds.query(
      `INSERT INTO places (name, slug, category_id, location, status)
       VALUES ($1, $2, $3, ST_SetSRID(ST_MakePoint(103.9, 10.2), 4326)::geography, 'draft')
       RETURNING id`,
      [`E2E Tour ${label}`, `e2e-tour-${label}-${Date.now()}-${Math.random().toString(36).slice(2)}`, categoryId],
    );
    placeIds.push(rows[0].id);
    const id = rows[0].id;
    await ds.query(
      `INSERT INTO place_tour_details (place_id, tour_type) VALUES ($1, 'sightseeing')`,
      [id],
    );
    return id;
  }

  async function readDetails(placeId: string) {
    const rows = await ds.query(
      `SELECT tour_type, pickup_point, inclusions, organizer_id FROM place_tour_details WHERE place_id = $1`,
      [placeId],
    );
    return rows[0] ?? null;
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();

    ds = app.get<DataSource>(getDataSourceToken());
    toursService = app.get(ToursService);

    const [{ id }] = await ds.query(`SELECT id FROM categories WHERE slug = 'tour' LIMIT 1`);
    categoryId = id;

    const [{ id: uid }] = await ds.query(
      `INSERT INTO users (email, display_name) VALUES ($1, $2) RETURNING id`,
      [`e2e-tour-details-${Date.now()}@example.test`, 'E2E Tour Details Actor'],
    );
    actorId = uid;
    userIds.push(uid);
  }, 60_000);

  afterAll(async () => {
    try {
      if (ds?.isInitialized) {
        if (placeIds.length) {
          await ds.query(`DELETE FROM audit_logs WHERE entity_id = ANY($1)`, [placeIds]);
          await ds.query(`DELETE FROM place_tour_details WHERE place_id = ANY($1)`, [placeIds]);
          await ds.query(`DELETE FROM places WHERE id = ANY($1)`, [placeIds]);
        }
        if (userIds.length) await ds.query(`DELETE FROM users WHERE id = ANY($1)`, [userIds]);
      }
    } finally {
      if (app) await app.close();
    }
  }, 60_000);

  it('REQUIRED SEQUENCE: PATCH một trường không xoá trường khác -> PATCH null xoá đúng trường đó', async () => {
    const placeId = await mkTourPlace('keep-change-clear');

    // 1) PATCH pickup_point + inclusions.
    await toursService.updateDetails(placeId, { pickup_point: 'Cổng khách sạn', inclusions: 'Vé vào cổng' }, actorId);
    let row = await readDetails(placeId);
    expect(row).toMatchObject({ pickup_point: 'Cổng khách sạn', inclusions: 'Vé vào cổng' });

    // 2) PATCH CHỈ tour_type — pickup_point/inclusions phải GIỮ NGUYÊN.
    await toursService.updateDetails(placeId, { tour_type: 'diving' as never }, actorId);
    row = await readDetails(placeId);
    expect(row).toMatchObject({ tour_type: 'diving', pickup_point: 'Cổng khách sạn', inclusions: 'Vé vào cổng' });

    // 3) PATCH pickup_point = null (XOÁ tường minh) — inclusions vẫn giữ nguyên.
    await toursService.updateDetails(placeId, { pickup_point: null }, actorId);
    row = await readDetails(placeId);
    expect(row.pickup_point).toBeNull();
    expect(row.inclusions).toBe('Vé vào cổng');
  }, 30_000);
});
