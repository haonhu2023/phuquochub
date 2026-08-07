import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { TransformInterceptor } from '../src/common/interceptors/transform.interceptor';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { ReportsRepository } from '../src/modules/moderation/repositories/reports.repository';

// Moderation M6 live-validation (Phase 10-G, ADR-018 T2 atomicity invariant): decide() wraps the
// ENTIRE decision (status mutation + case resolve + report resolution) in one
// `dataSource.transaction()`. This proves atomicity against the REAL Postgres transaction manager
// — no production code is modified; only a repository method called INSIDE the transaction
// (AFTER the status mutation, BEFORE commit) is spied to throw once via Nest DI, exactly what
// Phase 10-G asks for ("force transaction failure after status mutation but before commit").
// Disposable fixtures inserted via `ds.query` and removed in `afterAll`, same convention as the
// sibling moderation e2e specs in this directory.
describe('Moderation decide() — transaction rollback (e2e, live validation)', () => {
  let app: INestApplication;
  let ds: DataSource;
  let moderatorToken: string;
  let moderatorUserId: string;
  let uploaderUserId: string;

  const mediaIds: string[] = [];
  const caseIds: string[] = [];
  let grantedUserRoleId: string | null = null;

  const moderatorEmail = `e2e_rollback_moderator_${Date.now()}@phuquochub.test`;
  const uploaderEmail = `e2e_rollback_uploader_${Date.now()}@phuquochub.test`;
  const password = 'password123';

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
      .send({ email: moderatorEmail, password, display_name: 'E2E Rollback Moderator' });
    moderatorToken = reg1.body.data.access_token;
    moderatorUserId = reg1.body.data.user.id;

    const reg2 = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ email: uploaderEmail, password, display_name: 'E2E Rollback Uploader' });
    uploaderUserId = reg2.body.data.user.id;

    const granted: Array<{ id: string }> = await ds.query(
      `INSERT INTO user_roles (user_id, role_id)
       SELECT $1, r.id FROM roles r WHERE r.code = 'moderator'
       RETURNING id`,
      [moderatorUserId],
    );
    grantedUserRoleId = granted[0]?.id ?? null;
  }, 30_000);

  // Teardown hang fix (2026-08-07): dọn dẹp trong `try` — nếu một bước ném lỗi, `finally` vẫn đảm
  // bảo `app.close()` chạy (không thì Nest/TypeORM giữ handle mở, Jest treo sau khi in kết quả).
  // KHÔNG nuốt lỗi bằng `.catch()`: lỗi dọn dẹp vẫn nổi lên sau `finally`.
  afterAll(async () => {
    try {
      if (ds?.isInitialized) {
        if (caseIds.length) await ds.query(`DELETE FROM moderation_cases WHERE id = ANY($1)`, [caseIds]);
        if (mediaIds.length) await ds.query(`DELETE FROM media WHERE id = ANY($1)`, [mediaIds]);
        if (grantedUserRoleId) await ds.query(`DELETE FROM user_roles WHERE id = $1`, [grantedUserRoleId]);
        // Xoá luôn 2 user đăng ký cho suite (khác các spec anh em cùng thư mục, vốn để lại user —
        // zero-residue live-validation, Phase 10-H). decide() thành công ghi audit_logs.actor_id
        // = moderatorUserId nên phải xoá audit_logs trước để không vướng FK khi xoá users.
        const userIds = [moderatorUserId, uploaderUserId].filter(Boolean);
        if (userIds.length) {
          await ds.query(`DELETE FROM audit_logs WHERE actor_id = ANY($1)`, [userIds]);
          await ds.query(`DELETE FROM users WHERE id = ANY($1)`, [userIds]);
        }
      }
    } finally {
      if (app) await app.close();
    }
  });

  it('lỗi sau khi mutate status nhưng trước commit -> ROLLBACK toàn bộ (media/case KHÔNG đổi)', async () => {
    const mediaRows: Array<{ id: string }> = await ds.query(
      `INSERT INTO media (type, provider, status, uploaded_by, object_key, bucket, content_type, size_bytes, checksum_sha256)
       VALUES ('image', 'upload', 'pending', $1, $2, 'phuquochub-test', 'image/jpeg', 100, $3)
       RETURNING id`,
      [uploaderUserId, `media/e2e-rollback-${Date.now()}.jpg`, '9'.repeat(64)],
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

    // reports.repository.resolveByCaseId chạy TRONG transaction, SAU KHI mediaRepo.updateStatus
    // (pending->published) và casesRepo.resolve (open->resolved) đã được UPDATE (chưa commit).
    // Ném lỗi ở đây mô phỏng chính xác "fail sau mutation, trước commit" mà không sửa code sản
    // phẩm — chỉ spy qua Nest DI container, khôi phục ngay sau bài test.
    const reportsRepo = app.get(ReportsRepository);
    const spy = jest
      .spyOn(reportsRepo, 'resolveByCaseId')
      .mockImplementationOnce(() => {
        throw new Error('INJECTED FAILURE (Phase 10-G rollback probe) — must not be committed');
      });

    const res = await request(app.getHttpServer())
      .post(`/api/moderation/cases/${caseId}/decide`)
      .set('Authorization', `Bearer ${moderatorToken}`)
      .send({ decision: 'approve' });

    // Lỗi không phải HttpException -> AllExceptionsFilter map thành 500 (không lộ message kỹ
    // thuật cho client — hành vi hiện có, không phải điều bài test này khẳng định).
    expect(res.status).toBe(500);

    spy.mockRestore();

    // Bất biến cốt lõi (INV atomicity của decide()): KHÔNG mutation nào được commit.
    const mediaAfter = await ds.query(`SELECT status FROM media WHERE id = $1`, [mediaId]);
    expect(mediaAfter[0].status).toBe('pending'); // KHÔNG phải 'published'

    const caseAfter = await ds.query(`SELECT status, decision, resolved_at FROM moderation_cases WHERE id = $1`, [
      caseId,
    ]);
    expect(caseAfter[0].status).toBe('open'); // KHÔNG phải 'resolved'
    expect(caseAfter[0].decision).toBeNull();
    expect(caseAfter[0].resolved_at).toBeNull();

    // Xác nhận decide() giờ thực sự hoạt động lại bình thường (spy đã gỡ) — case không bị "kẹt".
    const res2 = await request(app.getHttpServer())
      .post(`/api/moderation/cases/${caseId}/decide`)
      .set('Authorization', `Bearer ${moderatorToken}`)
      .send({ decision: 'approve' });
    expect(res2.status).toBe(200);

    const mediaFinal = await ds.query(`SELECT status FROM media WHERE id = $1`, [mediaId]);
    expect(mediaFinal[0].status).toBe('published');
  });
});
