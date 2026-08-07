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

// ADR-015 Claim Decision Workflow (Business Claim Foundation) — bằng chứng end-to-end trên
// Postgres THẬT (migration InitBusinessClaims/SeedBusinessPermissions đã chạy). Bao gồm PHASE 9
// (bắt buộc): sau khi một claim được approve, `business_owner` scope Managed vừa cấp phải hoạt
// động qua đúng đường ADR-019 đã triển khai (PATCH /places/:id) — own place 200, place khác 403.
//
// `POST /business-claims` (submit) giới hạn `@Throttle 10/60s` (business-claims.controller.ts) —
// cùng quy ước `bookings.e2e-spec.ts` (POST /bookings cũng 10/60s): TỔNG số lần gọi submit trong
// suốt file này được giữ ĐÚNG 10 (đếm ở cuối mỗi test), tái dùng MỘT claim cho nhiều assertion khi
// state không bị tiêu thụ, thay vì nâng giới hạn thật lên chỉ để tiện test.
describe('ADR-015 Business Claim Foundation (live Postgres)', () => {
  let app: INestApplication;
  let ds: DataSource;
  let jwt: JwtService;
  let config: ConfigService;

  let placeAId: string;
  let placeBId: string;
  const userIds: string[] = [];
  const placeIds: string[] = [];
  // CLAIM -> SOURCE -> VERIFICATION INTEGRATION (2026-08-06): `sources` KHÔNG cascade từ `places`
  // (verifications.source_id là ON DELETE NO ACTION) — track ID CHÍNH XÁC để dọn sạch ở afterAll
  // (X1/ADR-008 CORRECTION: dọn theo id đã track, KHÔNG dựa vào filter mơ hồ).
  const sourceIds: string[] = [];

  async function createUser(label: string): Promise<{ accessToken: string; userId: string }> {
    const email = `e2e_biz_${label}_${Date.now()}_${Math.random().toString(36).slice(2)}@phuquochub.test`;
    const rows: Array<{ id: string }> = await ds.query(
      `INSERT INTO users (email, display_name) VALUES ($1, $2) RETURNING id`,
      [email, `Business E2E ${label}`],
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
    const roleRows: Array<{ id: string }> = await ds.query(`SELECT id FROM roles WHERE code = $1`, [roleCode]);
    if (!roleRows[0]) throw new Error(`role not seeded: ${roleCode}`);
    await ds.query(
      `INSERT INTO user_roles (user_id, role_id, scope_type, business_id) VALUES ($1, $2, $3, $4)`,
      [userId, roleRows[0].id, scopeType, businessId],
    );
  }

  async function createMember(label: string) {
    const u = await createUser(label);
    await assignRole(u.userId, 'member', 'global', null);
    return u;
  }

  async function createModerator(label: string) {
    const u = await createUser(label);
    await assignRole(u.userId, 'moderator', 'global', null);
    return u;
  }

  const evidence = [{ type: 'business_license', reference: 'media-e2e-1' }];

  async function submitClaim(token: string, placeId: string) {
    return request(app.getHttpServer())
      .post('/api/business-claims')
      .set('Authorization', `Bearer ${token}`)
      .send({ place_id: placeId, evidence });
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

    const [{ id: categoryId }] = await ds.query(`SELECT id FROM categories LIMIT 1`);
    const mkPlace = async (name: string) => {
      const rows: Array<{ id: string }> = await ds.query(
        `INSERT INTO places (name, slug, category_id, location, status)
         VALUES ($1, $2, $3, ST_SetSRID(ST_MakePoint(103.9, 10.2), 4326)::geography, 'published')
         RETURNING id`,
        [name, `${name.toLowerCase().replace(/\s+/g, '-')}-${Date.now()}`, categoryId],
      );
      placeIds.push(rows[0].id);
      return rows[0].id;
    };
    placeAId = await mkPlace('E2E Business Claim Place A');
    placeBId = await mkPlace('E2E Business Claim Place B');
  }, 60_000);

  // Teardown hang fix (2026-08-07): dọn dẹp trong `try` — nếu một bước ném lỗi, `finally` vẫn đảm
  // bảo `app.close()` chạy (không thì Nest/TypeORM giữ handle mở, Jest treo sau khi in kết quả).
  // KHÔNG nuốt lỗi bằng `.catch()`: lỗi dọn dẹp vẫn nổi lên sau `finally`.
  afterAll(async () => {
    try {
      if (ds?.isInitialized) {
        // wiki_revisions không cascade từ places/users — xoá TRƯỚC (owner PATCH place tạo revision).
        if (userIds.length || placeIds.length) {
          await ds.query(
            `DELETE FROM wiki_revisions WHERE editor_id = ANY($1) OR (entity_type = 'place' AND entity_id = ANY($2))`,
            [userIds, placeIds],
          );
        }
        // user_roles.business_id -> places là FK ON DELETE NO ACTION (AddUserRoleBusinessFk) — PHẢI
        // xoá user_roles (business_owner grant từ decide() approve trỏ business_id=placeA/B) TRƯỚC
        // khi xoá places, không thì DELETE places vi phạm fk_user_roles_business.
        if (userIds.length) await ds.query(`DELETE FROM user_roles WHERE user_id = ANY($1)`, [userIds]);
        // Xoá places SAU user_roles: business_claims.place_id/business_members.place_id CASCADE từ
        // places -> tự động dọn sạch mọi claim/membership tạo trong test (zero residue), VÀ
        // verifications.place_id/verification_events.verification_id (ON DELETE CASCADE, xem
        // InitVerifications) -> dọn sạch cả dòng `verifications`/`verification_events` do claim
        // approve tạo. users vẫn an toàn để xoá sau đó vì business_claims.requester_id (NO ACTION)
        // không còn dòng nào trỏ tới.
        if (placeIds.length) await ds.query(`DELETE FROM places WHERE id = ANY($1)`, [placeIds]);
        // `sources` KHÔNG cascade từ places (verifications.source_id NO ACTION) — xoá RIÊNG, SAU khi
        // places (và verifications tham chiếu nó) đã bị xoá, theo ĐÚNG id đã track ở sourceIds.
        if (sourceIds.length) await ds.query(`DELETE FROM sources WHERE id = ANY($1)`, [sourceIds]);
        // audit_logs.actor_id -> users là FK ON DELETE NO ACTION (ADR-016: append-only, không
        // cascade theo thiết kế THẬT — production KHÔNG bao giờ tự xoá audit trail). Ở ĐÂY là dọn
        // fixture test throwaway của CHÍNH file này (event bắt đầu 'business.claim_'), cùng tiền lệ
        // `moderation-media-decision.e2e-spec.ts` afterAll — KHÔNG đụng audit_logs thật nào khác.
        if (userIds.length) {
          await ds.query(`DELETE FROM audit_logs WHERE actor_id = ANY($1) AND event LIKE 'business.claim_%'`, [
            userIds,
          ]);
        }
        if (userIds.length) await ds.query(`DELETE FROM users WHERE id = ANY($1)`, [userIds]);
      }
    } finally {
      if (app) await app.close();
    }
  }, 30_000);

  it('anonymous -> 401 trên submit', async () => {
    const res = await request(app.getHttpServer()).post('/api/business-claims').send({ place_id: placeAId, evidence });
    expect(res.status).toBe(401);
  });

  it('member submit claim -> 201 (response KHÔNG evidence); resubmit CÙNG place -> 409', async () => {
    const { accessToken } = await createMember('member_submit'); // submit call #1

    const first = await submitClaim(accessToken, placeAId);
    expect(first.status).toBe(201);
    expect(first.body.data.status).toBe('pending');
    expect(first.body.data.place_id).toBe(placeAId);
    expect(first.body.data).not.toHaveProperty('evidence');

    const second = await submitClaim(accessToken, placeAId); // submit call #2
    expect(second.status).toBe(409);
    expect(second.body.error.code).toBe('CONFLICT');
  });

  it('moderator GET queue -> 200 (mặc định pending); member (không Business.Verify) -> 403; detail CÓ evidence cho moderator, 403 cho member', async () => {
    const { accessToken: reqToken } = await createMember('queue_detail_req');
    const submitRes = await submitClaim(reqToken, placeAId); // submit call #3
    expect(submitRes.status).toBe(201);
    const claimId = submitRes.body.data.id;

    const { accessToken: modToken } = await createModerator('queue_detail_mod');
    const queue = await request(app.getHttpServer()).get('/api/business-claims').set('Authorization', `Bearer ${modToken}`);
    expect(queue.status).toBe(200);
    expect(queue.body.success).toBe(true);
    expect(queue.body.data.every((c: { status: string }) => c.status === 'pending')).toBe(true);

    const { accessToken: memberToken } = await createMember('queue_detail_denied');
    const queueDenied = await request(app.getHttpServer())
      .get('/api/business-claims')
      .set('Authorization', `Bearer ${memberToken}`);
    expect(queueDenied.status).toBe(403);

    const detail = await request(app.getHttpServer())
      .get(`/api/business-claims/${claimId}`)
      .set('Authorization', `Bearer ${modToken}`);
    expect(detail.status).toBe(200);
    expect(detail.body.data.evidence).toEqual(evidence);

    const detailDenied = await request(app.getHttpServer())
      .get(`/api/business-claims/${claimId}`)
      .set('Authorization', `Bearer ${reqToken}`);
    expect(detailDenied.status).toBe(403);

    const notFound = await request(app.getHttpServer())
      .get('/api/business-claims/00000000-0000-4000-8000-000000000000')
      .set('Authorization', `Bearer ${modToken}`);
    expect(notFound.status).toBe(404);
  });

  it('requester tự xác minh claim của chính mình -> 403 (không đổi status)', async () => {
    const { accessToken, userId } = await createUser('self_verify');
    await assignRole(userId, 'member', 'global', null);
    await assignRole(userId, 'moderator', 'global', null); // cùng người: vừa requester vừa Business.Verify
    const submitRes = await submitClaim(accessToken, placeAId); // submit call #4
    expect(submitRes.status).toBe(201);

    const res = await request(app.getHttpServer())
      .post(`/api/business-claims/${submitRes.body.data.id}/decide`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ decision: 'approve' });
    expect(res.status).toBe(403);

    const [claim] = await ds.query(`SELECT status FROM business_claims WHERE id = $1`, [submitRes.body.data.id]);
    expect(claim.status).toBe('pending');
  });

  it('reject KHÔNG kèm reason_code -> 422 (claim vẫn pending); reject KÈM reason_code -> 200 rejected + audit', async () => {
    const { accessToken: reqToken } = await createMember('reject_req');
    const submitRes = await submitClaim(reqToken, placeAId); // submit call #5
    expect(submitRes.status).toBe(201);
    const claimId = submitRes.body.data.id;

    const { accessToken: modToken } = await createModerator('reject_mod');
    const noReason = await request(app.getHttpServer())
      .post(`/api/business-claims/${claimId}/decide`)
      .set('Authorization', `Bearer ${modToken}`)
      .send({ decision: 'reject' });
    expect(noReason.status).toBe(422);
    const [stillPending] = await ds.query(`SELECT status FROM business_claims WHERE id = $1`, [claimId]);
    expect(stillPending.status).toBe('pending');

    const rejected = await request(app.getHttpServer())
      .post(`/api/business-claims/${claimId}/decide`)
      .set('Authorization', `Bearer ${modToken}`)
      .send({ decision: 'reject', reason_code: 'insufficient_evidence' });
    expect(rejected.status).toBe(200);
    expect(rejected.body.data.status).toBe('rejected');
    expect(rejected.body.data.reason_code).toBe('insufficient_evidence');

    const auditRows = await ds.query(
      `SELECT event FROM audit_logs WHERE entity_type = 'business_claim' AND entity_id = $1 ORDER BY created_at`,
      [claimId],
    );
    expect(auditRows.map((r: { event: string }) => r.event)).toContain('business.claim_rejected');
  });

  it('requester rút claim pending -> 200 withdrawn; approve sau đó -> 422; người lạ rút claim đã withdrawn -> 403 (kiểm actor TRƯỚC FSM)', async () => {
    const { accessToken: reqToken } = await createMember('withdraw_req');
    const submitRes = await submitClaim(reqToken, placeAId); // submit call #6
    expect(submitRes.status).toBe(201);
    const claimId = submitRes.body.data.id;

    const withdrawn = await request(app.getHttpServer())
      .post(`/api/business-claims/${claimId}/withdraw`)
      .set('Authorization', `Bearer ${reqToken}`);
    expect(withdrawn.status).toBe(200);
    expect(withdrawn.body.data.status).toBe('withdrawn');

    const { accessToken: modToken } = await createModerator('withdraw_mod');
    const approveAfterWithdraw = await request(app.getHttpServer())
      .post(`/api/business-claims/${claimId}/decide`)
      .set('Authorization', `Bearer ${modToken}`)
      .send({ decision: 'approve' });
    expect(approveAfterWithdraw.status).toBe(422);

    const { accessToken: strangerToken } = await createMember('withdraw_stranger');
    const strangerWithdraw = await request(app.getHttpServer())
      .post(`/api/business-claims/${claimId}/withdraw`)
      .set('Authorization', `Bearer ${strangerToken}`);
    expect(strangerWithdraw.status).toBe(403);
  });

  it('approve -> business_members(owner) + user_roles(business_owner, managed, business_id) + places.verification cache; PHASE 9: owner PATCH place A 200 / place B 403', async () => {
    const { accessToken: ownerToken, userId: ownerId } = await createMember('owner_approve');
    const submitRes = await submitClaim(ownerToken, placeAId); // submit call #7
    expect(submitRes.status).toBe(201);
    const claimId = submitRes.body.data.id;

    const { accessToken: modToken, userId: modId } = await createModerator('owner_approve_mod');
    const decideRes = await request(app.getHttpServer())
      .post(`/api/business-claims/${claimId}/decide`)
      .set('Authorization', `Bearer ${modToken}`)
      .send({ decision: 'approve', decision_note: 'evidence hợp lệ' });
    expect(decideRes.status).toBe(200);
    expect(decideRes.body.data.status).toBe('approved');

    const members = await ds.query(
      `SELECT role, revoked_at, claim_id, granted_by FROM business_members WHERE place_id = $1 AND user_id = $2`,
      [placeAId, ownerId],
    );
    expect(members).toHaveLength(1);
    expect(members[0].role).toBe('owner');
    expect(members[0].revoked_at).toBeNull();
    expect(members[0].claim_id).toBe(claimId);
    expect(members[0].granted_by).toBe(modId);

    const grants = await ds.query(
      `SELECT ur.scope_type, ur.business_id, r.code AS role_code
         FROM user_roles ur JOIN roles r ON r.id = ur.role_id
        WHERE ur.user_id = $1 AND ur.revoked_at IS NULL`,
      [ownerId],
    );
    const ownerGrant = grants.find((g: { role_code: string }) => g.role_code === 'business_owner');
    expect(ownerGrant).toBeDefined();
    expect(ownerGrant.scope_type).toBe('managed');
    expect(ownerGrant.business_id).toBe(placeAId);

    const [place] = await ds.query(`SELECT verification_status, verified_at FROM places WHERE id = $1`, [placeAId]);
    expect(place.verification_status).toBe('official');
    expect(place.verified_at).not.toBeNull();

    const auditRows = await ds.query(
      `SELECT event, context FROM audit_logs WHERE entity_type = 'business_claim' AND entity_id = $1`,
      [claimId],
    );
    expect(auditRows.map((r: { event: string }) => r.event)).toContain('business.claim_approved');

    // CLAIM -> SOURCE -> VERIFICATION INTEGRATION (2026-08-06) — nguồn sự thật của cache
    // `places.verification_status`/`verifiedAt` ở trên PHẢI đi qua ĐÚNG một `sources` +
    // `verifications` + `verification_events`, KHÔNG còn là ghi cache trực tiếp.
    const [source] = await ds.query(
      `SELECT id, type, kind, author_user_id, metadata FROM sources WHERE metadata->>'business_claim_id' = $1`,
      [claimId],
    );
    expect(source).toBeDefined();
    sourceIds.push(source.id);
    expect(source.type).toBe('business_owner');
    expect(source.kind).toBe('platform_user');
    expect(source.author_user_id).toBe(ownerId);

    // PRIVACY (Owner Decision 1, CLAIM -> SOURCE -> VERIFICATION CORRECTION): `metadata` CHỈ chứa
    // `business_claim_id` — KHÔNG sao chép `evidence`. Khẳng định TOÀN BỘ object trong DB (toEqual,
    // không toMatchObject) để một `evidence` sót lại là FAIL, không phải lọt.
    expect(source.metadata).toEqual({ business_claim_id: claimId });
    expect(source.metadata).not.toHaveProperty('evidence');

    // Và chứng minh HẬU QUẢ thật của quyết định đó trên kênh CÔNG KHAI: `GET /sources/:id` là
    // @Public() (không Authorization header) và trả nguyên entity — evidence của claim KHÔNG được
    // xuất hiện ở đâu trong payload đó, dưới bất kỳ hình thức nào.
    const publicSource = await request(app.getHttpServer()).get(`/api/sources/${source.id}`);
    expect(publicSource.status).toBe(200);
    expect(publicSource.body.data.metadata).toEqual({ business_claim_id: claimId });
    expect(JSON.stringify(publicSource.body)).not.toContain('media-e2e-1'); // evidence[0].reference
    expect(JSON.stringify(publicSource.body)).not.toContain('business_license'); // evidence[0].type

    const [verification] = await ds.query(
      `SELECT id, status, method, source_id, expires_at FROM verifications WHERE place_id = $1`,
      [placeAId],
    );
    expect(verification).toBeDefined();
    expect(verification.status).toBe('official');
    expect(verification.method).toBe('owner_claim');
    expect(verification.source_id).toBe(source.id);
    // Owner Decision 3 (CORRECTION): claim-driven official KHÔNG có hạn — chưa có luồng gia hạn nào
    // cho chủ cơ sở, nên hạn 12 tháng mặc định của `official()` qua HTTP KHÔNG áp ở đây.
    expect(verification.expires_at).toBeNull();

    const events = await ds.query(
      `SELECT from_status, to_status, method FROM verification_events WHERE verification_id = $1 ORDER BY created_at ASC`,
      [verification.id],
    );
    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({ from_status: null, to_status: 'pending', method: 'owner_claim' });
    expect(events[1]).toMatchObject({ from_status: 'pending', to_status: 'official', method: 'owner_claim' });

    const approvedAudit = auditRows.find((r: { event: string }) => r.event === 'business.claim_approved');
    expect(approvedAudit.context.verification).toMatchObject({
      sourceId: source.id,
      sourceCreated: true,
      verificationId: verification.id,
      verificationStatus: 'official',
    });

    // PHASE 9 — bằng chứng tích hợp ADR-019: owner MỚI đi qua ĐÚNG cơ chế Managed đã triển khai từ
    // M0.2 (PATCH /places/:id, IDENTITY_PLACE_RESOLVER) — không có code phân quyền mới ở đây.
    const ownPlace = await request(app.getHttpServer())
      .patch(`/api/places/${placeAId}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: 'Place A — updated by newly-approved owner' });
    expect(ownPlace.status).toBe(200);

    const otherPlace = await request(app.getHttpServer())
      .patch(`/api/places/${placeBId}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: 'SHOULD NOT APPLY' });
    expect(otherPlace.status).toBe(403);
  });

  it('claim thứ hai cho place ĐÃ có owner hiệu lực -> approve tự động redirect disputed (KHÔNG owner/role thứ hai); phân xử tranh chấp -> reject', async () => {
    const { accessToken: firstToken } = await createMember('conflict_first');
    const firstSubmit = await submitClaim(firstToken, placeBId); // submit call #8
    expect(firstSubmit.status).toBe(201);

    const { accessToken: modToken } = await createModerator('conflict_mod');
    const firstDecide = await request(app.getHttpServer())
      .post(`/api/business-claims/${firstSubmit.body.data.id}/decide`)
      .set('Authorization', `Bearer ${modToken}`)
      .send({ decision: 'approve' });
    expect(firstDecide.body.data.status).toBe('approved');

    // X1 (ADR-008 CORRECTION) — LEAK ĐÃ SỬA (CLAIM -> SOURCE -> VERIFICATION CORRECTION): approve
    // THÀNH CÔNG ở trên cũng tạo một `sources` (qua ensureOfficialFromClaim), y như test approve
    // chính. Trước đây nó KHÔNG được track nên mỗi lần chạy file này rò rỉ đúng một dòng `sources`
    // vĩnh viễn (đã xác nhận trên Postgres thật: 8 -> 9 sau một lần chạy). Track theo id THẬT.
    const [firstApproveSource] = await ds.query(
      `SELECT id FROM sources WHERE metadata->>'business_claim_id' = $1`,
      [firstSubmit.body.data.id],
    );
    expect(firstApproveSource).toBeDefined();
    sourceIds.push(firstApproveSource.id);

    const { accessToken: secondToken, userId: secondOwnerId } = await createMember('conflict_second');
    const secondSubmit = await submitClaim(secondToken, placeBId); // submit call #9
    expect(secondSubmit.status).toBe(201);

    const secondDecide = await request(app.getHttpServer())
      .post(`/api/business-claims/${secondSubmit.body.data.id}/decide`)
      .set('Authorization', `Bearer ${modToken}`)
      .send({ decision: 'approve' });
    expect(secondDecide.status).toBe(200);
    expect(secondDecide.body.data.status).toBe('disputed');

    // secondOwnerId VẪN có dòng user_roles cho 'member' (gán bởi createMember() fixture) — chỉ
    // 'business_owner' mới là thứ KHÔNG được cấp khi claim bị redirect sang disputed.
    const secondOwnerGrants = await ds.query(
      `SELECT 1 FROM user_roles ur JOIN roles r ON r.id = ur.role_id
        WHERE ur.user_id = $1 AND r.code = 'business_owner' AND ur.revoked_at IS NULL`,
      [secondOwnerId],
    );
    expect(secondOwnerGrants).toHaveLength(0);
    const secondOwnerMembers = await ds.query(`SELECT 1 FROM business_members WHERE user_id = $1`, [secondOwnerId]);
    expect(secondOwnerMembers).toHaveLength(0);

    // Phân xử tranh chấp: moderator quyết định lại claim đang disputed (reject ở đây).
    const resolveDispute = await request(app.getHttpServer())
      .post(`/api/business-claims/${secondSubmit.body.data.id}/decide`)
      .set('Authorization', `Bearer ${modToken}`)
      .send({ decision: 'reject', reason_code: 'duplicate' });
    expect(resolveDispute.status).toBe(200);
    expect(resolveDispute.body.data.status).toBe('rejected');
  });

  // "place không tồn tại/chưa published -> 404" đã có unit test đầy đủ
  // (business-claims.service.spec.ts describe('submit')) — không lặp lại ở e2e để giữ tổng số
  // request submit trong file này ĐÚNG 9, dưới giới hạn `@Throttle 10/60s` thật (còn dư cho
  // request preflight/retry ngẫu nhiên của test runner).
});
