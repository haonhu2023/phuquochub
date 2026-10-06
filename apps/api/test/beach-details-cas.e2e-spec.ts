import { ConflictException, INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { BeachesService } from '../src/modules/beaches/beaches.service';

// Beach details writes use the same compare-and-set token as hotels/restaurants: places.content_version.
// Live Postgres, real BeachesService. Proves: a current version writes and bumps the token; a stale version
// is refused with 409 and writes nothing; an empty PATCH writes nothing and does not bump the token.
describe('Beach details: CAS on places.content_version — live Postgres', () => {
  let app: INestApplication;
  let ds: DataSource;
  let beaches: BeachesService;
  let ownerId: string;
  let categoryId: string;
  const placeIds: string[] = [];

  async function mkBeach(label: string): Promise<{ id: string; slug: string }> {
    const slug = `e2e-beach-${label}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const [row]: Array<{ id: string }> = await ds.query(
      `INSERT INTO places (name, slug, category_id, location, status)
       VALUES ($1, $2, $3, ST_SetSRID(ST_MakePoint(104.03, 10.05), 4326)::geography, 'published')
       RETURNING id`,
      [`E2E beach ${label}`, slug, categoryId],
    );
    placeIds.push(row.id);
    return { id: row.id, slug };
  }

  async function version(id: string): Promise<number> {
    const [row]: Array<{ content_version: number }> = await ds.query(`SELECT content_version FROM places WHERE id = $1`, [id]);
    return row.content_version;
  }

  async function accessRoute(id: string): Promise<string | null> {
    const rows: Array<{ access_route: string | null }> = await ds.query(
      `SELECT access_route FROM place_beach_details WHERE place_id = $1`,
      [id],
    );
    return rows[0]?.access_route ?? null;
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    ds = app.get<DataSource>(getDataSourceToken());
    beaches = app.get(BeachesService);
    const [cat] = await ds.query(`SELECT id FROM categories WHERE slug = 'beach' LIMIT 1`);
    categoryId = cat.id;
    const [u] = await ds.query(`INSERT INTO users (email, display_name) VALUES ($1, $2) RETURNING id`, [
      `e2e-beach-owner-${Date.now()}@example.test`,
      'E2E beach owner',
    ]);
    ownerId = u.id;
  }, 120_000);

  afterAll(async () => {
    await app?.close();
  });

  it('version hiện tại → ghi được, token tăng đúng 1', async () => {
    const b = await mkBeach('ok');
    const before = await version(b.id);
    const res = await beaches.updateDetails(b.id, { expected_content_version: before, access_route: 'Đường ven biển' } as never, ownerId);
    expect(res?.access_route).toBe('Đường ven biển');
    expect(await version(b.id)).toBe(before + 1);
  });

  it('version cũ → 409, KHÔNG ghi chi tiết và KHÔNG tăng token', async () => {
    const b = await mkBeach('stale');
    const before = await version(b.id);
    await beaches.updateDetails(b.id, { expected_content_version: before, access_route: 'Lần một' } as never, ownerId);
    const after1 = await version(b.id);
    await expect(
      beaches.updateDetails(b.id, { expected_content_version: before, access_route: 'Ghi đè cũ' } as never, ownerId),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(await accessRoute(b.id)).toBe('Lần một');
    expect(await version(b.id)).toBe(after1);
  });

  it('PATCH rỗng (chỉ có version) → không ghi, không tăng token', async () => {
    const b = await mkBeach('empty');
    const before = await version(b.id);
    await beaches.updateDetails(b.id, { expected_content_version: before } as never, ownerId);
    expect(await version(b.id)).toBe(before);
    expect(await accessRoute(b.id)).toBeNull();
  });
});
