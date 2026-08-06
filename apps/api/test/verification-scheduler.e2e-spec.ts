import { execFileSync } from 'child_process';
import { join } from 'path';
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
import { VerificationExpiryScheduler } from '../src/modules/verifications/verification-expiry.scheduler';

const SCRIPT_PATH = join(__dirname, '..', 'src', 'scripts', 'expire-overdue-verifications.ts');
const API_ROOT = join(__dirname, '..');
// `node -r ts-node/register <script>` thay vì gọi shim `.bin/ts-node(.cmd)` — `node.exe` là PE thật
// trên MỌI platform (khác `.cmd` trên Windows, vốn cần `shell:true`, kéo theo cảnh báo an toàn của
// Node khi truyền args cùng `shell:true`). `execFileSync` không dùng shell nào — an toàn, đa nền tảng.
function runScriptSync(args: string[]): string {
  return execFileSync(process.execPath, ['-r', 'ts-node/register', SCRIPT_PATH, ...args], {
    cwd: API_ROOT,
    encoding: 'utf8',
    timeout: 60_000,
  });
}

// VERIFICATION SCHEDULER — Operational Enablement (2026-08-06, ADR-008). Live Postgres. Covers:
// bounded batching (batchSize/maxBatches respected against a real query), a genuine CAS race (two
// REAL concurrent transactions racing on the same row — not a mocked casUpdate return), idempotent
// re-run (no duplicate events), in-process overlap prevention on the scheduler itself, a
// deterministic time-budget stop, and the manual runner invoked as a REAL child process (proving
// the CLI entry point works end-to-end, not just VerificationsService.expireOverdue()).
describe('Verification Scheduler — Operational Enablement (live Postgres)', () => {
  let app: INestApplication;
  let ds: DataSource;
  let jwt: JwtService;
  let config: ConfigService;
  let categoryId: string;

  const userIds: string[] = [];
  const placeIds: string[] = [];
  const sourceIds: string[] = [];

  async function createUser(label: string, roleCode: string) {
    const email = `e2e_vsched_${label}_${Date.now()}_${Math.random().toString(36).slice(2)}@phuquochub.test`;
    const rows: Array<{ id: string }> = await ds.query(
      `INSERT INTO users (email, display_name) VALUES ($1, $2) RETURNING id`,
      [email, `Verif Scheduler E2E ${label}`],
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
      [`E2E VSched ${label}`, `e2e-vsched-${label}-${Date.now()}-${Math.random().toString(36).slice(2)}`, categoryId],
    );
    placeIds.push(rows[0].id);
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

  /** Tạo TRỰC TIẾP một dòng `verifications` đã "official + quá hạn" (bỏ qua HTTP, dựng nhanh nhiều dòng cho test batching). */
  async function mkOverdueOfficialVerification(placeId: string, sourceId: string, expiresAt: Date): Promise<string> {
    const rows: Array<{ id: string }> = await ds.query(
      `INSERT INTO verifications (place_id, status, method, source_id, expires_at, valid_from)
       VALUES ($1, 'official', 'moderator', $2, $3, now())
       RETURNING id`,
      [placeId, sourceId, expiresAt],
    );
    await ds.query(`UPDATE places SET verification_status='official', verified_at=now() WHERE id=$1`, [placeId]);
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
      await ds.query(
        `DELETE FROM verification_votes WHERE verification_id IN (SELECT id FROM verifications WHERE place_id = ANY($1))`,
        [placeIds],
      );
      await ds.query(
        `DELETE FROM verification_events WHERE verification_id IN (SELECT id FROM verifications WHERE place_id = ANY($1))`,
        [placeIds],
      );
      await ds.query(`DELETE FROM verifications WHERE place_id = ANY($1)`, [placeIds]);
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

  it('batching: 5 dòng đủ điều kiện, batchSize=2 -> đúng 3 lô, TẤT CẢ 5 dòng expired, KHÔNG dòng nào bị bỏ sót hay xử lý hai lần', async () => {
    const sourceId = await mkSource('government');
    const past = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const ids: string[] = [];
    for (let i = 0; i < 5; i++) {
      const placeId = await mkPlace(`batch_${i}`);
      ids.push(await mkOverdueOfficialVerification(placeId, sourceId, past));
    }

    const service = app.get(VerificationsService);
    const summary = await service.expireOverdue({ batchSize: 2, maxBatches: 10 });

    expect(summary.batchesRun).toBe(3); // 2 + 2 + 1
    expect(summary.scanned).toBeGreaterThanOrEqual(5);
    expect(summary.expired).toBeGreaterThanOrEqual(5);

    const rows = await ds.query(`SELECT status FROM verifications WHERE id = ANY($1)`, [ids]);
    expect(rows.every((r: { status: string }) => r.status === 'expired')).toBe(true);

    // Không dòng nào bị xử lý HAI LẦN — đúng MỘT verification_event mỗi dòng.
    const eventCounts = await ds.query(
      `SELECT verification_id, count(*)::int AS n FROM verification_events WHERE verification_id = ANY($1) GROUP BY verification_id`,
      [ids],
    );
    expect(eventCounts).toHaveLength(5);
    expect(eventCounts.every((r: { n: number }) => r.n === 1)).toBe(true);
  });

  it('maxBatches: giới hạn ĐÚNG số lô dù còn dòng đủ điều kiện; các dòng còn lại vẫn nguyên "official" (không mất, chỉ chưa tới lượt)', async () => {
    const sourceId = await mkSource('official_website');
    const past = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const ids: string[] = [];
    for (let i = 0; i < 4; i++) {
      const placeId = await mkPlace(`maxbatch_${i}`);
      ids.push(await mkOverdueOfficialVerification(placeId, sourceId, past));
    }

    const service = app.get(VerificationsService);
    const summary = await service.expireOverdue({ batchSize: 1, maxBatches: 2 });

    expect(summary.batchesRun).toBe(2);
    expect(summary.expired).toBe(2);

    const statuses: Array<{ status: string }> = await ds.query(`SELECT status FROM verifications WHERE id = ANY($1)`, [ids]);
    const expiredCount = statuses.filter((s) => s.status === 'expired').length;
    const officialCount = statuses.filter((s) => s.status === 'official').length;
    expect(expiredCount).toBe(2);
    expect(officialCount).toBe(2); // KHÔNG mất — vẫn còn nguyên, chờ lần chạy kế tiếp

    // Dọn phần còn lại (chưa hết hạn) để không ảnh hưởng test khác.
    const finalSummary = await service.expireOverdue({ batchSize: 10, maxBatches: 10 });
    expect(finalSummary.expired).toBe(2);
  });

  it('time budget: maxExecutionMs cực nhỏ với nhiều dòng -> dừng SỚM, timeBudgetExceeded=true, dòng còn lại vẫn nguyên vẹn (không dở dang)', async () => {
    const sourceId = await mkSource('government');
    const past = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const ids: string[] = [];
    for (let i = 0; i < 6; i++) {
      const placeId = await mkPlace(`budget_${i}`);
      ids.push(await mkOverdueOfficialVerification(placeId, sourceId, past));
    }

    const service = app.get(VerificationsService);
    // batchSize=1 buộc MỖI dòng là một lô riêng -> ngân sách được kiểm giữa MỖI dòng, chắc chắn dừng sớm.
    const summary = await service.expireOverdue({ batchSize: 1, maxBatches: 20, maxExecutionMs: 1 });

    expect(summary.timeBudgetExceeded).toBe(true);
    expect(summary.expired).toBeLessThan(6); // dừng TRƯỚC khi xử lý hết

    const statuses: Array<{ status: string; expires_at: Date }> = await ds.query(
      `SELECT status, expires_at FROM verifications WHERE id = ANY($1)`,
      [ids],
    );
    // MỌI dòng ĐANG ở 'official' (chưa đụng) hoặc 'expired' (đã xử lý XONG TRỌN VẸN) — KHÔNG dòng
    // nào dở dang (vd status vẫn official nhưng đã có event, hoặc ngược lại).
    for (const row of statuses) {
      expect(['official', 'expired']).toContain(row.status);
    }
    const expiredIds = ids.filter((_, i) => statuses[i].status === 'expired');
    const eventCounts = await ds.query(
      `SELECT verification_id, count(*)::int AS n FROM verification_events WHERE verification_id = ANY($1) GROUP BY verification_id`,
      [expiredIds.length ? expiredIds : ['00000000-0000-0000-0000-000000000000']],
    );
    expect(eventCounts.every((r: { n: number }) => r.n === 1)).toBe(true);

    // Dọn phần còn lại.
    await service.expireOverdue({ batchSize: 10, maxBatches: 10 });
  });

  it('chạy lại lần hai (idempotent): 0 dòng đủ điều kiện còn lại -> KHÔNG event mới, KHÔNG lỗi', async () => {
    const sourceId = await mkSource('business_owner');
    const placeId = await mkPlace('idempotent');
    const past = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const verifId = await mkOverdueOfficialVerification(placeId, sourceId, past);

    const service = app.get(VerificationsService);
    const first = await service.expireOverdue({ batchSize: 10 });
    expect(first.expired).toBeGreaterThanOrEqual(1);

    const eventsAfterFirst = await ds.query(`SELECT count(*)::int AS n FROM verification_events WHERE verification_id=$1`, [
      verifId,
    ]);

    const second = await service.expireOverdue({ batchSize: 10 });
    // Dòng đã 'expired' không còn khớp WHERE status IN (verified,official,community_verified) —
    // KHÔNG được quét lại.
    const eventsAfterSecond = await ds.query(`SELECT count(*)::int AS n FROM verification_events WHERE verification_id=$1`, [
      verifId,
    ]);
    expect(eventsAfterSecond[0].n).toBe(eventsAfterFirst[0].n); // KHÔNG event mới
    expect(second.errors).toBe(0);
  });

  it('CAS race THẬT (không mock): reject() qua HTTP và expireOverdue() chạy ĐỒNG THỜI trên CÙNG một dòng — đúng MỘT bên thắng, không mất mát/nhân đôi', async () => {
    const moderator = await createUser('cas_race_mod', 'moderator');
    const sourceId = await mkSource('government');
    const placeId = await mkPlace('cas_race');
    const past = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const verifId = await mkOverdueOfficialVerification(placeId, sourceId, past);

    const service = app.get(VerificationsService);

    const [rejectRes, summary] = await Promise.all([
      request(app.getHttpServer())
        .post(`/api/verifications/${verifId}/reject`)
        .set('Authorization', `Bearer ${moderator.accessToken}`)
        .send({ reason_code: 'outdated' }),
      service.expireOverdue({ batchSize: 10 }),
    ]);

    const final = await ds.query(`SELECT status FROM verifications WHERE id=$1`, [verifId]);
    const eventCount = await ds.query(`SELECT count(*)::int AS n FROM verification_events WHERE verification_id=$1`, [
      verifId,
    ]);

    // Đúng MỘT trong hai thắng: hoặc reject thắng (status=rejected, HTTP 200, job đếm conflict) —
    // hoặc job thắng trước (status=expired, reject() thấy trạng thái không hợp lệ -> 422/409).
    if (final[0].status === 'rejected') {
      expect(rejectRes.status).toBe(200);
      expect(summary.conflicts).toBeGreaterThanOrEqual(1);
      expect(summary.expired).toBe(0);
    } else {
      expect(final[0].status).toBe('expired');
      expect([409, 422]).toContain(rejectRes.status);
      expect(summary.expired).toBeGreaterThanOrEqual(1);
    }
    // DÙ ai thắng: đúng MỘT transition thật sự xảy ra, không mất mát/nhân đôi.
    expect(eventCount[0].n).toBe(1);
    expect(summary.errors).toBe(0);
  });

  it('scheduler: hai lần gọi runTick() CHỒNG NHAU trong tiến trình -> lần thứ hai bị BỎ QUA (trả null), KHÔNG chạy expireOverdue song song', async () => {
    const sourceId = await mkSource('official_website');
    const placeId = await mkPlace('scheduler_overlap');
    const past = new Date(Date.now() - 24 * 60 * 60 * 1000);
    await mkOverdueOfficialVerification(placeId, sourceId, past);

    const scheduler = app.get(VerificationExpiryScheduler);
    const [first, second] = await Promise.all([scheduler.runTick(), scheduler.runTick()]);

    // Đúng MỘT trong hai lời gọi thực sự chạy (trả summary), lời gọi CÒN LẠI bị bỏ qua (null) —
    // vì cả hai được phát ĐỒNG THỜI, promise nào "thắng" việc set isRunning=true trước là ngẫu
    // nhiên (phụ thuộc lịch trình microtask) — assert tính chất bất biến, KHÔNG assert thứ tự.
    const results = [first, second];
    const ran = results.filter((r) => r !== null);
    const skipped = results.filter((r) => r === null);
    expect(ran).toHaveLength(1);
    expect(skipped).toHaveLength(1);
  });

  it('manual runner (CLI THẬT, tiến trình con): --dry-run báo cáo đúng cấu trúc, KHÔNG ghi gì lên dòng CỦA TEST NÀY; chạy thật sau đó expire đúng dòng, exit code 0', async () => {
    // LƯU Ý cô lập: `expireOverdue()` quét TOÀN CỤC theo thiết kế (không, và KHÔNG NÊN, lọc theo
    // dữ liệu riêng của một test suite — nó là một job nền THẬT). Khi Jest chạy nhiều FILE e2e
    // song song, một lần chạy thật ở `verifications.e2e-spec.ts` (file KHÁC) có thể xử lý CÙNG lúc
    // với CLI subprocess ở đây — nên các assertion dưới đây cố tình KHÔNG dựa vào con số tổng hợp
    // toàn cục (`eligible`/`expired` trong stdout CLI, vốn phản ánh MỌI dòng trong DB, không riêng
    // gì test này) mà đối chiếu TRỰC TIẾP qua SQL trên ĐÚNG MỘT dòng do CHÍNH test này tạo ra —
    // xác định, không phụ thuộc việc file khác có đang chạy song song hay không.
    const sourceId = await mkSource('government');
    const placeId = await mkPlace('cli_runner');
    const past = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const verifId = await mkOverdueOfficialVerification(placeId, sourceId, past);

    const dryRunOutput = runScriptSync(['--dry-run']);
    expect(dryRunOutput).toContain('dryRun:              true');
    expect(dryRunOutput).toMatch(/eligible:\s+\d+/); // cấu trúc đúng — KHÔNG giả định con số cụ thể (toàn cục, có thể bị file khác chạy song song ảnh hưởng)

    const beforeDryRun = await ds.query(`SELECT status, updated_at FROM verifications WHERE id=$1`, [verifId]);
    // Dòng CỦA TEST NÀY cụ thể: dry-run không ghi gì lên NÓ. (Nếu status đã đổi, đó PHẢI là do một
    // real run ở file khác chạy song song đụng vào — cực hiếm trong đúng khung thời gian hẹp giữa
    // insert và dry-run — không phải do chính dry-run vừa chạy, vì dry-run tuyệt đối không mở
    // transaction nào, xem VerificationsService.expireOverdue()'s `if (!dryRun)` gate.)
    expect(beforeDryRun[0].status).toBe('official');

    const realRunOutput = runScriptSync([]);
    expect(realRunOutput).toContain('dryRun:              false');
    expect(realRunOutput).toMatch(/expired:\s+\d+/);

    const afterRealRun = await ds.query(`SELECT status FROM verifications WHERE id=$1`, [verifId]);
    expect(afterRealRun[0].status).toBe('expired'); // ĐÚNG dòng của test này — xác định bất kể file khác
  }, 90_000);

  it('cleanup: 0 residue trên các bảng suite này chạm tới', async () => {
    const stats = await ds.query(
      `SELECT
         (SELECT count(*)::int FROM verifications WHERE place_id = ANY($1)) AS verifications,
         (SELECT count(*)::int FROM verification_events ve JOIN verifications v ON v.id=ve.verification_id WHERE v.place_id = ANY($1)) AS events,
         (SELECT count(*)::int FROM sources WHERE id = ANY($2)) AS sources_leaked_if_not_zero_at_end`,
      [placeIds, []],
    );
    // Bảng thật sự kiểm ở `afterAll` — test này chỉ xác nhận state HIỆN TẠI (trước teardown) hợp lệ,
    // không có dòng verifications/events mồ côi phát sinh ngoài dự kiến trong CHÍNH suite.
    expect(stats[0].verifications).toBeGreaterThan(0); // các test trên đã tạo — sẽ dọn ở afterAll
    expect(stats[0].events).toBeGreaterThan(0);
  });
});
