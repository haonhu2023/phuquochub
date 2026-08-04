import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { UserRolesRepository } from '../src/modules/rbac/repositories/user-roles.repository';

// ADR-019 D12 (M0.1 — PDP Foundation). `getScopedGrants()`'s recursive CTE can only be proven
// correct against a REAL Postgres recursive-CTE execution — a mocked `repo.query()` unit test
// (user-roles.repository.spec.ts) only verifies OUR mapping/dedup code given fabricated rows, not
// whether the SQL's own UNION-based cycle/diamond termination and DAG-scope attribution are
// actually correct. This is the "focused integration proof" called for when a repository query
// cannot be validated meaningfully without real Postgres.
//
// Deliberately calls UserRolesRepository directly (no HTTP, no guard, no controller) — this is
// PDP-foundation-only validation, matching M0.1's dark-ship scope. The diamond-DAG scenario reuses
// the REAL seeded role_parents graph (moderator -> {contributor, local_guide} -> member) rather
// than inventing new roles, since M0.1 must not add any migration.
describe('UserRolesRepository.getScopedGrants — real Postgres recursive CTE (ADR-019 D12)', () => {
  let app: INestApplication;
  let ds: DataSource;
  let repo: UserRolesRepository;

  let userId: string;
  let placeAId: string;
  let placeBId: string;
  const userRoleIds: string[] = [];

  async function roleId(code: string): Promise<string> {
    const rows: Array<{ id: string }> = await ds.query(`SELECT id FROM roles WHERE code = $1`, [code]);
    if (!rows[0]) throw new Error(`role not seeded: ${code}`);
    return rows[0].id;
  }

  async function assignRole(
    roleCode: string,
    scopeType: 'global' | 'managed' | 'own',
    businessId: string | null,
    revoked = false,
  ): Promise<string> {
    const rid = await roleId(roleCode);
    const rows: Array<{ id: string }> = await ds.query(
      `INSERT INTO user_roles (user_id, role_id, scope_type, business_id, revoked_at)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      [userId, rid, scopeType, businessId, revoked ? new Date() : null],
    );
    userRoleIds.push(rows[0].id);
    return rows[0].id;
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();

    ds = app.get<DataSource>(getDataSourceToken());
    repo = app.get(UserRolesRepository);

    const userRows: Array<{ id: string }> = await ds.query(
      `INSERT INTO users (email, display_name) VALUES ($1, 'E2E ADR-019 Scoped Grants') RETURNING id`,
      [`e2e_adr019_scoped_${Date.now()}@phuquochub.test`],
    );
    userId = userRows[0].id;

    const [{ id: categoryId }] = await ds.query(`SELECT id FROM categories LIMIT 1`);
    const placeA: Array<{ id: string }> = await ds.query(
      `INSERT INTO places (name, slug, category_id, location, status)
       VALUES ('E2E ADR-019 Place A', $1, $2, ST_SetSRID(ST_MakePoint(103.9, 10.2), 4326)::geography, 'published')
       RETURNING id`,
      [`e2e-adr019-place-a-${Date.now()}`, categoryId],
    );
    placeAId = placeA[0].id;
    const placeB: Array<{ id: string }> = await ds.query(
      `INSERT INTO places (name, slug, category_id, location, status)
       VALUES ('E2E ADR-019 Place B', $1, $2, ST_SetSRID(ST_MakePoint(103.9, 10.2), 4326)::geography, 'published')
       RETURNING id`,
      [`e2e-adr019-place-b-${Date.now()}`, categoryId],
    );
    placeBId = placeB[0].id;
  }, 30_000);

  afterAll(async () => {
    if (ds?.isInitialized) {
      if (userRoleIds.length) await ds.query(`DELETE FROM user_roles WHERE id = ANY($1)`, [userRoleIds]);
      if (placeAId) await ds.query(`DELETE FROM places WHERE id = $1`, [placeAId]);
      if (placeBId) await ds.query(`DELETE FROM places WHERE id = $1`, [placeBId]);
      if (userId) await ds.query(`DELETE FROM users WHERE id = $1`, [userId]);
    }
    if (app) await app.close();
  });

  it('không có user_roles hiệu lực nào -> mảng rỗng', async () => {
    await expect(repo.getScopedGrants(userId)).resolves.toEqual([]);
  });

  it('hai dòng user_roles Managed khác business_id -> hai ScopedGrant Place.Edit.Managed RIÊNG BIỆT', async () => {
    await assignRole('business_manager', 'managed', placeAId);
    await assignRole('business_manager', 'managed', placeBId);

    const grants = await repo.getScopedGrants(userId);
    const managedPlaceEdits = grants.filter((g) => g.code === 'Place.Edit.Managed');

    expect(managedPlaceEdits).toHaveLength(2);
    expect(managedPlaceEdits.map((g) => g.businessId).sort()).toEqual([placeAId, placeBId].sort());
    expect(managedPlaceEdits.every((g) => g.scopeType === 'managed' && g.effect === 'allow')).toBe(true);
  });

  it('DAG hình thoi thật (moderator -> {contributor, local_guide} -> member) KHÔNG nhân bản permission của member', async () => {
    await assignRole('moderator', 'global', null);

    const grants = await repo.getScopedGrants(userId);
    // 'Business.Claim' được seed cho 'member' (SeedRbac). Tại điểm này user có BA dòng user_roles
    // gốc (business_manager×2 ở bước trước + moderator ở đây) — CẢ BA đều kế thừa 'member' (
    // business_manager -> member trực tiếp; moderator -> {contributor, local_guide} -> member), nên
    // 'Business.Claim' XUẤT HIỆN ĐÚNG BA LẦN, MỘT lần cho MỖI dòng gốc — đây là hành vi ĐÚNG (mỗi
    // scoped grant độc lập theo scope của dòng sinh ra nó), KHÔNG phải lỗi trùng lặp.
    //
    // Phép thử hình thoi THẬT SỰ nằm ở dòng riêng do 'moderator' sinh ra: role này tới được 'member'
    // qua HAI đường DAG (contributor và local_guide) — nếu recursive CTE dùng UNION ALL thay vì
    // UNION, đúng MỘT dòng (global, business_id=null) này sẽ nhân đôi. Cô lập đúng dòng đó bằng
    // scope_type/business_id (KHÔNG lẫn với hai dòng managed của business_manager ở trên).
    const fromModerator = grants.filter(
      (g) => g.code === 'Business.Claim' && g.scopeType === 'global' && g.businessId === null,
    );

    expect(fromModerator).toHaveLength(1);
    expect(fromModerator[0]).toEqual({
      code: 'Business.Claim',
      effect: 'allow',
      scopeType: 'global',
      businessId: null,
    });

    // Đối chứng: tổng cộng đúng 3 dòng Business.Claim (2 managed từ business_manager×2 + 1 global
    // từ moderator) — xác nhận rõ ràng đây KHÔNG phải một phép khử trùng quá tay xoá mất các scope
    // hợp lệ khác, mà CHỈ khử đúng bản sao THẬT (cùng scope_type+business_id+code+effect).
    const allBusinessClaim = grants.filter((g) => g.code === 'Business.Claim');
    expect(allBusinessClaim).toHaveLength(3);
  });

  it('role đã revoked (revoked_at khác NULL) KHÔNG xuất hiện trong ScopedGrant', async () => {
    await assignRole('administrator', 'global', null, /* revoked */ true);

    const grants = await repo.getScopedGrants(userId);
    // 'Role.Assign' chỉ được seed cho 'administrator' — nếu dòng revoked bị tính, nó sẽ xuất hiện.
    expect(grants.some((g) => g.code === 'Role.Assign')).toBe(false);
  });

  it('kết quả xác định (deterministic): gọi hai lần liên tiếp cho CÙNG một mảng (thứ tự + nội dung)', async () => {
    const first = await repo.getScopedGrants(userId);
    const second = await repo.getScopedGrants(userId);
    expect(second).toEqual(first);
  });
});
