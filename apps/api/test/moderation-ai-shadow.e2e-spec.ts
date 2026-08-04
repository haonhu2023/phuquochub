import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { TransformInterceptor } from '../src/common/interceptors/transform.interceptor';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { AiRecommendationsRepository } from '../src/modules/moderation/repositories/ai-recommendations.repository';
import { AiRecommendationsService } from '../src/modules/moderation/ai-recommendations.service';

// Moderation M7 — AI Shadow Mode (e2e, real Postgres — needs InitModeration/SeedModerationPermissions
// + AddAiRecommendations migrations applied). Covers: recommendation creation (AI.ModerateMedia,
// reused — no new permission), moderator decision + agreement recording (evaluateModeratorDecision
// hook), statistics (delta-based, repository/service only — no HTTP endpoint per M7 spec), and a
// "rollback" probe showing the OPPOSITE failure mode of moderation-decide-rollback.e2e-spec.ts: an
// AI-evaluation write failure must NEVER roll back or fail the real moderation decision (they are
// fully decoupled — decide() stays 200, media/case still resolve, only the AI side effect is lost
// and logged).
describe('Moderation M7 — AI Shadow Mode (e2e)', () => {
  let app: INestApplication;
  let ds: DataSource;
  let aiAgentToken: string;
  let aiAgentUserId: string;
  let moderatorToken: string;
  let moderatorUserId: string;

  const mediaIds: string[] = [];
  const caseIds: string[] = [];
  const authorUserIds: string[] = [];
  const grantedUserRoleIds: string[] = [];

  let authorFixtureCounter = 0;

  const aiAgentEmail = `e2e_ai_shadow_agent_${Date.now()}@phuquochub.test`;
  const moderatorEmail = `e2e_ai_shadow_moderator_${Date.now()}@phuquochub.test`;
  const password = 'password123';

  async function createDisposableAuthor(): Promise<string> {
    authorFixtureCounter += 1;
    const rows: Array<{ id: string }> = await ds.query(
      `INSERT INTO users (email, display_name) VALUES ($1, 'E2E AI Shadow Author') RETURNING id`,
      [`e2e_ai_shadow_author_${Date.now()}_${authorFixtureCounter}@phuquochub.test`],
    );
    authorUserIds.push(rows[0].id);
    return rows[0].id;
  }

  async function insertPendingMediaCase(): Promise<{ mediaId: string; caseId: string }> {
    const authorId = await createDisposableAuthor();
    const mediaRows: Array<{ id: string }> = await ds.query(
      `INSERT INTO media (type, provider, status, uploaded_by, object_key, bucket, content_type, size_bytes, checksum_sha256)
       VALUES ('image', 'upload', 'pending', $1, $2, 'phuquochub-test', 'image/jpeg', 100, $3)
       RETURNING id`,
      [authorId, `media/e2e-ai-shadow-${Date.now()}-${Math.random()}.jpg`, Math.random().toString().padStart(64, '0').slice(0, 64)],
    );
    const mediaId = mediaRows[0].id;
    mediaIds.push(mediaId);

    const caseRows: Array<{ id: string }> = await ds.query(
      `INSERT INTO moderation_cases (target_type, target_id, status, source, severity, priority)
       VALUES ('media', $1, 'open', 'manual', 'normal', 5)
       RETURNING id`,
      [mediaId],
    );
    const caseId = caseRows[0].id;
    caseIds.push(caseId);

    return { mediaId, caseId };
  }

  function generateRecommendation(token: string, caseId: string) {
    return request(app.getHttpServer())
      .post(`/api/moderation/cases/${caseId}/ai-recommendation`)
      .set('Authorization', `Bearer ${token}`)
      .send();
  }

  function getRecommendation(token: string, caseId: string) {
    return request(app.getHttpServer())
      .get(`/api/moderation/cases/${caseId}/ai-recommendation`)
      .set('Authorization', `Bearer ${token}`);
  }

  function decide(token: string, caseId: string, body: Record<string, unknown>) {
    return request(app.getHttpServer())
      .post(`/api/moderation/cases/${caseId}/decide`)
      .set('Authorization', `Bearer ${token}`)
      .send(body);
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    app.useGlobalInterceptors(new TransformInterceptor());
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();

    ds = app.get<DataSource>(getDataSourceToken());

    const reg1 = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ email: aiAgentEmail, password, display_name: 'E2E AI Shadow Agent' });
    aiAgentToken = reg1.body.data.access_token;
    aiAgentUserId = reg1.body.data.user.id;

    const reg2 = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ email: moderatorEmail, password, display_name: 'E2E AI Shadow Moderator' });
    moderatorToken = reg2.body.data.access_token;
    moderatorUserId = reg2.body.data.user.id;

    const grant1: Array<{ id: string }> = await ds.query(
      `INSERT INTO user_roles (user_id, role_id) SELECT $1, r.id FROM roles r WHERE r.code = 'ai_agent' RETURNING id`,
      [aiAgentUserId],
    );
    if (grant1[0]) grantedUserRoleIds.push(grant1[0].id);

    const grant2: Array<{ id: string }> = await ds.query(
      `INSERT INTO user_roles (user_id, role_id) SELECT $1, r.id FROM roles r WHERE r.code = 'moderator' RETURNING id`,
      [moderatorUserId],
    );
    if (grant2[0]) grantedUserRoleIds.push(grant2[0].id);
  }, 30_000);

  afterAll(async () => {
    if (ds?.isInitialized) {
      // ai_recommendations cascade-deletes with moderation_cases (FK ON DELETE CASCADE) — no
      // separate cleanup needed for that table.
      if (caseIds.length) await ds.query(`DELETE FROM moderation_cases WHERE id = ANY($1)`, [caseIds]);
      if (mediaIds.length) await ds.query(`DELETE FROM media WHERE id = ANY($1)`, [mediaIds]);
      if (grantedUserRoleIds.length) await ds.query(`DELETE FROM user_roles WHERE id = ANY($1)`, [grantedUserRoleIds]);
      const allUserIds = [aiAgentUserId, moderatorUserId, ...authorUserIds].filter(Boolean);
      if (allUserIds.length) {
        await ds.query(`DELETE FROM audit_logs WHERE actor_id = ANY($1)`, [allUserIds]);
        await ds.query(`DELETE FROM users WHERE id = ANY($1)`, [allUserIds]);
      }
    }
    if (app) await app.close();
  });

  describe('Recommendation creation', () => {
    it('AI.ModerateMedia (ai_agent) -> 201, persist recommendation, KHÔNG đổi media.status/case.status', async () => {
      const { mediaId, caseId } = await insertPendingMediaCase();

      const res = await generateRecommendation(aiAgentToken, caseId);

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.case_id).toBe(caseId);
      expect(res.body.data.provider).toBe('logging');
      expect(['approve', 'reject', 'hide', 'restore', 'dismiss']).toContain(res.body.data.decision);
      expect(res.body.data.confidence).toBeGreaterThanOrEqual(0);
      expect(res.body.data.confidence).toBeLessThanOrEqual(1);
      expect(res.body.data.evaluated_at).toBeNull();
      expect(res.body.data.matched).toBeNull();

      const mediaRow = await ds.query(`SELECT status FROM media WHERE id = $1`, [mediaId]);
      expect(mediaRow[0].status).toBe('pending');
      const caseRow = await ds.query(`SELECT status, decision FROM moderation_cases WHERE id = $1`, [caseId]);
      expect(caseRow[0].status).toBe('open');
      expect(caseRow[0].decision).toBeNull();
    });

    it('moderator (KHÔNG có AI.ModerateMedia) -> 403', async () => {
      const { caseId } = await insertPendingMediaCase();
      const res = await generateRecommendation(moderatorToken, caseId);
      expect(res.status).toBe(403);
    });

    it('case không tồn tại -> 404', async () => {
      const res = await generateRecommendation(aiAgentToken, '00000000-0000-0000-0000-000000000000');
      expect(res.status).toBe(404);
    });

    it('GET trước khi generate -> 404 ("chưa có gợi ý AI nào")', async () => {
      const { caseId } = await insertPendingMediaCase();
      const res = await getRecommendation(moderatorToken, caseId);
      expect(res.status).toBe(404);
    });
  });

  describe('Moderator decision -> agreement recording', () => {
    it('AI decision === moderator decision -> matched=true, evaluated_at ghi nhận', async () => {
      const { caseId } = await insertPendingMediaCase();
      const genRes = await generateRecommendation(aiAgentToken, caseId);
      const aiDecision: string = genRes.body.data.decision;
      // "restore"/"dismiss" không hợp lệ ở pending — chỉ approve/reject là quyết định thật cho case
      // này; nếu AI đề nghị dismiss, decide bằng dismiss vẫn là một quyết định hợp lệ (case-level).
      const moderatorDecision =
        aiDecision === 'reject' ? 'reject' : aiDecision === 'dismiss' ? 'dismiss' : 'approve';
      const decideBody =
        moderatorDecision === 'reject' ? { decision: 'reject', reason: 'vi phạm chính sách' } : { decision: moderatorDecision };
      // Chỉ chạy so khớp nếu AI thực sự đề nghị approve/reject/dismiss (3/4 giá trị có thể) — nếu
      // AI đề nghị "hide" (không hợp lệ trên pending), bỏ qua nhánh matched=true cho case này và
      // decide bằng approve (sẽ tự nhiên matched=false, phủ nhánh còn lại).
      if (aiDecision === 'hide') {
        await decide(moderatorToken, caseId, { decision: 'approve' });
        const getRes = await getRecommendation(moderatorToken, caseId);
        expect(getRes.body.data.matched).toBe(false);
        expect(getRes.body.data.moderator_decision).toBe('approve');
        return;
      }

      await decide(moderatorToken, caseId, decideBody);

      const getRes = await getRecommendation(moderatorToken, caseId);
      expect(getRes.status).toBe(200);
      expect(getRes.body.data.matched).toBe(true);
      expect(getRes.body.data.moderator_decision).toBe(moderatorDecision);
      expect(getRes.body.data.evaluated_at).not.toBeNull();
    });

    it('AI decision !== moderator decision -> matched=false', async () => {
      const { caseId } = await insertPendingMediaCase();
      const genRes = await generateRecommendation(aiAgentToken, caseId);
      const aiDecision: string = genRes.body.data.decision;
      // Chọn quyết định thật CHẮC CHẮN khác aiDecision, luôn hợp lệ trên pending: approve nếu AI
      // không phải approve, ngược lại reject (kèm reason bắt buộc).
      const moderatorDecision = aiDecision === 'approve' ? 'reject' : 'approve';
      const decideBody =
        moderatorDecision === 'reject' ? { decision: 'reject', reason: 'vi phạm chính sách' } : { decision: 'approve' };

      await decide(moderatorToken, caseId, decideBody);

      const getRes = await getRecommendation(moderatorToken, caseId);
      expect(getRes.body.data.matched).toBe(false);
      expect(getRes.body.data.moderator_decision).toBe(moderatorDecision);
    });

    it('case chưa có recommendation nào -> decide() vẫn thành công bình thường (no-op AI side)', async () => {
      const { caseId } = await insertPendingMediaCase();
      const res = await decide(moderatorToken, caseId, { decision: 'approve' });
      expect(res.status).toBe(200);
      // Không có recommendation nào để so sánh -> GET vẫn 404, KHÔNG có dòng nào được tạo ra.
      const getRes = await getRecommendation(moderatorToken, caseId);
      expect(getRes.status).toBe(404);
    });
  });

  describe('Statistics (repository + service ONLY — no HTTP endpoint)', () => {
    it('getStatistics() phản ánh ĐÚNG delta các recommendation vừa tạo/evaluate trong suite này', async () => {
      const service = app.get(AiRecommendationsService);
      const before = await service.getStatistics();

      const { caseId: caseA } = await insertPendingMediaCase();
      const genA = await generateRecommendation(aiAgentToken, caseA);
      const decisionA: string = genA.body.data.decision;
      const matchDecisionA = decisionA === 'reject' ? { decision: 'reject', reason: 'x' } : { decision: decisionA === 'hide' ? 'approve' : decisionA };
      await decide(moderatorToken, caseA, matchDecisionA as Record<string, unknown>);

      const { caseId: caseB } = await insertPendingMediaCase();
      await generateRecommendation(aiAgentToken, caseB);
      // Ép mismatch chắc chắn: quyết định thật LUÔN là approve, còn AI recommend gì cũng được — chỉ
      // coi là mismatch nếu AI KHÔNG phải approve; nếu AI đề nghị approve, decide bằng reject để giữ
      // chắc chắn mismatch bất kể AI đề nghị gì.
      const genBDecision: string = (await getRecommendation(moderatorToken, caseB)).body.data.decision;
      const mismatchDecision = genBDecision === 'approve' ? { decision: 'reject', reason: 'x' } : { decision: 'approve' };
      await decide(moderatorToken, caseB, mismatchDecision);

      const after = await service.getStatistics();

      expect(after.totalRecommendations).toBe(before.totalRecommendations + 2);
      expect(after.totalEvaluated).toBe(before.totalEvaluated + 2);

      const beforeMedia = before.byTargetType.find((t) => t.targetType === 'media');
      const afterMedia = after.byTargetType.find((t) => t.targetType === 'media');
      expect(afterMedia?.count).toBe((beforeMedia?.count ?? 0) + 2);
      expect(afterMedia?.evaluatedCount).toBe((beforeMedia?.evaluatedCount ?? 0) + 2);
    });
  });

  describe('Rollback — lỗi ghi phía AI KHÔNG BAO GIỜ ảnh hưởng quyết định thật (đối lập moderation-decide-rollback.e2e-spec.ts)', () => {
    it('recordModeratorOutcome ném lỗi -> decide() vẫn 200, media/case VẪN resolve đúng, CHỈ recommendation không được evaluate', async () => {
      const { mediaId, caseId } = await insertPendingMediaCase();
      await generateRecommendation(aiAgentToken, caseId);

      const aiRepo = app.get(AiRecommendationsRepository);
      const spy = jest.spyOn(aiRepo, 'recordModeratorOutcome').mockImplementationOnce(() => {
        throw new Error('INJECTED FAILURE (M7 rollback probe) — must NOT affect the real decision');
      });

      const res = await decide(moderatorToken, caseId, { decision: 'approve' });

      // KHÔNG 500 — hoàn toàn khác lỗi bên trong T2: đây là post-commit, try/catch nuốt lỗi.
      expect(res.status).toBe(200);
      spy.mockRestore();

      const mediaRow = await ds.query(`SELECT status FROM media WHERE id = $1`, [mediaId]);
      expect(mediaRow[0].status).toBe('published');
      const caseRow = await ds.query(`SELECT status, decision FROM moderation_cases WHERE id = $1`, [caseId]);
      expect(caseRow[0].status).toBe('resolved');
      expect(caseRow[0].decision).toBe('approve');

      // Phía AI: ghi thất bại thật sự KHÔNG được, evaluated_at vẫn NULL — không giả vờ thành công.
      const recRow = await ds.query(
        `SELECT evaluated_at, matched FROM ai_recommendations WHERE case_id = $1 ORDER BY created_at DESC LIMIT 1`,
        [caseId],
      );
      expect(recRow[0].evaluated_at).toBeNull();
      expect(recRow[0].matched).toBeNull();
    });
  });
});
