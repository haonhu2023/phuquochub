import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { createHash } from 'crypto';
import { AppModule } from '../src/app.module';
import { TransformInterceptor } from '../src/common/interceptors/transform.interceptor';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { MediaCleanupService } from '../src/modules/media/media-cleanup.service';
import { StorageService } from '../src/core/storage/storage.service';

// CẦN Postgres + Redis + MinIO thật (docker compose up -d postgres redis minio) + migration đã
// chạy (đến AddMediaOrphanCleanupIndex). Cùng cấu trúc/tiền đề với media.e2e-spec.ts — bucket
// phuquochub-test (NODE_ENV=test do Jest tự đặt).
describe('Media Orphan Cleanup (e2e, live Postgres + MinIO)', () => {
  let app: INestApplication;
  let ds: DataSource;
  let cleanup: MediaCleanupService;
  let storage: StorageService;
  let accessToken: string;
  const email = `e2e_orphan_cleanup_${Date.now()}@phuquochub.test`;
  const password = 'password123';
  const CONTENT_TYPE = 'image/jpeg';

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    app.useGlobalInterceptors(new TransformInterceptor());
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();

    ds = app.get<DataSource>(getDataSourceToken());
    cleanup = app.get(MediaCleanupService);
    storage = app.get(StorageService);

    const reg = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ email, password, display_name: 'E2E Orphan Cleanup User' });
    accessToken = reg.body.data.access_token;
  }, 30_000);

  afterAll(async () => {
    if (app) await app.close();
  });

  function sha256(buf: Buffer): string {
    return createHash('sha256').update(buf).digest('hex');
  }

  function fakeJpegBytes(seed: string): Buffer {
    return Buffer.from(`orphan-cleanup-e2e-${seed}-${Date.now()}-${Math.random()}`);
  }

  /** Đăng ký một media mồ côi THẬT (real object trên MinIO) qua đúng luồng presign→PUT→register. */
  async function seedRealOrphanMedia(seed: string): Promise<{ id: string; objectKey: string }> {
    const content = fakeJpegBytes(seed);
    const checksum = sha256(content);
    const presignRes = await request(app.getHttpServer())
      .post('/api/media/presign')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ content_type: CONTENT_TYPE, size: content.length, checksum_sha256: checksum });
    const { key, upload_url: uploadUrl } = presignRes.body.data;

    // `as BodyInit`: same pre-existing @types/node/undici-types gap fixed in media.e2e-spec.ts
    // (Buffer works fine as a fetch body at runtime — type-only cast, no behavior change).
    const putRes = await fetch(uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': CONTENT_TYPE },
      body: content as BodyInit,
    });
    if (putRes.status !== 200) throw new Error(`seed PUT failed: ${putRes.status}`);

    const registerRes = await request(app.getHttpServer())
      .post('/api/media')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ key });
    return { id: registerRes.body.data.id, objectKey: key };
  }

  /**
   * Media mồ côi TỔNG HỢP — chèn thẳng qua SQL, KHÔNG qua `POST /media/presign` (endpoint đó bị
   * giới hạn 10/phút; các test chứng minh phân trang nhiều lô cần nhiều dòng hơn ngân sách đó cho
   * PHÉP trong cùng file). Không có object thật trên MinIO đứng sau — hợp lệ và đã được hỗ trợ
   * đầy đủ (storageOutcome sẽ là 'not_found', vẫn soft-delete + audit đúng, xem describe
   * "object đã KHÔNG còn trên storage" ở trên). Chỉ dùng để kiểm tra hành vi PHÂN TRANG — vòng
   * round-trip MinIO thật đã được `seedRealOrphanMedia` chứng minh đầy đủ ở các describe khác.
   */
  async function seedSyntheticOrphanMedia(seed: string, hoursAgo: number): Promise<{ id: string; objectKey: string }> {
    const objectKey = `media/synthetic-${seed}-${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`;
    const rows: Array<{ id: string }> = await ds.query(
      `INSERT INTO media (type, url, provider, status, object_key, bucket, content_type, size_bytes,
                           checksum_sha256, uploaded_by, created_at)
       VALUES ('image', NULL, 'upload', 'pending', $1, 'phuquochub-test', 'image/jpeg', 38,
               $2, (SELECT id FROM users LIMIT 1), now() - ($3 || ' hours')::interval)
       RETURNING id`,
      [objectKey, sha256(Buffer.from(objectKey)), hoursAgo],
    );
    return { id: rows[0].id, objectKey };
  }

  /** Đẩy created_at lùi về quá khứ trực tiếp bằng SQL — API không có cách nào tạo dữ liệu "cũ". */
  async function backdateCreatedAt(id: string, hoursAgo: number): Promise<void> {
    await ds.query(`UPDATE media SET created_at = now() - ($2 || ' hours')::interval WHERE id = $1`, [id, hoursAgo]);
  }

  async function fetchMediaRow(id: string): Promise<{ deleted_at: Date | null; status: string } | undefined> {
    const rows = await ds.query(`SELECT deleted_at, status FROM media WHERE id = $1`, [id]);
    return rows[0];
  }

  async function fetchAuditRows(entityId: string): Promise<Array<{ event: string; context: unknown }>> {
    return ds.query(
      `SELECT event, context FROM audit_logs WHERE entity_type = 'media' AND entity_id = $1 ORDER BY id ASC`,
      [entityId],
    );
  }

  describe('dry-run', () => {
    it('không sửa DB, không sửa storage — chỉ báo cáo', async () => {
      const seeded = await seedRealOrphanMedia('dry-run');
      await backdateCreatedAt(seeded.id, 25);

      const summary = await cleanup.run({ dryRun: true });

      expect(summary.dryRun).toBe(true);
      expect(summary.sampleCandidates.some((c) => c.id === seeded.id)).toBe(true);

      const row = await fetchMediaRow(seeded.id);
      expect(row?.deleted_at).toBeNull();
      const audits = await fetchAuditRows(seeded.id);
      expect(audits).toHaveLength(0);
      // object vẫn còn thật trên MinIO — xoá thử lại lần nữa phải là "deleted", KHÔNG "not_found"
      const delRes = await storage.deleteObjectForCleanup(seeded.objectKey);
      expect(delRes.outcome).toBe('deleted');

      // Dọn dẹp: dòng NÀY vẫn còn đủ điều kiện (dry-run không đụng DB) — nhưng object đã bị xoá
      // thật ở assertion trên, nên KHÔNG dùng cleanup.run() thường (sẽ chỉ trả not_found, vẫn ổn,
      // nhưng soft-delete trực tiếp ở đây rõ ràng hơn về ý định "dọn rác của chính test này", tránh
      // để lại dòng mồ côi vĩnh viễn trong DB dev dùng chung — bug vệ sinh test thật đã phát hiện
      // qua rà soát hậu triển khai: bản gốc của test này để lại đúng rò rỉ này mỗi lần chạy).
      await ds.query(`UPDATE media SET deleted_at = now() WHERE id = $1`, [seeded.id]);
    });
  });

  describe('real cleanup — storage trước, rồi soft-delete, rồi audit', () => {
    it('media mồ côi quá 24h → object bị xoá khỏi MinIO, deleted_at được set, đúng 1 audit row', async () => {
      const seeded = await seedRealOrphanMedia('real-cleanup');
      await backdateCreatedAt(seeded.id, 25);

      const summary = await cleanup.run({});
      expect(summary.deleted).toBeGreaterThanOrEqual(1);

      const row = await fetchMediaRow(seeded.id);
      expect(row?.deleted_at).not.toBeNull();

      // Object đã bị xoá thật khỏi MinIO — xoá lại lần nữa phải trả not_found.
      const delRes = await storage.deleteObjectForCleanup(seeded.objectKey);
      expect(delRes.outcome).toBe('not_found');

      const audits = await fetchAuditRows(seeded.id);
      expect(audits).toHaveLength(1);
      expect(audits[0].event).toBe('media.orphan_cleaned');
      expect((audits[0].context as { storageOutcome: string }).storageOutcome).toBe('deleted');
    });

    it('media mồ côi CHƯA quá 24h → không bị đụng tới', async () => {
      const seeded = await seedRealOrphanMedia('fresh-not-eligible');
      // KHÔNG backdate — created_at ~ now().

      await cleanup.run({});

      const row = await fetchMediaRow(seeded.id);
      expect(row?.deleted_at).toBeNull();
      const audits = await fetchAuditRows(seeded.id);
      expect(audits).toHaveLength(0);
    });

    it('media đã gắn owner (review) trước khi cleanup chạy → không bị đụng tới dù quá hạn', async () => {
      const seeded = await seedRealOrphanMedia('owned-by-review');
      await backdateCreatedAt(seeded.id, 25);

      const placeRows: Array<{ id: string }> = await ds.query(
        `SELECT id FROM places WHERE deleted_at IS NULL AND status = 'published' ORDER BY id ASC LIMIT 1`,
      );
      const placeId = placeRows[0]?.id;
      if (placeId) {
        await request(app.getHttpServer())
          .post(`/api/places/${placeId}/reviews`)
          .set('Authorization', `Bearer ${accessToken}`)
          .send({ rating: 5, content: 'Orphan cleanup e2e — media này PHẢI được bảo vệ', media_ids: [seeded.id] });
      } else {
        // Không có place published nào sẵn — gắn owner trực tiếp qua SQL để vẫn kiểm tra được
        // đúng bất biến "có owner thì không đụng", không phụ thuộc dữ liệu seed sẵn có.
        await ds.query(`UPDATE media SET review_id = gen_random_uuid() WHERE id = $1`, [seeded.id]);
      }

      await cleanup.run({});

      const row = await fetchMediaRow(seeded.id);
      expect(row?.deleted_at).toBeNull();
    });

    it('object đã KHÔNG còn trên storage từ trước (not_found) → vẫn soft-delete + audit, phân biệt rõ storageOutcome', async () => {
      const seeded = await seedRealOrphanMedia('already-gone-from-storage');
      await backdateCreatedAt(seeded.id, 25);
      // Xoá object khỏi storage TRƯỚC khi job chạy — mô phỏng "đã mất từ trước".
      await storage.deleteObjectForCleanup(seeded.objectKey);

      await cleanup.run({});

      const row = await fetchMediaRow(seeded.id);
      expect(row?.deleted_at).not.toBeNull();
      const audits = await fetchAuditRows(seeded.id);
      expect(audits).toHaveLength(1);
      expect((audits[0].context as { storageOutcome: string }).storageOutcome).toBe('not_found');
    });
  });

  describe('phân trang keyset qua nhiều lô (post-implementation review fix, xác nhận với DB thật)', () => {
    it('batchSize NHỎ HƠN số ứng viên thật → real run dọn HẾT trong 1 lần gọi run(), không dòng nào bị bỏ sót', async () => {
      const seeded = await Promise.all([
        seedSyntheticOrphanMedia('keyset-a', 25),
        seedSyntheticOrphanMedia('keyset-b', 25),
        seedSyntheticOrphanMedia('keyset-c', 25),
      ]);

      const summary = await cleanup.run({ batchSize: 1 }); // 1 dòng/lô, 3 dòng đủ điều kiện → cần ≥3 lô

      expect(summary.batchesRun).toBeGreaterThanOrEqual(3);
      for (const s of seeded) {
        const row = await fetchMediaRow(s.id);
        expect(row?.deleted_at).not.toBeNull();
        const audits = await fetchAuditRows(s.id);
        expect(audits).toHaveLength(1); // đúng 1 mỗi dòng — không dòng nào bị đếm/ghi trùng
      }
    });

    it('DRY-RUN batchSize NHỎ HƠN số ứng viên thật → liệt kê đủ, không lặp lại cùng dòng qua các lô', async () => {
      const seeded = await Promise.all([
        seedSyntheticOrphanMedia('keyset-dryrun-a', 25),
        seedSyntheticOrphanMedia('keyset-dryrun-b', 25),
      ]);

      const summary = await cleanup.run({ dryRun: true, batchSize: 1 });

      const seenIds = new Set(summary.sampleCandidates.map((c) => c.id));
      for (const s of seeded) expect(seenIds.has(s.id)).toBe(true);
      // Không dòng nào bị đụng — vẫn phải dọn thật sau đó để không để lại rác cho các test khác.
      for (const s of seeded) {
        const row = await fetchMediaRow(s.id);
        expect(row?.deleted_at).toBeNull();
      }
      await cleanup.run({});
    });
  });

  describe('idempotency', () => {
    it('chạy cleanup 2 lần liên tiếp trên cùng dữ liệu → lần 2 là no-op sạch, KHÔNG audit trùng, KHÔNG lỗi', async () => {
      const seeded = await seedRealOrphanMedia('idempotency-check');
      await backdateCreatedAt(seeded.id, 25);

      await cleanup.run({});
      const afterFirst = await fetchAuditRows(seeded.id);
      expect(afterFirst).toHaveLength(1);

      const secondSummary = await cleanup.run({});
      const afterSecond = await fetchAuditRows(seeded.id);

      expect(afterSecond).toHaveLength(1); // vẫn đúng 1 — không ghi thêm
      expect(secondSummary.errors).toBe(0);
    });
  });

  describe('dry-run sau cleanup thật', () => {
    it('sau khi dọn xong, dry-run không còn liệt kê dòng vừa dọn trong danh sách mẫu', async () => {
      const seeded = await seedRealOrphanMedia('dry-run-after-cleanup');
      await backdateCreatedAt(seeded.id, 25);

      await cleanup.run({});
      const dryRunAfter = await cleanup.run({ dryRun: true });

      expect(dryRunAfter.sampleCandidates.some((c) => c.id === seeded.id)).toBe(false);
    });
  });
});
