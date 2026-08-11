import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { TransformInterceptor } from '../src/common/interceptors/transform.interceptor';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';

// Business Manager Assignment/Revocation (business.md §5 UC-B6) — live Postgres. Owner Decision 5:
// authorization goes ENTIRELY through the existing ADR-019 Managed path
// (`Business.Manager.Assign.Managed`/`Revoke.Managed` + `IDENTITY_PLACE_RESOLVER`) — this file's
// core job is proving that mechanism actually gates these two new endpoints correctly, the same
// shape of proof as `authz-scoped-pep-rollout.e2e-spec.ts` and M3's own ADR-019 integration test.
//
// Owners seeded DIRECTLY via SQL (business_members(owner) + user_roles), matching
// `authz-scoped-pep-rollout.e2e-spec.ts`'s convention — the claim->approval path is already proven
// in `business-claims.e2e-spec.ts`; this file isolates the manager endpoints themselves.
//
// EVERY test that needs "an owner" creates its OWN fresh place — `uq_member_owner` (partial
// unique, ADR-015 BR-B2) allows only ONE active owner per place, so places cannot be shared across
// independent owner-seeding tests within the same file.
describe('Business Manager Assignment/Revocation (live Postgres)', () => {
  let app: INestApplication;
  let ds: DataSource;
  let jwt: JwtService;
  let config: ConfigService;
  let categoryId: string;

  const userIds: string[] = [];
  const placeIds: string[] = [];

  async function createUser(label: string): Promise<{ accessToken: string; userId: string }> {
    const email = `e2e_bizmgr_${label}_${Date.now()}_${Math.random().toString(36).slice(2)}@phuquochub.test`;
    const rows: Array<{ id: string }> = await ds.query(
      `INSERT INTO users (email, display_name) VALUES ($1, $2) RETURNING id`,
      [email, `BizMgr E2E ${label}`],
    );
    const userId = rows[0].id;
    userIds.push(userId);
    const accessTtl = config.get<number>('jwt.accessTtl') ?? 900;
    const accessToken = await jwt.signAsync(
      { sub: userId, email, type: 'access' },
      { secret: config.get<string>('jwt.accessSecret'), expiresIn: accessTtl },
    );
    return { accessToken, userId };
  }

  async function assignRole(
    userId: string,
    roleCode: string,
    scopeType: 'global' | 'managed' | 'own',
    businessId: string | null,
  ): Promise<void> {
    const [{ id: roleId }] = await ds.query(`SELECT id FROM roles WHERE code = $1`, [roleCode]);
    await ds.query(`INSERT INTO user_roles (user_id, role_id, scope_type, business_id) VALUES ($1,$2,$3,$4)`, [
      userId,
      roleId,
      scopeType,
      businessId,
    ]);
  }

  async function mkPlace(label: string): Promise<string> {
    const rows: Array<{ id: string }> = await ds.query(
      `INSERT INTO places (name, slug, category_id, location, status)
       VALUES ($1, $2, $3, ST_SetSRID(ST_MakePoint(103.9, 10.2), 4326)::geography, 'published')
       RETURNING id`,
      [`E2E BizMgr ${label}`, `e2e-bizmgr-${label}-${Date.now()}-${Math.random().toString(36).slice(2)}`, categoryId],
    );
    placeIds.push(rows[0].id);
    return rows[0].id;
  }

  /** Tạo MỘT place mới + owner hiệu lực THẬT cho place đó (business_members + user_roles). */
  async function mkPlaceWithOwner(
    label: string,
  ): Promise<{ placeId: string; accessToken: string; userId: string }> {
    const placeId = await mkPlace(label);
    const owner = await createUser(`${label}_owner`);
    await ds.query(
      `INSERT INTO business_members (place_id, user_id, role, granted_by) VALUES ($1, $2, 'owner', $2)`,
      [placeId, owner.userId],
    );
    await assignRole(owner.userId, 'business_owner', 'managed', placeId);
    return { placeId, ...owner };
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    app.useGlobalInterceptors(new TransformInterceptor());
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();

    ds = app.get<DataSource>(getDataSourceToken());
    jwt = app.get(JwtService);
    config = app.get(ConfigService);

    const [{ id }] = await ds.query(`SELECT id FROM categories LIMIT 1`);
    categoryId = id;
  }, 60_000);

  // Teardown hang fix (2026-08-07): dọn dẹp trong `try` — nếu một bước ném lỗi, `finally` vẫn đảm
  // bảo `app.close()` chạy (không thì Nest/TypeORM giữ handle mở, Jest treo sau khi in kết quả).
  // KHÔNG nuốt lỗi bằng `.catch()`: lỗi dọn dẹp vẫn nổi lên sau `finally`.
  afterAll(async () => {
    try {
      if (ds?.isInitialized) {
        if (userIds.length || placeIds.length) {
          await ds.query(
            `DELETE FROM wiki_revisions WHERE editor_id = ANY($1) OR (entity_type='place' AND entity_id = ANY($2))`,
            [userIds, placeIds],
          );
        }
        // user_roles.business_id -> places NO ACTION -> xoá TRƯỚC places (bài học từ business-claims.e2e-spec.ts).
        if (userIds.length) await ds.query(`DELETE FROM user_roles WHERE user_id = ANY($1)`, [userIds]);
        if (placeIds.length) await ds.query(`DELETE FROM places WHERE id = ANY($1)`, [placeIds]);
        if (userIds.length) {
          await ds.query(`DELETE FROM audit_logs WHERE actor_id = ANY($1) AND event LIKE 'business.manager_%'`, [
            userIds,
          ]);
          await ds.query(`DELETE FROM users WHERE id = ANY($1)`, [userIds]);
        }
      }
    } finally {
      if (app) await app.close();
    }
  }, 30_000);

  it('anonymous -> 401 trên assign', async () => {
    const placeId = await mkPlace('anon');
    const res = await request(app.getHttpServer())
      .post(`/api/business/${placeId}/managers`)
      .send({ user_id: '00000000-0000-4000-8000-000000000000' });
    expect(res.status).toBe(401);
  });

  it('plain member (không có Business.Manager.Assign.Managed) -> 403', async () => {
    const { placeId } = await mkPlaceWithOwner('plain_member'); // đảm bảo place CÓ owner hiệu lực (bối cảnh thật)
    const { accessToken: memberToken, userId: memberId } = await createUser('plain_member');
    await assignRole(memberId, 'member', 'global', null);

    const res = await request(app.getHttpServer())
      .post(`/api/business/${placeId}/managers`)
      .set('Authorization', `Bearer ${memberToken}`)
      .send({ user_id: '00000000-0000-4000-8000-000000000000' });
    expect(res.status).toBe(403);
  });

  it('owner assigns manager cho ĐÚNG cơ sở của mình -> 200/201, business_members + user_roles scoped grant thật', async () => {
    const owner = await mkPlaceWithOwner('assign');
    const target = await createUser('assign_target');
    await assignRole(target.userId, 'member', 'global', null);

    const res = await request(app.getHttpServer())
      .post(`/api/business/${owner.placeId}/managers`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ user_id: target.userId });

    expect(res.status).toBe(201);
    expect(res.body.data.role).toBe('manager');
    expect(res.body.data.place_id).toBe(owner.placeId);
    expect(res.body.data.user_id).toBe(target.userId);
    expect(res.body.data.granted_by).toBe(owner.userId);

    const members = await ds.query(
      `SELECT role, revoked_at FROM business_members WHERE place_id=$1 AND user_id=$2`,
      [owner.placeId, target.userId],
    );
    expect(members).toHaveLength(1);
    expect(members[0].role).toBe('manager');
    expect(members[0].revoked_at).toBeNull();

    const grants = await ds.query(
      `SELECT ur.scope_type, ur.business_id, r.code AS role_code
         FROM user_roles ur JOIN roles r ON r.id=ur.role_id
        WHERE ur.user_id=$1 AND ur.revoked_at IS NULL`,
      [target.userId],
    );
    const managerGrant = grants.find((g: { role_code: string }) => g.role_code === 'business_manager');
    expect(managerGrant).toBeDefined();
    expect(managerGrant.scope_type).toBe('managed');
    expect(managerGrant.business_id).toBe(owner.placeId);

    const auditRows = await ds.query(
      `SELECT event FROM audit_logs WHERE entity_type='business_member' AND actor_id=$1 ORDER BY created_at DESC LIMIT 1`,
      [owner.userId],
    );
    expect(auditRows[0]?.event).toBe('business.manager_assigned');

    // Đúng permission chain end-to-end — người VỪA được gán manager KHÔNG có
    // Business.Manager.Assign.Managed (chỉ business_owner giữ) -> tự họ gán manager khác -> 403.
    const chained = await request(app.getHttpServer())
      .post(`/api/business/${owner.placeId}/managers`)
      .set('Authorization', `Bearer ${target.accessToken}`)
      .send({ user_id: owner.userId });
    expect(chained.status).toBe(403);
  });

  it('owner assigns manager cho MỘT cơ sở KHÁC (không phải của mình) -> 403 (ADR-019 cross-business isolation)', async () => {
    const owner = await mkPlaceWithOwner('cross_owner');
    const otherPlaceId = await mkPlace('cross_other');
    const target = await createUser('cross_target');
    await assignRole(target.userId, 'member', 'global', null);

    const res = await request(app.getHttpServer())
      .post(`/api/business/${otherPlaceId}/managers`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ user_id: target.userId });

    expect(res.status).toBe(403);
    const members = await ds.query(`SELECT 1 FROM business_members WHERE place_id=$1 AND user_id=$2`, [
      otherPlaceId,
      target.userId,
    ]);
    expect(members).toHaveLength(0);
  });

  it('assign target đã là owner của cơ sở đó -> 409 (một vai trò hiệu lực/người/cơ sở)', async () => {
    const owner = await mkPlaceWithOwner('self_conflict');

    const res = await request(app.getHttpServer())
      .post(`/api/business/${owner.placeId}/managers`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ user_id: owner.userId });

    expect(res.status).toBe(409);
  });

  it('assign target đã là manager hiệu lực -> 409 (chống trùng)', async () => {
    const owner = await mkPlaceWithOwner('dup');
    const target = await createUser('dup_target');
    await assignRole(target.userId, 'member', 'global', null);

    const first = await request(app.getHttpServer())
      .post(`/api/business/${owner.placeId}/managers`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ user_id: target.userId });
    expect(first.status).toBe(201);

    const second = await request(app.getHttpServer())
      .post(`/api/business/${owner.placeId}/managers`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ user_id: target.userId });
    expect(second.status).toBe(409);
  });

  it('revoke: owner thu hồi manager -> 200, business_members.revoked_at + user_roles đều thu hồi, quyền Managed CỦA manager mất hiệu lực ngay (PATCH /places/:id -> 403)', async () => {
    const owner = await mkPlaceWithOwner('revoke');
    const target = await createUser('revoke_target');
    await assignRole(target.userId, 'member', 'global', null);

    const assignRes = await request(app.getHttpServer())
      .post(`/api/business/${owner.placeId}/managers`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ user_id: target.userId });
    expect(assignRes.status).toBe(201);

    // Trước khi revoke: manager THẬT SỰ sửa được cơ sở (chứng minh grant có hiệu lực).
    const beforeRevoke = await request(app.getHttpServer())
      .patch(`/api/places/${owner.placeId}`)
      .set('Authorization', `Bearer ${target.accessToken}`)
      .send({ name: 'Place — edited by manager before revoke' });
    expect(beforeRevoke.status).toBe(200);

    const revokeRes = await request(app.getHttpServer())
      .delete(`/api/business/${owner.placeId}/managers/${target.userId}`)
      .set('Authorization', `Bearer ${owner.accessToken}`);
    expect(revokeRes.status).toBe(200);

    const members = await ds.query(`SELECT revoked_at FROM business_members WHERE place_id=$1 AND user_id=$2`, [
      owner.placeId,
      target.userId,
    ]);
    expect(members[0].revoked_at).not.toBeNull();

    const grants = await ds.query(
      `SELECT 1 FROM user_roles ur JOIN roles r ON r.id=ur.role_id
        WHERE ur.user_id=$1 AND r.code='business_manager' AND ur.revoked_at IS NULL`,
      [target.userId],
    );
    expect(grants).toHaveLength(0);

    // Sau khi revoke: quyền Managed mất hiệu lực NGAY — cùng manager KHÔNG còn sửa được cơ sở đó.
    const afterRevoke = await request(app.getHttpServer())
      .patch(`/api/places/${owner.placeId}`)
      .set('Authorization', `Bearer ${target.accessToken}`)
      .send({ name: 'SHOULD NOT APPLY' });
    expect(afterRevoke.status).toBe(403);

    const auditRows = await ds.query(
      `SELECT event FROM audit_logs WHERE entity_type='business_member' AND actor_id=$1 ORDER BY created_at DESC LIMIT 1`,
      [owner.userId],
    );
    expect(auditRows[0]?.event).toBe('business.manager_revoked');
  });

  it('revoke target không phải manager hiệu lực (chưa từng gán) -> 404', async () => {
    const owner = await mkPlaceWithOwner('revoke_404');
    const stranger = await createUser('revoke_404_stranger');

    const res = await request(app.getHttpServer())
      .delete(`/api/business/${owner.placeId}/managers/${stranger.userId}`)
      .set('Authorization', `Bearer ${owner.accessToken}`);
    expect(res.status).toBe(404);
  });

  it('revoke nhắm vào chính owner (không phải manager) -> 404 (BR-B6: endpoint này không gỡ owner)', async () => {
    const owner = await mkPlaceWithOwner('revoke_owner_self');

    const res = await request(app.getHttpServer())
      .delete(`/api/business/${owner.placeId}/managers/${owner.userId}`)
      .set('Authorization', `Bearer ${owner.accessToken}`);
    expect(res.status).toBe(404);
  });

  it('user là manager ở NHIỀU cơ sở: thu hồi ở cơ sở A KHÔNG đụng grant ở cơ sở B (businessId-scoped revoke)', async () => {
    const ownerA = await mkPlaceWithOwner('multi_A');
    const ownerB = await mkPlaceWithOwner('multi_B');
    const target = await createUser('multi_target');
    await assignRole(target.userId, 'member', 'global', null);

    const atA = await request(app.getHttpServer())
      .post(`/api/business/${ownerA.placeId}/managers`)
      .set('Authorization', `Bearer ${ownerA.accessToken}`)
      .send({ user_id: target.userId });
    expect(atA.status).toBe(201);

    const atB = await request(app.getHttpServer())
      .post(`/api/business/${ownerB.placeId}/managers`)
      .set('Authorization', `Bearer ${ownerB.accessToken}`)
      .send({ user_id: target.userId });
    expect(atB.status).toBe(201);

    const revokeA = await request(app.getHttpServer())
      .delete(`/api/business/${ownerA.placeId}/managers/${target.userId}`)
      .set('Authorization', `Bearer ${ownerA.accessToken}`);
    expect(revokeA.status).toBe(200);

    // Grant tại B PHẢI còn nguyên — đây là lý do UserRolesRepository.revoke() cần businessId tường minh.
    const grantsB = await ds.query(
      `SELECT ur.business_id FROM user_roles ur JOIN roles r ON r.id=ur.role_id
        WHERE ur.user_id=$1 AND r.code='business_manager' AND ur.revoked_at IS NULL`,
      [target.userId],
    );
    expect(grantsB).toHaveLength(1);
    expect(grantsB[0].business_id).toBe(ownerB.placeId);

    const memberB = await ds.query(`SELECT revoked_at FROM business_members WHERE place_id=$1 AND user_id=$2`, [
      ownerB.placeId,
      target.userId,
    ]);
    expect(memberB[0].revoked_at).toBeNull();

    // Vẫn sửa được cơ sở B qua grant B chưa bị đụng.
    const stillWorksAtB = await request(app.getHttpServer())
      .patch(`/api/places/${ownerB.placeId}`)
      .set('Authorization', `Bearer ${target.accessToken}`)
      .send({ name: 'Place B — still managed after revoke at A' });
    expect(stillWorksAtB.status).toBe(200);
  });

  // GET /business/{id}/managers + GET /business/{id}/managers/lookup — Manager Management
  // prerequisite gap. Cùng cổng phân quyền `Business.Manager.Assign.Managed` (chỉ business_owner)
  // đã được chứng minh ở các test assign/revoke phía trên — trọng tâm ở đây là: field an toàn,
  // không rò password_hash/email của người lạ, cách ly cross-business, owner/revoked không lọt vào
  // danh sách, và toàn bộ luồng lookup->assign->list->revoke->list hoạt động đầu-cuối.
  describe('GET /business/{id}/managers + lookup', () => {
    it('anonymous -> 401 trên cả list và lookup', async () => {
      const placeId = await mkPlace('list_anon');
      const list = await request(app.getHttpServer()).get(`/api/business/${placeId}/managers`);
      expect(list.status).toBe(401);
      const lookup = await request(app.getHttpServer()).get(
        `/api/business/${placeId}/managers/lookup?email=nobody@phuquochub.test`,
      );
      expect(lookup.status).toBe(401);
    });

    it('plain member (không Business.Manager.Assign.Managed) -> 403 trên cả list và lookup', async () => {
      const { placeId } = await mkPlaceWithOwner('list_member');
      const { accessToken: memberToken, userId: memberId } = await createUser('list_member');
      await assignRole(memberId, 'member', 'global', null);

      const list = await request(app.getHttpServer())
        .get(`/api/business/${placeId}/managers`)
        .set('Authorization', `Bearer ${memberToken}`);
      expect(list.status).toBe(403);

      const lookup = await request(app.getHttpServer())
        .get(`/api/business/${placeId}/managers/lookup?email=nobody@phuquochub.test`)
        .set('Authorization', `Bearer ${memberToken}`);
      expect(lookup.status).toBe(403);
    });

    it('owner của MỘT cơ sở khác -> 403 khi list cơ sở này (cross-business isolation, ADR-019)', async () => {
      const { placeId } = await mkPlaceWithOwner('list_target');
      const otherOwner = await mkPlaceWithOwner('list_cross');

      const res = await request(app.getHttpServer())
        .get(`/api/business/${placeId}/managers`)
        .set('Authorization', `Bearer ${otherOwner.accessToken}`);
      expect(res.status).toBe(403);
    });

    it('cơ sở chưa có manager nào -> 200 mảng rỗng', async () => {
      const owner = await mkPlaceWithOwner('list_empty');
      const res = await request(app.getHttpServer())
        .get(`/api/business/${owner.placeId}/managers`)
        .set('Authorization', `Bearer ${owner.accessToken}`);
      expect(res.status).toBe(200);
      expect(res.body.data).toEqual([]);
    });

    it('lookup email không tồn tại -> 404', async () => {
      const owner = await mkPlaceWithOwner('lookup_404');
      const res = await request(app.getHttpServer())
        .get(`/api/business/${owner.placeId}/managers/lookup?email=khong-ton-tai-${Date.now()}@phuquochub.test`)
        .set('Authorization', `Bearer ${owner.accessToken}`);
      expect(res.status).toBe(404);
    });

    it('luồng đầy đủ: lookup email -> assign bằng user_id trả về -> xuất hiện trong list (field an toàn, KHÔNG owner/revoked) -> revoke -> biến mất khỏi list', async () => {
      const owner = await mkPlaceWithOwner('full_flow');
      const target = await createUser('full_flow_target');
      await assignRole(target.userId, 'member', 'global', null);
      const targetEmail = `e2e_bizmgr_full_flow_target_${Date.now()}@phuquochub.test`;
      // createUser() ở trên tự sinh email random khác targetEmail — ghi đè lại ĐÚNG email đã biết để
      // lookup theo email hoạt động (không có API nào set email theo ý test khác).
      await ds.query(`UPDATE users SET email=$1, display_name=$2 WHERE id=$3`, [
        targetEmail,
        'Full Flow Target',
        target.userId,
      ]);

      const lookup = await request(app.getHttpServer())
        .get(`/api/business/${owner.placeId}/managers/lookup?email=${encodeURIComponent(targetEmail)}`)
        .set('Authorization', `Bearer ${owner.accessToken}`);
      expect(lookup.status).toBe(200);
      expect(lookup.body.data).toEqual({ user_id: target.userId, display_name: 'Full Flow Target' });
      expect(lookup.body.data).not.toHaveProperty('email');

      const assignRes = await request(app.getHttpServer())
        .post(`/api/business/${owner.placeId}/managers`)
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .send({ user_id: lookup.body.data.user_id });
      expect(assignRes.status).toBe(201);

      const listAfterAssign = await request(app.getHttpServer())
        .get(`/api/business/${owner.placeId}/managers`)
        .set('Authorization', `Bearer ${owner.accessToken}`);
      expect(listAfterAssign.status).toBe(200);
      expect(listAfterAssign.body.data).toEqual([
        {
          user_id: target.userId,
          display_name: 'Full Flow Target',
          email: targetEmail,
          role: 'manager',
          granted_at: expect.any(String),
        },
      ]);
      // Owner của chính cơ sở này KHÔNG xuất hiện trong danh sách "managers" (chỉ role=manager).
      const ownerIds = listAfterAssign.body.data.map((m: { user_id: string }) => m.user_id);
      expect(ownerIds).not.toContain(owner.userId);
      // Không field nội bộ/nhạy cảm nào lọt ra.
      expect(JSON.stringify(listAfterAssign.body)).not.toContain('password');
      expect(listAfterAssign.body.data[0]).not.toHaveProperty('revoked_at');
      expect(listAfterAssign.body.data[0]).not.toHaveProperty('granted_by');
      expect(listAfterAssign.body.data[0]).not.toHaveProperty('place_id');

      const revokeRes = await request(app.getHttpServer())
        .delete(`/api/business/${owner.placeId}/managers/${target.userId}`)
        .set('Authorization', `Bearer ${owner.accessToken}`);
      expect(revokeRes.status).toBe(200);

      const listAfterRevoke = await request(app.getHttpServer())
        .get(`/api/business/${owner.placeId}/managers`)
        .set('Authorization', `Bearer ${owner.accessToken}`);
      expect(listAfterRevoke.status).toBe(200);
      expect(listAfterRevoke.body.data).toEqual([]);
    });
  });
});
