import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { BeachesService } from '../src/modules/beaches/beaches.service';

// PATCH /beaches/:id/details — live Postgres, real BeachesService.updateDetails(). Cùng bài kiểm
// tra hotel-details-patch-semantics.e2e-spec.ts, áp cho field TĨNH (access_route) và field CÓ
// NGUỒN (best_season) đồng thời, để chứng minh computeSourcedFieldPatch hoạt động đúng trên DB
// thật cho MỘT trong 3 field có nguồn của bãi biển (lifeguard_info/sourced_notes dùng chung logic).
describe('Beach details PATCH semantics (giữ/đổi/xoá, nhất quán giá trị-nguồn) — live Postgres', () => {
  let app: INestApplication;
  let ds: DataSource;
  let beachesService: BeachesService;
  let categoryId: string;
  let actorId: string;

  const placeIds: string[] = [];
  const sourceIds: string[] = [];
  const userIds: string[] = [];

  async function mkBeachPlace(label: string): Promise<string> {
    const rows: Array<{ id: string }> = await ds.query(
      `INSERT INTO places (name, slug, category_id, location, status)
       VALUES ($1, $2, $3, ST_SetSRID(ST_MakePoint(103.9, 10.2), 4326)::geography, 'draft')
       RETURNING id`,
      [`E2E Beach ${label}`, `e2e-beach-${label}-${Date.now()}-${Math.random().toString(36).slice(2)}`, categoryId],
    );
    placeIds.push(rows[0].id);
    return rows[0].id;
  }

  async function mkSource(): Promise<string> {
    const rows: Array<{ id: string }> = await ds.query(
      `INSERT INTO sources (type, kind, reliability, title) VALUES ('official_website', 'url', 90, $1) RETURNING id`,
      ['E2E test source'],
    );
    sourceIds.push(rows[0].id);
    return rows[0].id;
  }

  async function readDetails(placeId: string) {
    const rows = await ds.query(
      `SELECT access_route, characteristics, best_season, best_season_source_id, best_season_verified_at
       FROM place_beach_details WHERE place_id = $1`,
      [placeId],
    );
    return rows[0] ?? null;
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();

    ds = app.get<DataSource>(getDataSourceToken());
    beachesService = app.get(BeachesService);

    const [{ id }] = await ds.query(`SELECT id FROM categories WHERE slug = 'beach' LIMIT 1`);
    categoryId = id;

    const [{ id: uid }] = await ds.query(
      `INSERT INTO users (email, display_name) VALUES ($1, $2) RETURNING id`,
      [`e2e-beach-details-${Date.now()}@example.test`, 'E2E Beach Details Actor'],
    );
    actorId = uid;
    userIds.push(uid);
  }, 60_000);

  afterAll(async () => {
    try {
      if (ds?.isInitialized) {
        if (placeIds.length) {
          await ds.query(`DELETE FROM audit_logs WHERE entity_id = ANY($1)`, [placeIds]);
          await ds.query(`DELETE FROM place_beach_details WHERE place_id = ANY($1)`, [placeIds]);
          await ds.query(`DELETE FROM places WHERE id = ANY($1)`, [placeIds]);
        }
        if (sourceIds.length) await ds.query(`DELETE FROM sources WHERE id = ANY($1)`, [sourceIds]);
        if (userIds.length) await ds.query(`DELETE FROM users WHERE id = ANY($1)`, [userIds]);
      }
    } finally {
      if (app) await app.close();
    }
  }, 60_000);

  it('REQUIRED SEQUENCE: tạo -> PATCH một trường không xoá trường khác -> xoá tường minh -> đổi giá trị có nguồn không kèm nguồn mới -> xoá nguồn cũ', async () => {
    const placeId = await mkBeachPlace('keep-change-clear');
    const sourceId = await mkSource();

    // 1) Tạo lần đầu: access_route (tĩnh) + best_season (có nguồn) + nguồn.
    await beachesService.updateDetails(
      placeId,
      { access_route: 'Theo đường ven biển phía nam', best_season: 'Tháng 11 - tháng 4', best_season_source_id: sourceId },
      actorId,
    );
    let row = await readDetails(placeId);
    expect(row).toMatchObject({
      access_route: 'Theo đường ven biển phía nam',
      best_season: 'Tháng 11 - tháng 4',
      best_season_source_id: sourceId,
    });
    expect(row.best_season_verified_at).not.toBeNull();
    const firstVerifiedAt = row.best_season_verified_at;

    // 2) PATCH CHỈ characteristics — access_route/best_season/nguồn phải GIỮ NGUYÊN.
    await beachesService.updateDetails(placeId, { characteristics: 'Cát trắng mịn' }, actorId);
    row = await readDetails(placeId);
    expect(row).toMatchObject({
      access_route: 'Theo đường ven biển phía nam',
      characteristics: 'Cát trắng mịn',
      best_season: 'Tháng 11 - tháng 4',
      best_season_source_id: sourceId,
    });
    expect(new Date(row.best_season_verified_at).getTime()).toBe(new Date(firstVerifiedAt).getTime());

    // 3) XOÁ tường minh access_route (null) — best_season/nguồn vẫn giữ nguyên.
    await beachesService.updateDetails(placeId, { access_route: null }, actorId);
    row = await readDetails(placeId);
    expect(row.access_route).toBeNull();
    expect(row).toMatchObject({ best_season: 'Tháng 11 - tháng 4', best_season_source_id: sourceId });

    // 4) Đổi best_season (giá trị) mà KHÔNG kèm nguồn mới -> nguồn/verified_at CŨ phải bị XOÁ.
    await beachesService.updateDetails(placeId, { best_season: 'Tháng 12 - tháng 3' }, actorId);
    row = await readDetails(placeId);
    expect(row.best_season).toBe('Tháng 12 - tháng 3');
    expect(row.best_season_source_id).toBeNull();
    expect(row.best_season_verified_at).toBeNull();

    // 5) Cấp nguồn mới cho giá trị hiện tại -> verified_at làm mới.
    const secondSourceId = await mkSource();
    await beachesService.updateDetails(placeId, { best_season_source_id: secondSourceId }, actorId);
    row = await readDetails(placeId);
    expect(row.best_season).toBe('Tháng 12 - tháng 3');
    expect(row.best_season_source_id).toBe(secondSourceId);
    expect(row.best_season_verified_at).not.toBeNull();
  }, 30_000);
});
