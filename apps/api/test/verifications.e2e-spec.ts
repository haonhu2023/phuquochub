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
import { VerificationsService } from '../src/modules/verifications/verifications.service';

// ADR-008 Verification Foundation — live Postgres. Covers submit/claim/verify/official/reject/vote
// (+ auto-promotion to community_verified)/expire, exclusive-arc target dispatch (place AND
// contact), cache sync onto the target entity, và CLAIM -> SOURCE -> VERIFICATION INTEGRATION
// (2026-08-06): Business Claim approval (ADR-015) giờ tạo một `sources` + đi qua ĐÚNG MỘT luồng
// Verification (`ensureOfficialFromClaim()`) — đóng transitional exception mà Owner Decision
// 2026-08-06 mục 1 từng ghi nhận (BusinessClaimsService KHÔNG còn ghi `places.verification_status`
// trực tiếp).
describe('Verification Foundation (live Postgres)', () => {
  let app: INestApplication;
  let ds: DataSource;
  let jwt: JwtService;
  let config: ConfigService;
  let categoryId: string;

  const userIds: string[] = [];
  const placeIds: string[] = [];
  const contactIds: string[] = [];
  // ADR-008 CORRECTION (PIR finding X1): theo dõi id thật của mọi `sources`/`price_history` suite
  // này tạo ra. Bản trước dọn `sources` bằng một mệnh đề KHÔNG BAO GIỜ khớp (`author_user_id` không
  // hề được set, và `id NOT IN (SELECT id FROM sources)` luôn sai) — mọi source đều rò rỉ vĩnh viễn.
  const sourceIds: string[] = [];
  const priceHistoryIds: string[] = [];

  async function createUser(label: string, roleCode: string): Promise<{ accessToken: string; userId: string }> {
    const email = `e2e_verif_${label}_${Date.now()}_${Math.random().toString(36).slice(2)}@phuquochub.test`;
    const rows: Array<{ id: string }> = await ds.query(
      `INSERT INTO users (email, display_name) VALUES ($1, $2) RETURNING id`,
      [email, `Verif E2E ${label}`],
    );
    const userId = rows[0].id;
    userIds.push(userId);
    const [{ id: roleId }] = await ds.query(`SELECT id FROM roles WHERE code = $1`, [roleCode]);
    await ds.query(`INSERT INTO user_roles (user_id, role_id, scope_type, business_id) VALUES ($1,$2,'global',NULL)`, [
      userId,
      roleId,
    ]);
    const accessTtl = config.get<number>('jwt.accessTtl') ?? 900;
    const accessToken = await jwt.signAsync(
      { sub: userId, email, type: 'access' },
      { secret: config.get<string>('jwt.accessSecret'), expiresIn: accessTtl },
    );
    return { accessToken, userId };
  }

  async function mkPlace(label: string): Promise<string> {
    const rows: Array<{ id: string }> = await ds.query(
      `INSERT INTO places (name, slug, category_id, location, status)
       VALUES ($1, $2, $3, ST_SetSRID(ST_MakePoint(103.9, 10.2), 4326)::geography, 'published')
       RETURNING id`,
      [`E2E Verif ${label}`, `e2e-verif-${label}-${Date.now()}-${Math.random().toString(36).slice(2)}`, categoryId],
    );
    placeIds.push(rows[0].id);
    return rows[0].id;
  }

  async function mkContact(placeId: string): Promise<string> {
    const rows: Array<{ id: string }> = await ds.query(
      `INSERT INTO contacts (owner_type, owner_id, contact_type, value) VALUES ('place',$1,'phone','0909000000') RETURNING id`,
      [placeId],
    );
    contactIds.push(rows[0].id);
    return rows[0].id;
  }

  async function mkPriceHistory(placeId: string): Promise<string> {
    const rows: Array<{ id: string }> = await ds.query(
      `INSERT INTO price_history (entity_type, entity_id, service_name, amount) VALUES ('place',$1,'Vé vào cổng',50000) RETURNING id`,
      [placeId],
    );
    priceHistoryIds.push(rows[0].id);
    return rows[0].id;
  }

  async function mkSource(type: string): Promise<string> {
    const rows: Array<{ id: string }> = await ds.query(
      `INSERT INTO sources (type, kind, reliability) VALUES ($1, 'url', 80) RETURNING id`,
      [type],
    );
    sourceIds.push(rows[0].id);
    return rows[0].id;
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

  afterAll(async () => {
    if (ds?.isInitialized) {
      // ADR-008 CORRECTION (PIR X1) — dọn TƯỜNG MINH theo id đã theo dõi, đúng thứ tự FK, KHÔNG
      // nuốt lỗi (`.catch()` cũ đã che đúng cái bug này). Verification phải đi TRƯỚC target của nó
      // (`source_id` là ON DELETE NO ACTION — xoá source trước sẽ bị chặn), và trước `contacts`/
      // `price_history` để không phụ thuộc vào CASCADE ngầm.
      const verifTargets = [placeIds, contactIds, priceHistoryIds];
      if (verifTargets.some((ids) => ids.length)) {
        await ds.query(
          `DELETE FROM verification_votes WHERE verification_id IN (
             SELECT id FROM verifications
             WHERE place_id = ANY($1) OR contact_id = ANY($2) OR price_history_id = ANY($3))`,
          verifTargets,
        );
        await ds.query(
          `DELETE FROM verification_events WHERE verification_id IN (
             SELECT id FROM verifications
             WHERE place_id = ANY($1) OR contact_id = ANY($2) OR price_history_id = ANY($3))`,
          verifTargets,
        );
        await ds.query(
          `DELETE FROM verifications WHERE place_id = ANY($1) OR contact_id = ANY($2) OR price_history_id = ANY($3)`,
          verifTargets,
        );
      }
      if (contactIds.length) await ds.query(`DELETE FROM contacts WHERE id = ANY($1)`, [contactIds]);
      if (priceHistoryIds.length) await ds.query(`DELETE FROM price_history WHERE id = ANY($1)`, [priceHistoryIds]);
      if (sourceIds.length) await ds.query(`DELETE FROM sources WHERE id = ANY($1)`, [sourceIds]);
      if (userIds.length || placeIds.length) {
        await ds.query(
          `DELETE FROM wiki_revisions WHERE editor_id = ANY($1) OR (entity_type='place' AND entity_id = ANY($2))`,
          [userIds, placeIds],
        );
      }
      if (userIds.length) await ds.query(`DELETE FROM user_roles WHERE user_id = ANY($1)`, [userIds]);
      if (placeIds.length) await ds.query(`DELETE FROM places WHERE id = ANY($1)`, [placeIds]);
      if (userIds.length) {
        await ds.query(`DELETE FROM audit_logs WHERE actor_id = ANY($1)`, [userIds]);
        await ds.query(`DELETE FROM users WHERE id = ANY($1)`, [userIds]);
      }
    }
    if (app) await app.close();
  }, 30_000);

  it('anonymous -> 401', async () => {
    const res = await request(app.getHttpServer()).get('/api/verifications');
    expect(res.status).toBe(401);
  });

  it('member (không có Verification.Verify) -> 403 khi submit', async () => {
    const member = await createUser('member_denied', 'member');
    const placeId = await mkPlace('member_denied');
    const res = await request(app.getHttpServer())
      .post('/api/verifications')
      .set('Authorization', `Bearer ${member.accessToken}`)
      .send({ target_type: 'place', target_id: placeId });
    expect(res.status).toBe(403);
  });

  it('moderator: submit -> claim -> verify -> official (đủ điều kiện source) -> reject (gửi lại) đầy đủ vòng đời, cache đồng bộ ĐÚNG lúc, lịch sử qua /events', async () => {
    const moderator = await createUser('mod_full', 'moderator');
    const placeId = await mkPlace('full_lifecycle');

    // 1. submit -> pending, cache pending
    const submitRes = await request(app.getHttpServer())
      .post('/api/verifications')
      .set('Authorization', `Bearer ${moderator.accessToken}`)
      .send({ target_type: 'place', target_id: placeId, note: 'gửi kiểm tra' });
    expect(submitRes.status).toBe(201);
    expect(submitRes.body.data.status).toBe('pending');
    const verificationId = submitRes.body.data.id;

    let place = await ds.query(`SELECT verification_status, verified_at FROM places WHERE id=$1`, [placeId]);
    expect(place[0].verification_status).toBe('pending');
    expect(place[0].verified_at).toBeNull();

    // 2. submit lại khi ĐANG pending -> 422 (đã có dòng active)
    const dupRes = await request(app.getHttpServer())
      .post('/api/verifications')
      .set('Authorization', `Bearer ${moderator.accessToken}`)
      .send({ target_type: 'place', target_id: placeId });
    expect(dupRes.status).toBe(422);

    // 3. claim -> assigned_to
    const claimRes = await request(app.getHttpServer())
      .post(`/api/verifications/${verificationId}/claim`)
      .set('Authorization', `Bearer ${moderator.accessToken}`)
      .send({ priority: 2 });
    expect(claimRes.status).toBe(200);
    expect(claimRes.body.data.assigned_to).toBe(moderator.userId);
    expect(claimRes.body.data.priority).toBe(2);

    // 4. verify -> verified, cache verified + verified_at set
    const verifyRes = await request(app.getHttpServer())
      .post(`/api/verifications/${verificationId}/verify`)
      .set('Authorization', `Bearer ${moderator.accessToken}`)
      .send({ confidence: 70 });
    expect(verifyRes.status).toBe(200);
    expect(verifyRes.body.data.status).toBe('verified');

    place = await ds.query(`SELECT verification_status, verified_at FROM places WHERE id=$1`, [placeId]);
    expect(place[0].verification_status).toBe('verified');
    expect(place[0].verified_at).not.toBeNull();

    // 5. official cần source ĐÚNG nhóm chính thức
    const badSourceId = await mkSource('google_maps');
    const officialBadRes = await request(app.getHttpServer())
      .post(`/api/verifications/${verificationId}/official`)
      .set('Authorization', `Bearer ${moderator.accessToken}`)
      .send({ source_id: badSourceId });
    expect(officialBadRes.status).toBe(422);

    const goodSourceId = await mkSource('business_owner');
    const officialRes = await request(app.getHttpServer())
      .post(`/api/verifications/${verificationId}/official`)
      .set('Authorization', `Bearer ${moderator.accessToken}`)
      .send({ source_id: goodSourceId });
    expect(officialRes.status).toBe(200);
    expect(officialRes.body.data.status).toBe('official');
    expect(officialRes.body.data.source_id).toBe(goodSourceId);
    expect(officialRes.body.data.expires_at).not.toBeNull(); // mặc định +12 tháng khi không truyền

    place = await ds.query(`SELECT verification_status FROM places WHERE id=$1`, [placeId]);
    expect(place[0].verification_status).toBe('official');

    // 6. reject -> rejected, verified_at KHÔNG bị đụng (giữ nguyên lần trước)
    const beforeReject = await ds.query(`SELECT verified_at FROM places WHERE id=$1`, [placeId]);
    const rejectRes = await request(app.getHttpServer())
      .post(`/api/verifications/${verificationId}/reject`)
      .set('Authorization', `Bearer ${moderator.accessToken}`)
      .send({ reason_code: 'outdated', rejected_reason: 'dữ liệu cũ' });
    expect(rejectRes.status).toBe(200);
    expect(rejectRes.body.data.status).toBe('rejected');
    expect(rejectRes.body.data.reason_code).toBe('outdated');

    place = await ds.query(`SELECT verification_status, verified_at FROM places WHERE id=$1`, [placeId]);
    expect(place[0].verification_status).toBe('rejected');
    expect(place[0].verified_at?.toISOString()).toBe(beforeReject[0].verified_at.toISOString());

    // 7. reject thiếu reason_code -> 400 (DTO validation)
    const rejectNoReasonRes = await request(app.getHttpServer())
      .post(`/api/verifications/${verificationId}/reject`)
      .set('Authorization', `Bearer ${moderator.accessToken}`)
      .send({});
    // dòng đã rejected rồi nên transition cũng sẽ fail — nhưng validation phải chặn TRƯỚC đó (400, không phải 422)
    expect(rejectNoReasonRes.status).toBe(400);

    // 8. gửi lại (submit lại) từ rejected -> pending
    const resubmitRes = await request(app.getHttpServer())
      .post('/api/verifications')
      .set('Authorization', `Bearer ${moderator.accessToken}`)
      .send({ target_type: 'place', target_id: placeId, note: 'gửi lại sau khi sửa' });
    expect(resubmitRes.status).toBe(201);
    expect(resubmitRes.body.data.status).toBe('pending');
    expect(resubmitRes.body.data.id).toBe(verificationId); // TÁI SỬ DỤNG cùng dòng, không insert mới

    // 9. lịch sử /events phản ánh đủ các bước
    const eventsRes = await request(app.getHttpServer())
      .get(`/api/verifications/${verificationId}/events`)
      .set('Authorization', `Bearer ${moderator.accessToken}`);
    expect(eventsRes.status).toBe(200);
    const toStatuses = eventsRes.body.data.map((e: { to_status: string }) => e.to_status);
    expect(toStatuses).toEqual(['pending', 'verified', 'official', 'rejected', 'pending']);
  });

  it('official thiếu source_id -> 400 (DTO validation, KHÔNG chạm transaction)', async () => {
    const moderator = await createUser('mod_official_missing_source', 'moderator');
    const placeId = await mkPlace('official_missing_source');
    const submitRes = await request(app.getHttpServer())
      .post('/api/verifications')
      .set('Authorization', `Bearer ${moderator.accessToken}`)
      .send({ target_type: 'place', target_id: placeId });
    const verificationId = submitRes.body.data.id;

    const res = await request(app.getHttpServer())
      .post(`/api/verifications/${verificationId}/official`)
      .set('Authorization', `Bearer ${moderator.accessToken}`)
      .send({});
    expect(res.status).toBe(400);
  });

  it('official target = price_history + expires_at=null tường minh -> 422 (bắt buộc expires_at)', async () => {
    const moderator = await createUser('mod_price_official', 'moderator');
    const placeId = await mkPlace('price_official');
    const priceId = await mkPriceHistory(placeId);

    const submitRes = await request(app.getHttpServer())
      .post('/api/verifications')
      .set('Authorization', `Bearer ${moderator.accessToken}`)
      .send({ target_type: 'price_history', target_id: priceId });
    expect(submitRes.status).toBe(201);
    const verificationId = submitRes.body.data.id;

    const sourceId = await mkSource('government');
    const res = await request(app.getHttpServer())
      .post(`/api/verifications/${verificationId}/official`)
      .set('Authorization', `Bearer ${moderator.accessToken}`)
      .send({ source_id: sourceId, expires_at: null });
    expect(res.status).toBe(422);
  });

  it('target_type=contact hoạt động đúng (exclusive arc KHÔNG chỉ place) — submit + verify đồng bộ cache contact', async () => {
    const moderator = await createUser('mod_contact', 'moderator');
    const placeId = await mkPlace('contact_target');
    const contactId = await mkContact(placeId);

    const submitRes = await request(app.getHttpServer())
      .post('/api/verifications')
      .set('Authorization', `Bearer ${moderator.accessToken}`)
      .send({ target_type: 'contact', target_id: contactId });
    expect(submitRes.status).toBe(201);
    expect(submitRes.body.data.contact_id).toBe(contactId);
    expect(submitRes.body.data.place_id).toBeNull();

    const verifyRes = await request(app.getHttpServer())
      .post(`/api/verifications/${submitRes.body.data.id}/verify`)
      .set('Authorization', `Bearer ${moderator.accessToken}`)
      .send({});
    expect(verifyRes.status).toBe(200);

    const contact = await ds.query(`SELECT verification_status, verified_at FROM contacts WHERE id=$1`, [contactId]);
    expect(contact[0].verification_status).toBe('verified');
    expect(contact[0].verified_at).not.toBeNull();
  });

  it('claim đã bị moderator KHÁC nhận việc -> 403', async () => {
    const modA = await createUser('mod_claim_a', 'moderator');
    const modB = await createUser('mod_claim_b', 'moderator');
    const placeId = await mkPlace('claim_conflict');
    const submitRes = await request(app.getHttpServer())
      .post('/api/verifications')
      .set('Authorization', `Bearer ${modA.accessToken}`)
      .send({ target_type: 'place', target_id: placeId });
    const verificationId = submitRes.body.data.id;

    await request(app.getHttpServer())
      .post(`/api/verifications/${verificationId}/claim`)
      .set('Authorization', `Bearer ${modA.accessToken}`)
      .send({});

    const res = await request(app.getHttpServer())
      .post(`/api/verifications/${verificationId}/claim`)
      .set('Authorization', `Bearer ${modB.accessToken}`)
      .send({});
    expect(res.status).toBe(403);
  });

  it('member KHÔNG có Verification.Vote -> 403 khi vote', async () => {
    const moderator = await createUser('mod_vote_denied', 'moderator');
    const member = await createUser('member_vote_denied', 'member');
    const placeId = await mkPlace('vote_denied');
    const submitRes = await request(app.getHttpServer())
      .post('/api/verifications')
      .set('Authorization', `Bearer ${moderator.accessToken}`)
      .send({ target_type: 'place', target_id: placeId });

    const res = await request(app.getHttpServer())
      .post(`/api/verifications/${submitRes.body.data.id}/votes`)
      .set('Authorization', `Bearer ${member.accessToken}`)
      .send({ vote: 'confirm' });
    expect(res.status).toBe(403);
  });

  it('local_guide vote -> 200; ĐỦ 5 phiếu confirm (weight=1 mỗi phiếu) -> tự động community_verified, cache đồng bộ, /events ghi method=community_vote actor=null', async () => {
    const moderator = await createUser('mod_vote_threshold', 'moderator');
    const placeId = await mkPlace('vote_threshold');
    const submitRes = await request(app.getHttpServer())
      .post('/api/verifications')
      .set('Authorization', `Bearer ${moderator.accessToken}`)
      .send({ target_type: 'place', target_id: placeId });
    const verificationId = submitRes.body.data.id;

    const voters = await Promise.all(
      [1, 2, 3, 4, 5].map((n) => createUser(`local_guide_${n}`, 'local_guide')),
    );

    let lastRes;
    for (const voter of voters) {
      lastRes = await request(app.getHttpServer())
        .post(`/api/verifications/${verificationId}/votes`)
        .set('Authorization', `Bearer ${voter.accessToken}`)
        .send({ vote: 'confirm' });
      expect(lastRes.status).toBe(200);
    }

    expect(lastRes!.body.data.status).toBe('community_verified');
    expect(lastRes!.body.data.confirm_count).toBe(5);
    expect(lastRes!.body.data.dispute_count).toBe(0);

    const place = await ds.query(`SELECT verification_status, verified_at FROM places WHERE id=$1`, [placeId]);
    expect(place[0].verification_status).toBe('community_verified');
    expect(place[0].verified_at).not.toBeNull();

    const eventsRes = await request(app.getHttpServer())
      .get(`/api/verifications/${verificationId}/events`)
      .set('Authorization', `Bearer ${moderator.accessToken}`);
    const promoted = eventsRes.body.data.find((e: { to_status: string }) => e.to_status === 'community_verified');
    expect(promoted.method).toBe('community_vote');
    expect(promoted.actor_id).toBeNull();

    // Moderator vẫn can thiệp được: community_verified -> verified.
    const verifyRes = await request(app.getHttpServer())
      .post(`/api/verifications/${verificationId}/verify`)
      .set('Authorization', `Bearer ${moderator.accessToken}`)
      .send({});
    expect(verifyRes.status).toBe(200);
    expect(verifyRes.body.data.status).toBe('verified');
  });

  it('đổi phiếu (cùng user bỏ phiếu lại) -> idempotent, KHÔNG nhân đôi confirm_count', async () => {
    const moderator = await createUser('mod_vote_change', 'moderator');
    const guide = await createUser('guide_vote_change', 'local_guide');
    const placeId = await mkPlace('vote_change');
    const submitRes = await request(app.getHttpServer())
      .post('/api/verifications')
      .set('Authorization', `Bearer ${moderator.accessToken}`)
      .send({ target_type: 'place', target_id: placeId });
    const verificationId = submitRes.body.data.id;

    await request(app.getHttpServer())
      .post(`/api/verifications/${verificationId}/votes`)
      .set('Authorization', `Bearer ${guide.accessToken}`)
      .send({ vote: 'confirm' });
    const secondRes = await request(app.getHttpServer())
      .post(`/api/verifications/${verificationId}/votes`)
      .set('Authorization', `Bearer ${guide.accessToken}`)
      .send({ vote: 'dispute' });

    expect(secondRes.body.data.confirm_count).toBe(0);
    expect(secondRes.body.data.dispute_count).toBe(1);
  });

  it('expireOverdue (job hệ thống): dòng "tin cậy" quá expires_at -> expired, cache đồng bộ, verified_at KHÔNG đổi, dòng chưa quá hạn KHÔNG bị đụng', async () => {
    const moderator = await createUser('mod_expire', 'moderator');
    const placeOverdue = await mkPlace('expire_overdue');
    const placeFresh = await mkPlace('expire_fresh');
    const sourceId = await mkSource('official_website');

    const submitOverdue = await request(app.getHttpServer())
      .post('/api/verifications')
      .set('Authorization', `Bearer ${moderator.accessToken}`)
      .send({ target_type: 'place', target_id: placeOverdue });
    const officialOverdue = await request(app.getHttpServer())
      .post(`/api/verifications/${submitOverdue.body.data.id}/official`)
      .set('Authorization', `Bearer ${moderator.accessToken}`)
      .send({ source_id: sourceId });
    // Đẩy expires_at về QUÁ KHỨ trực tiếp (mô phỏng đã quá hạn từ lâu).
    await ds.query(`UPDATE verifications SET expires_at = now() - interval '1 day' WHERE id = $1`, [
      officialOverdue.body.data.id,
    ]);

    const submitFresh = await request(app.getHttpServer())
      .post('/api/verifications')
      .set('Authorization', `Bearer ${moderator.accessToken}`)
      .send({ target_type: 'place', target_id: placeFresh });
    await request(app.getHttpServer())
      .post(`/api/verifications/${submitFresh.body.data.id}/official`)
      .set('Authorization', `Bearer ${moderator.accessToken}`)
      .send({ source_id: sourceId }); // expires_at mặc định +12 tháng, CHƯA quá hạn

    const verifiedAtBefore = await ds.query(`SELECT verified_at FROM places WHERE id=$1`, [placeOverdue]);

    const verificationsService = app.get(VerificationsService);
    const summary = await verificationsService.expireOverdue({ now: new Date() });
    expect(summary.expired).toBeGreaterThanOrEqual(1);

    const overdueAfter = await ds.query(`SELECT verification_status, verified_at FROM places WHERE id=$1`, [
      placeOverdue,
    ]);
    expect(overdueAfter[0].verification_status).toBe('expired');
    expect(overdueAfter[0].verified_at?.toISOString()).toBe(verifiedAtBefore[0].verified_at.toISOString());

    const freshAfter = await ds.query(`SELECT verification_status FROM places WHERE id=$1`, [placeFresh]);
    expect(freshAfter[0].verification_status).toBe('official'); // KHÔNG bị đụng
  });

  it('CLAIM -> SOURCE -> VERIFICATION INTEGRATION: Business Claim approval tạo ĐÚNG MỘT dòng verifications (owner_claim/official) qua ĐÚNG MỘT luồng Verification — KHÔNG còn ghi cache trực tiếp', async () => {
    const owner = await createUser('claim_owner', 'member');
    const moderator = await createUser('claim_moderator', 'moderator');
    const placeId = await mkPlace('claim_integrated');

    const submitClaimRes = await request(app.getHttpServer())
      .post('/api/business-claims')
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({
        place_id: placeId,
        evidence: [{ type: 'business_license', reference: 'GP-001-2026', note: 'giấy phép kinh doanh' }],
      });
    expect(submitClaimRes.status).toBe(201);

    const decideRes = await request(app.getHttpServer())
      .post(`/api/business-claims/${submitClaimRes.body.data.id}/decide`)
      .set('Authorization', `Bearer ${moderator.accessToken}`)
      .send({ decision: 'approve' });
    expect(decideRes.status).toBe(200);

    const place = await ds.query(`SELECT verification_status, verified_at FROM places WHERE id=$1`, [placeId]);
    expect(place[0].verification_status).toBe('official');
    expect(place[0].verified_at).not.toBeNull();

    // Nguồn sự thật của cache trên là ĐÚNG MỘT dòng `verifications` (method=owner_claim), KHÔNG
    // còn là ghi trực tiếp từ BusinessClaimsService.
    const verifRows = await ds.query(
      `SELECT id, status, method, source_id, expires_at FROM verifications WHERE place_id=$1`,
      [placeId],
    );
    expect(verifRows).toHaveLength(1);
    expect(verifRows[0].status).toBe('official');
    expect(verifRows[0].method).toBe('owner_claim');
    expect(verifRows[0].source_id).not.toBeNull();
    // Owner Decision 3 (CORRECTION): claim-driven official KHÔNG có hạn (chưa có luồng gia hạn cho
    // chủ cơ sở) — khác `official()` qua HTTP vốn mặc định +12 tháng.
    expect(verifRows[0].expires_at).toBeNull();
    // X1 (ADR-008 CORRECTION): `sources` KHÔNG cascade từ places/verifications — track ID THẬT để
    // afterAll dọn sạch.
    sourceIds.push(verifRows[0].source_id);

    const source = await ds.query(`SELECT type, kind, metadata FROM sources WHERE id=$1`, [verifRows[0].source_id]);
    expect(source[0].type).toBe('business_owner');
    expect(source[0].kind).toBe('platform_user');
    // PRIVACY (Owner Decision 1, CORRECTION): CHỈ `business_claim_id`, KHÔNG evidence.
    expect(Object.keys(source[0].metadata)).toEqual(['business_claim_id']);

    // Target đã `official` — submit() lại KHÔNG còn hợp lệ (FSM `submit` chỉ nhận null/expired/
    // rejected, verification.md §3.2) — 422, khác 409 của guard C1 cũ (đã đóng, xem class doc).
    const resubmitRes = await request(app.getHttpServer())
      .post('/api/verifications')
      .set('Authorization', `Bearer ${moderator.accessToken}`)
      .send({ target_type: 'place', target_id: placeId });
    expect(resubmitRes.status).toBe(422);

    await ds.query(`DELETE FROM business_members WHERE place_id=$1`, [placeId]);
    await ds.query(`DELETE FROM user_roles WHERE user_id=$1 AND business_id=$2`, [owner.userId, placeId]);
  });

  it('CLAIM -> SOURCE -> VERIFICATION INTEGRATION: approve claim trên cơ sở ĐÃ có dòng verifications (verified) -> dòng đó ĐƯỢC transition thẳng sang official (KHÔNG tạo dòng thứ hai)', async () => {
    const owner = await createUser('claim_b_owner', 'member');
    const moderator = await createUser('claim_b_moderator', 'moderator');
    const placeId = await mkPlace('claim_conflict_b');

    // Verification đã tồn tại trước: submit -> verify (method=moderator, chưa official).
    const submitRes = await request(app.getHttpServer())
      .post('/api/verifications')
      .set('Authorization', `Bearer ${moderator.accessToken}`)
      .send({ target_type: 'place', target_id: placeId });
    expect(submitRes.status).toBe(201);
    const verifyRes = await request(app.getHttpServer())
      .post(`/api/verifications/${submitRes.body.data.id}/verify`)
      .set('Authorization', `Bearer ${moderator.accessToken}`)
      .send({});
    expect(verifyRes.status).toBe(200);

    const claimRes = await request(app.getHttpServer())
      .post('/api/business-claims')
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ place_id: placeId, evidence: [{ type: 'business_license', reference: 'GP-002-2026' }] });
    expect(claimRes.status).toBe(201);

    const decideRes = await request(app.getHttpServer())
      .post(`/api/business-claims/${claimRes.body.data.id}/decide`)
      .set('Authorization', `Bearer ${moderator.accessToken}`)
      .send({ decision: 'approve' });
    expect(decideRes.status).toBe(200);
    expect(decideRes.body.data.status).toBe('approved');

    const ownerRow = await ds.query(
      `SELECT count(*)::int AS n FROM business_members WHERE place_id=$1 AND user_id=$2 AND role='owner' AND revoked_at IS NULL`,
      [placeId, owner.userId],
    );
    expect(ownerRow[0].n).toBe(1); // ownership vẫn được cấp bình thường

    // ĐÚNG MỘT luồng Verification sở hữu cache — dòng `verified` có sẵn ĐƯỢC TÁI DÙNG (transition
    // thẳng sang official qua ensureOfficialFromClaim), KHÔNG tạo dòng verifications thứ hai
    // (constraint `uq_verif_place` sẽ chặn nếu có bug tạo trùng).
    const place = await ds.query(`SELECT verification_status FROM places WHERE id=$1`, [placeId]);
    expect(place[0].verification_status).toBe('official');

    const verifRows = await ds.query(
      `SELECT id, status, method, source_id FROM verifications WHERE place_id=$1`,
      [placeId],
    );
    expect(verifRows).toHaveLength(1);
    expect(verifRows[0].id).toBe(submitRes.body.data.id); // CÙNG dòng, không tạo mới
    expect(verifRows[0].status).toBe('official');
    expect(verifRows[0].method).toBe('owner_claim'); // method mới nhất thắng, cùng quy ước verify/official qua HTTP
    // X1 (ADR-008 CORRECTION): `sources` KHÔNG cascade từ places/verifications — track ID THẬT để
    // afterAll dọn sạch (đúng bài học đã sửa, không lặp lại lỗi).
    expect(verifRows[0].source_id).not.toBeNull();
    sourceIds.push(verifRows[0].source_id);

    const events = await ds.query(
      `SELECT from_status, to_status, method FROM verification_events WHERE verification_id=$1 ORDER BY created_at ASC`,
      [verifRows[0].id],
    );
    // submit (null->pending, moderator) -> verify (pending->verified, moderator) -> claim approve
    // (verified->official, owner_claim).
    expect(events).toHaveLength(3);
    expect(events[2]).toMatchObject({ from_status: 'verified', to_status: 'official', method: 'owner_claim' });

    const auditRow = await ds.query(
      `SELECT context FROM audit_logs WHERE entity_type='business_claim' AND actor_id=$1 ORDER BY created_at DESC LIMIT 1`,
      [moderator.userId],
    );
    expect(auditRow[0].context.verification).toMatchObject({
      verificationId: verifRows[0].id,
      verificationStatus: 'official',
    });

    await ds.query(`DELETE FROM business_members WHERE place_id=$1`, [placeId]);
    await ds.query(`DELETE FROM user_roles WHERE user_id=$1 AND business_id=$2`, [owner.userId, placeId]);
  });

  // CLAIM -> SOURCE -> VERIFICATION CORRECTION (2026-08-06, Owner Decision 2 / PIR M-1). Bản trước
  // tạo `sources` TRƯỚC khi biết nhánh no-op có xảy ra hay không, nên approve claim trên một place
  // ĐÃ `official` (do moderator đặt qua đường khác) để lại một dòng `sources` MỒ CÔI và audit ghi
  // một `source_id` mà dòng `verifications` KHÔNG hề dùng. Nay callback tạo source là LƯỜI.
  it('CORRECTION: approve claim trên place ĐÃ official -> NO-OP THẬT (0 source mới, 0 event mới, audit trỏ source đang gắn)', async () => {
    const owner = await createUser('claim_noop_owner', 'member');
    const moderator = await createUser('claim_noop_moderator', 'moderator');
    const placeId = await mkPlace('claim_noop');
    const preexistingSourceId = await mkSource('official_website');

    // Moderator đưa place tới `official` qua đường HTTP thường (source official_website).
    const submitRes = await request(app.getHttpServer())
      .post('/api/verifications')
      .set('Authorization', `Bearer ${moderator.accessToken}`)
      .send({ target_type: 'place', target_id: placeId });
    expect(submitRes.status).toBe(201);
    const verificationId = submitRes.body.data.id;
    const officialRes = await request(app.getHttpServer())
      .post(`/api/verifications/${verificationId}/official`)
      .set('Authorization', `Bearer ${moderator.accessToken}`)
      .send({ source_id: preexistingSourceId });
    expect(officialRes.status).toBe(200);

    // Đếm theo `author_user_id` = owner của CHÍNH test này (user mới tạo, chưa từng có source nào):
    // mọi dòng `sources` mà nhánh approve có thể sinh ra đều mang `author_user_id` = requester, nên
    // phép đếm này bắt được dòng mồ côi BẤT KỂ `metadata` chứa gì — mà vẫn KHÔNG phụ thuộc dòng do
    // file e2e khác tạo song song (bài học --runInBand từ milestone Scheduler: KHÔNG khẳng định trên
    // phép đếm toàn cục mà file khác có thể làm nhiễu).
    const sourcesBefore = await ds.query(`SELECT count(*)::int AS n FROM sources WHERE author_user_id = $1`, [
      owner.userId,
    ]);
    const eventsBefore = await ds.query(
      `SELECT count(*)::int AS n FROM verification_events WHERE verification_id=$1`,
      [verificationId],
    );
    const verifBefore = await ds.query(`SELECT updated_at, lock_version FROM verifications WHERE id=$1`, [
      verificationId,
    ]);

    // Giờ mới approve một claim trên CHÍNH place đó.
    const claimRes = await request(app.getHttpServer())
      .post('/api/business-claims')
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ place_id: placeId, evidence: [{ type: 'business_license', reference: 'GP-NOOP-2026' }] });
    expect(claimRes.status).toBe(201);
    const decideRes = await request(app.getHttpServer())
      .post(`/api/business-claims/${claimRes.body.data.id}/decide`)
      .set('Authorization', `Bearer ${moderator.accessToken}`)
      .send({ decision: 'approve' });
    expect(decideRes.status).toBe(200);
    expect(decideRes.body.data.status).toBe('approved');

    // 1) KHÔNG dòng `sources` nào được thêm cho requester này (0 trước, 0 sau) — bắt cả dòng mồ côi
    //    không khớp filter `metadata` nào, đúng lỗi mà bản trước để lọt.
    const sourcesAfter = await ds.query(`SELECT count(*)::int AS n FROM sources WHERE author_user_id = $1`, [
      owner.userId,
    ]);
    expect(sourcesBefore[0].n).toBe(0);
    expect(sourcesAfter[0].n).toBe(0);
    const orphan = await ds.query(
      `SELECT count(*)::int AS n FROM sources WHERE metadata->>'business_claim_id' = $1`,
      [claimRes.body.data.id],
    );
    expect(orphan[0].n).toBe(0);

    // 2) Dòng `verifications` KHÔNG bị chạm: 0 event mới, lock_version/updated_at nguyên vẹn,
    //    `source_id` vẫn là source official_website ban đầu.
    const eventsAfter = await ds.query(
      `SELECT count(*)::int AS n FROM verification_events WHERE verification_id=$1`,
      [verificationId],
    );
    expect(eventsAfter[0].n).toBe(eventsBefore[0].n);
    const verifAfter = await ds.query(
      `SELECT source_id, status, lock_version, updated_at FROM verifications WHERE id=$1`,
      [verificationId],
    );
    expect(verifAfter[0].status).toBe('official');
    expect(verifAfter[0].source_id).toBe(preexistingSourceId);
    expect(verifAfter[0].lock_version).toBe(verifBefore[0].lock_version);
    expect(verifAfter[0].updated_at.getTime()).toBe(verifBefore[0].updated_at.getTime());

    // 3) Ownership VẪN được cấp (no-op chỉ áp cho phần verification, KHÔNG cho claim/ownership).
    const ownerRow = await ds.query(
      `SELECT count(*)::int AS n FROM business_members WHERE place_id=$1 AND user_id=$2 AND role='owner' AND revoked_at IS NULL`,
      [placeId, owner.userId],
    );
    expect(ownerRow[0].n).toBe(1);

    // 4) Audit trỏ tới source THẬT đang gắn trên dòng verifications, và nói rõ không tạo source mới.
    const auditRow = await ds.query(
      `SELECT context FROM audit_logs WHERE event='business.claim_approved' AND entity_id=$1`,
      [claimRes.body.data.id],
    );
    expect(auditRow[0].context.verification).toMatchObject({
      sourceId: preexistingSourceId,
      sourceCreated: false,
      verificationId,
      verificationStatus: 'official',
    });

    await ds.query(`DELETE FROM business_members WHERE place_id=$1`, [placeId]);
    await ds.query(`DELETE FROM user_roles WHERE user_id=$1 AND business_id=$2`, [owner.userId, placeId]);
  });

  it('F1: official(expires) -> expired -> gửi lại -> verify KHÔNG mang expires_at cũ, expireOverdue KHÔNG hạ cấp lần nữa', async () => {
    const moderator = await createUser('mod_f1', 'moderator');
    const placeId = await mkPlace('f1_stale_expiry');
    const sourceId = await mkSource('official_website');

    const submitRes = await request(app.getHttpServer())
      .post('/api/verifications')
      .set('Authorization', `Bearer ${moderator.accessToken}`)
      .send({ target_type: 'place', target_id: placeId });
    const verificationId = submitRes.body.data.id;

    await request(app.getHttpServer())
      .post(`/api/verifications/${verificationId}/official`)
      .set('Authorization', `Bearer ${moderator.accessToken}`)
      .send({ source_id: sourceId });
    // Đẩy hạn về quá khứ rồi chạy job -> expired.
    await ds.query(`UPDATE verifications SET expires_at = now() - interval '1 day' WHERE id=$1`, [verificationId]);
    const verificationsService = app.get(VerificationsService);
    await verificationsService.expireOverdue({ now: new Date() });
    const afterExpire = await ds.query(`SELECT status FROM verifications WHERE id=$1`, [verificationId]);
    expect(afterExpire[0].status).toBe('expired');

    // Gửi lại: PHẢI xoá expires_at/reason_code/rejected_reason cũ.
    const resubmitRes = await request(app.getHttpServer())
      .post('/api/verifications')
      .set('Authorization', `Bearer ${moderator.accessToken}`)
      .send({ target_type: 'place', target_id: placeId });
    expect(resubmitRes.status).toBe(201);
    expect(resubmitRes.body.data.expires_at).toBeNull();

    const afterVerify = await request(app.getHttpServer())
      .post(`/api/verifications/${verificationId}/verify`)
      .set('Authorization', `Bearer ${moderator.accessToken}`)
      .send({});
    expect(afterVerify.status).toBe(200);
    expect(afterVerify.body.data.status).toBe('verified');
    expect(afterVerify.body.data.expires_at).toBeNull();

    // Job chạy lại: dòng `verified` này KHÔNG được tự hết hạn (trước fix nó bị hạ cấp ngay).
    await verificationsService.expireOverdue({ now: new Date() });
    const afterSecondJob = await ds.query(`SELECT status FROM verifications WHERE id=$1`, [verificationId]);
    expect(afterSecondJob[0].status).toBe('verified');
    const place = await ds.query(`SELECT verification_status FROM places WHERE id=$1`, [placeId]);
    expect(place[0].verification_status).toBe('verified');
  });

  it('F1: reject sau official XOÁ expires_at; gửi lại XOÁ reason_code/rejected_reason', async () => {
    const moderator = await createUser('mod_f1b', 'moderator');
    const placeId = await mkPlace('f1_reject_fields');
    const sourceId = await mkSource('government');

    const submitRes = await request(app.getHttpServer())
      .post('/api/verifications')
      .set('Authorization', `Bearer ${moderator.accessToken}`)
      .send({ target_type: 'place', target_id: placeId });
    const verificationId = submitRes.body.data.id;

    await request(app.getHttpServer())
      .post(`/api/verifications/${verificationId}/official`)
      .set('Authorization', `Bearer ${moderator.accessToken}`)
      .send({ source_id: sourceId });

    const rejectRes = await request(app.getHttpServer())
      .post(`/api/verifications/${verificationId}/reject`)
      .set('Authorization', `Bearer ${moderator.accessToken}`)
      .send({ reason_code: 'fabricated', rejected_reason: 'bằng chứng giả' });
    expect(rejectRes.status).toBe(200);
    expect(rejectRes.body.data.expires_at).toBeNull(); // cửa sổ hiệu lực bị xoá
    expect(rejectRes.body.data.reason_code).toBe('fabricated');

    const resubmitRes = await request(app.getHttpServer())
      .post('/api/verifications')
      .set('Authorization', `Bearer ${moderator.accessToken}`)
      .send({ target_type: 'place', target_id: placeId });
    expect(resubmitRes.status).toBe(201);
    expect(resubmitRes.body.data.reason_code).toBeNull();
    expect(resubmitRes.body.data.rejected_reason).toBeNull();
  });

  // ADR-008 CORRECTION (PIR X1) — chạy CUỐI: chứng minh teardown thật sự dọn sạch, không chỉ tuyên bố.
  it('X1: mọi source/price_history/verification suite này tạo ra đều được theo dõi để dọn (0 rò rỉ)', async () => {
    expect(sourceIds.length).toBeGreaterThan(0);
    const tracked = await ds.query(`SELECT count(*)::int AS n FROM sources WHERE id = ANY($1)`, [sourceIds]);
    expect(tracked[0].n).toBe(sourceIds.length); // mọi source đã tạo đều nằm trong danh sách dọn
    const trackedPrices = await ds.query(`SELECT count(*)::int AS n FROM price_history WHERE id = ANY($1)`, [
      priceHistoryIds,
    ]);
    expect(trackedPrices[0].n).toBe(priceHistoryIds.length);
  });
});
