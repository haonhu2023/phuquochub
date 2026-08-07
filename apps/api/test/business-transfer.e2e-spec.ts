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

// Business Ownership Transfer (business.md §5 UC-B7) — live Postgres. Owner Decision 2: authorization
// goes ENTIRELY through the existing ADR-019 Managed path (`Business.Transfer.Managed` +
// `IDENTITY_PLACE_RESOLVER`) — same proof shape as the Manager Assignment/Revocation milestone.
//
// `POST /business/{id}/transfer` is throttled 10/60s — TOTAL calls in this file kept at exactly 8
// (same convention as `business-claims.e2e-spec.ts`/`business-managers.e2e-spec.ts`).
describe('Business Ownership Transfer (live Postgres)', () => {
  let app: INestApplication;
  let ds: DataSource;
  let jwt: JwtService;
  let config: ConfigService;
  let categoryId: string;

  const userIds: string[] = [];
  const placeIds: string[] = [];

  async function createUser(label: string): Promise<{ accessToken: string; userId: string }> {
    const email = `e2e_biztransfer_${label}_${Date.now()}_${Math.random().toString(36).slice(2)}@phuquochub.test`;
    const rows: Array<{ id: string }> = await ds.query(
      `INSERT INTO users (email, display_name) VALUES ($1, $2) RETURNING id`,
      [email, `Transfer E2E ${label}`],
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
      [
        `E2E BizTransfer ${label}`,
        `e2e-biztransfer-${label}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        categoryId,
      ],
    );
    placeIds.push(rows[0].id);
    return rows[0].id;
  }

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
        if (userIds.length) await ds.query(`DELETE FROM user_roles WHERE user_id = ANY($1)`, [userIds]);
        if (placeIds.length) await ds.query(`DELETE FROM places WHERE id = ANY($1)`, [placeIds]);
        if (userIds.length) {
          // Xoá TOÀN BỘ audit_logs của user THUỘC FILE NÀY — không chỉ 'business.ownership_%'.
          // Vài test ở đây tự gọi POST /business/:id/managers làm fixture setup (gán manager trước
          // khi transfer), việc đó cũng ghi audit 'business.manager_assigned' với actor_id = owner
          // của CHÍNH file này — lọc chỉ theo 'ownership_%' bỏ sót các dòng đó và chặn DELETE users
          // bên dưới (audit_logs.actor_id NO ACTION, cùng bài học business-claims.e2e-spec.ts).
          await ds.query(`DELETE FROM audit_logs WHERE actor_id = ANY($1)`, [userIds]);
          await ds.query(`DELETE FROM users WHERE id = ANY($1)`, [userIds]);
        }
      }
    } finally {
      if (app) await app.close();
    }
  }, 30_000);

  it('anonymous -> 401', async () => {
    const placeId = await mkPlace('anon');
    const { userId: targetId } = await createUser('anon_target');
    const res = await request(app.getHttpServer())
      .post(`/api/business/${placeId}/transfer`)
      .send({ new_owner_id: targetId });
    expect(res.status).toBe(401);
  });

  it('plain member (không có Business.Transfer.Managed) -> 403', async () => {
    await mkPlaceWithOwner('plain_member'); // đảm bảo cơ sở có owner hiệu lực (bối cảnh thật)
    const { placeId } = await mkPlaceWithOwner('plain_member_target_place');
    const { accessToken: memberToken, userId: memberId } = await createUser('plain_member');
    await assignRole(memberId, 'member', 'global', null);
    const { userId: targetId } = await createUser('plain_member_target');

    const res = await request(app.getHttpServer())
      .post(`/api/business/${placeId}/transfer`)
      .set('Authorization', `Bearer ${memberToken}`)
      .send({ new_owner_id: targetId });
    expect(res.status).toBe(403);
  });

  it('business_manager (giữ Managed grant nhưng KHÔNG Business.Transfer.Managed) -> 403', async () => {
    const owner = await mkPlaceWithOwner('mgr_not_owner');
    const { accessToken: managerToken, userId: managerId } = await createUser('mgr_not_owner_manager');
    await assignRole(managerId, 'member', 'global', null);
    const assignManagerRes = await request(app.getHttpServer())
      .post(`/api/business/${owner.placeId}/managers`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ user_id: managerId });
    expect(assignManagerRes.status).toBe(201);

    const { userId: targetId } = await createUser('mgr_not_owner_target');
    const res = await request(app.getHttpServer())
      .post(`/api/business/${owner.placeId}/transfer`)
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ new_owner_id: targetId });
    expect(res.status).toBe(403);
  });

  it('không có bảng business_transfers (Owner Decision 1 — tái dùng business_members/user_roles, không bảng mới)', async () => {
    const rows = await ds.query(`SELECT to_regclass('public.business_transfers') AS reg`);
    expect(rows[0].reg).toBeNull();
  });

  it('owner transfers -> 200, membership+role đúng cả hai phía, audit đủ context, old owner mất quyền NGAY, new owner có quyền NGAY, manager giữ nguyên KHÔNG bị đụng, scoped-role revoke CHỈ cơ sở này', async () => {
    const owner = await mkPlaceWithOwner('success');

    // Owner CŨNG là owner của MỘT cơ sở khác — chứng minh bước 6 (revoke scoped business_owner)
    // CHỈ đụng businessId của cơ sở đang transfer, KHÔNG đụng grant business_owner ở cơ sở khác
    // của CÙNG user (setup thuần SQL, không tốn quota throttle của endpoint transfer).
    const otherOwnedPlaceId = await mkPlace('success_owner_other_place');
    await ds.query(`INSERT INTO business_members (place_id, user_id, role, granted_by) VALUES ($1,$2,'owner',$2)`, [
      otherOwnedPlaceId,
      owner.userId,
    ]);
    await assignRole(owner.userId, 'business_owner', 'managed', otherOwnedPlaceId);

    const { accessToken: managerToken, userId: managerId } = await createUser('success_manager');
    await assignRole(managerId, 'member', 'global', null);
    const assignManagerRes = await request(app.getHttpServer())
      .post(`/api/business/${owner.placeId}/managers`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ user_id: managerId });
    expect(assignManagerRes.status).toBe(201);
    const managerMembershipId = assignManagerRes.body.data.id;

    const newOwner = await createUser('success_new_owner');
    await assignRole(newOwner.userId, 'member', 'global', null);

    // Owner THẬT SỰ sửa được cơ sở TRƯỚC transfer.
    const beforeTransfer = await request(app.getHttpServer())
      .patch(`/api/places/${owner.placeId}`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ name: 'Place — edited by old owner before transfer' });
    expect(beforeTransfer.status).toBe(200);

    const transferRes = await request(app.getHttpServer())
      .post(`/api/business/${owner.placeId}/transfer`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ new_owner_id: newOwner.userId, reason: 'bán cơ sở' });

    expect(transferRes.status).toBe(200);
    expect(transferRes.body.data.role).toBe('owner');
    expect(transferRes.body.data.user_id).toBe(newOwner.userId);
    expect(transferRes.body.data.place_id).toBe(owner.placeId);

    // business_members: owner cũ đã revoke, owner mới hiệu lực.
    const oldOwnerMember = await ds.query(
      `SELECT revoked_at FROM business_members WHERE place_id=$1 AND user_id=$2 AND role='owner'`,
      [owner.placeId, owner.userId],
    );
    expect(oldOwnerMember[0].revoked_at).not.toBeNull();

    const newOwnerMember = await ds.query(
      `SELECT role, revoked_at, claim_id, granted_by FROM business_members WHERE place_id=$1 AND user_id=$2 AND role='owner'`,
      [owner.placeId, newOwner.userId],
    );
    expect(newOwnerMember).toHaveLength(1);
    expect(newOwnerMember[0].revoked_at).toBeNull();
    expect(newOwnerMember[0].claim_id).toBeNull();
    expect(newOwnerMember[0].granted_by).toBe(owner.userId);

    // user_roles: grant cũ thu hồi, grant mới hiệu lực (scope managed, business_id đúng).
    const oldGrant = await ds.query(
      `SELECT 1 FROM user_roles ur JOIN roles r ON r.id=ur.role_id
        WHERE ur.user_id=$1 AND r.code='business_owner' AND ur.business_id=$2 AND ur.revoked_at IS NULL`,
      [owner.userId, owner.placeId],
    );
    expect(oldGrant).toHaveLength(0);

    const newGrant = await ds.query(
      `SELECT ur.scope_type, ur.business_id FROM user_roles ur JOIN roles r ON r.id=ur.role_id
        WHERE ur.user_id=$1 AND r.code='business_owner' AND ur.revoked_at IS NULL`,
      [newOwner.userId],
    );
    expect(newGrant).toHaveLength(1);
    expect(newGrant[0].scope_type).toBe('managed');
    expect(newGrant[0].business_id).toBe(owner.placeId);

    // Grant business_owner của owner CŨ ở cơ sở KHÁC (otherOwnedPlaceId) KHÔNG bị đụng — revoke
    // đúng CHỈ businessId đang transfer, không phải MỌI grant business_owner của user này.
    const otherPlaceGrant = await ds.query(
      `SELECT ur.business_id, ur.revoked_at FROM user_roles ur JOIN roles r ON r.id=ur.role_id
        WHERE ur.user_id=$1 AND r.code='business_owner' AND ur.business_id=$2`,
      [owner.userId, otherOwnedPlaceId],
    );
    expect(otherPlaceGrant).toHaveLength(1);
    expect(otherPlaceGrant[0].revoked_at).toBeNull();
    const otherPlaceMembership = await ds.query(
      `SELECT revoked_at FROM business_members WHERE place_id=$1 AND user_id=$2 AND role='owner'`,
      [otherOwnedPlaceId, owner.userId],
    );
    expect(otherPlaceMembership[0].revoked_at).toBeNull();

    // audit — event + context đủ trường theo Owner Decision 1.
    const auditRows = await ds.query(
      `SELECT event, context FROM audit_logs WHERE entity_type='business_member' AND actor_id=$1 ORDER BY created_at DESC LIMIT 1`,
      [owner.userId],
    );
    expect(auditRows[0].event).toBe('business.ownership_transferred');
    const ctx = auditRows[0].context;
    expect(ctx.business_id).toBe(owner.placeId);
    expect(ctx.from_user_id).toBe(owner.userId);
    expect(ctx.to_user_id).toBe(newOwner.userId);
    expect(ctx.initiated_by).toBe(owner.userId);
    expect(ctx.reason).toBe('bán cơ sở');
    expect(ctx.new_membership_id).toBeDefined();
    expect(ctx.old_membership_id).toBeDefined();
    expect(ctx.new_user_role_id).toBeDefined();
    expect(ctx.old_user_role_id).toBeDefined();
    expect(ctx.old_user_role_revoked).toBe(true);

    // Sau transfer: owner CŨ mất quyền Managed NGAY.
    const oldOwnerAfter = await request(app.getHttpServer())
      .patch(`/api/places/${owner.placeId}`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ name: 'SHOULD NOT APPLY' });
    expect(oldOwnerAfter.status).toBe(403);

    // Owner MỚI có quyền Managed NGAY.
    const newOwnerAfter = await request(app.getHttpServer())
      .patch(`/api/places/${owner.placeId}`)
      .set('Authorization', `Bearer ${newOwner.accessToken}`)
      .send({ name: 'Place — edited by new owner after transfer' });
    expect(newOwnerAfter.status).toBe(200);

    // Manager giữ NGUYÊN — business_members KHÔNG đổi, quyền Managed vẫn hoạt động.
    const managerMember = await ds.query(`SELECT revoked_at FROM business_members WHERE id=$1`, [
      managerMembershipId,
    ]);
    expect(managerMember[0].revoked_at).toBeNull();
    const managerStillWorks = await request(app.getHttpServer())
      .patch(`/api/places/${owner.placeId}`)
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ name: 'Place — manager unaffected by ownership transfer' });
    expect(managerStillWorks.status).toBe(200);
  });

  it('owner transfers MỘT cơ sở KHÁC (không phải của mình) -> 403 (ADR-019 cross-business isolation)', async () => {
    const owner = await mkPlaceWithOwner('cross');
    const otherPlace = await mkPlaceWithOwner('cross_other');
    const target = await createUser('cross_target');
    await assignRole(target.userId, 'member', 'global', null);

    const res = await request(app.getHttpServer())
      .post(`/api/business/${otherPlace.placeId}/transfer`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ new_owner_id: target.userId });
    expect(res.status).toBe(403);

    // cơ sở KHÁC không bị đụng — owner của nó vẫn nguyên.
    const stillOwner = await ds.query(
      `SELECT revoked_at FROM business_members WHERE place_id=$1 AND user_id=$2 AND role='owner'`,
      [otherPlace.placeId, otherPlace.userId],
    );
    expect(stillOwner[0].revoked_at).toBeNull();
  });

  it('transfer cho chính owner hiện tại -> 409', async () => {
    const owner = await mkPlaceWithOwner('self_transfer');
    const res = await request(app.getHttpServer())
      .post(`/api/business/${owner.placeId}/transfer`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ new_owner_id: owner.userId });
    expect(res.status).toBe(409);
  });

  it('transfer cho user đang có vai trò hiệu lực khác (manager) -> 409, managers giữ nguyên', async () => {
    const owner = await mkPlaceWithOwner('to_manager');
    const { userId: managerId } = await createUser('to_manager_target');
    await assignRole(managerId, 'member', 'global', null);
    const assignRes = await request(app.getHttpServer())
      .post(`/api/business/${owner.placeId}/managers`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ user_id: managerId });
    expect(assignRes.status).toBe(201);

    const res = await request(app.getHttpServer())
      .post(`/api/business/${owner.placeId}/transfer`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ new_owner_id: managerId });
    expect(res.status).toBe(409);

    const managerStillActive = await ds.query(
      `SELECT revoked_at, role FROM business_members WHERE place_id=$1 AND user_id=$2`,
      [owner.placeId, managerId],
    );
    expect(managerStillActive[0].revoked_at).toBeNull();
    expect(managerStillActive[0].role).toBe('manager');
  });

  it('transfer cho user không tồn tại -> 404, KHÔNG đổi gì', async () => {
    const owner = await mkPlaceWithOwner('missing_target');
    const res = await request(app.getHttpServer())
      .post(`/api/business/${owner.placeId}/transfer`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ new_owner_id: '00000000-0000-4000-8000-000000000000' });
    expect(res.status).toBe(404);

    const stillOwner = await ds.query(
      `SELECT revoked_at FROM business_members WHERE place_id=$1 AND user_id=$2 AND role='owner'`,
      [owner.placeId, owner.userId],
    );
    expect(stillOwner[0].revoked_at).toBeNull();
  });
});
