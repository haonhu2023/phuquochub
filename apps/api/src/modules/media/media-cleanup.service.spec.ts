import { MediaCleanupService } from './media-cleanup.service';
import { MediaRepository, OrphanCleanupCandidate } from './repositories/media.repository';
import { StorageService } from '../../core/storage/storage.service';
import { AuditService } from '../../core/audit/audit.service';
import { createMock, LooseMock } from '../../../test/helpers/create-mock';

function candidate(overrides: Partial<OrphanCleanupCandidate> = {}): OrphanCleanupCandidate {
  return {
    id: 'm1',
    objectKey: 'media/m1.jpg',
    bucket: 'phuquochub-test',
    uploadedBy: 'u1',
    createdAt: new Date('2026-07-30T00:00:00.000Z'),
    ...overrides,
  };
}

describe('MediaCleanupService', () => {
  let mediaRepo: LooseMock<MediaRepository>;
  let storage: LooseMock<StorageService>;
  let audit: LooseMock<AuditService>;
  let sut: MediaCleanupService;

  beforeEach(() => {
    mediaRepo = createMock<MediaRepository>({
      findOrphanCleanupCandidates: jest.fn(),
      softDeleteOrphanCandidate: jest.fn(),
    });
    storage = createMock<StorageService>({ deleteObjectForCleanup: jest.fn() });
    audit = createMock<AuditService>({ record: jest.fn() });
    sut = new MediaCleanupService(mediaRepo, storage, audit);
  });

  describe('real run — happy path', () => {
    it('xoá storage TRƯỚC, rồi soft-delete DB, rồi ghi audit — đúng thứ tự', async () => {
      const order: string[] = [];
      mediaRepo.findOrphanCleanupCandidates
        .mockImplementationOnce(async () => [candidate()])
        .mockImplementationOnce(async () => []);
      storage.deleteObjectForCleanup.mockImplementation(async () => {
        order.push('storage');
        return { outcome: 'deleted' };
      });
      mediaRepo.softDeleteOrphanCandidate.mockImplementation(async () => {
        order.push('db');
        return true;
      });
      audit.record.mockImplementation(async () => {
        order.push('audit');
      });

      const summary = await sut.run();

      expect(order).toEqual(['storage', 'db', 'audit']);
      expect(storage.deleteObjectForCleanup).toHaveBeenCalledWith('media/m1.jpg');
      expect(mediaRepo.softDeleteOrphanCandidate).toHaveBeenCalledWith('m1');
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'media.orphan_cleaned',
          entityType: 'media',
          entityId: 'm1',
          isServiceAccount: true,
          result: 'success',
          context: expect.objectContaining({ objectKey: 'media/m1.jpg', storageOutcome: 'deleted' }),
        }),
      );
      expect(summary).toMatchObject({ dryRun: false, scanned: 1, eligible: 1, deleted: 1, notFound: 0 });
    });

    it('context.createdAt là chuỗi ISO, KHÔNG phải Date thô (AuditService.redact() sẽ biến Date thô thành "{}")', async () => {
      mediaRepo.findOrphanCleanupCandidates
        .mockImplementationOnce(async () => [candidate({ createdAt: new Date('2026-07-30T00:00:00.000Z') })])
        .mockImplementationOnce(async () => []);
      storage.deleteObjectForCleanup.mockResolvedValue({ outcome: 'deleted' });
      mediaRepo.softDeleteOrphanCandidate.mockResolvedValue(true);

      await sut.run();

      const call = audit.record.mock.calls[0][0] as { context: { createdAt: unknown } };
      expect(call.context.createdAt).toBe('2026-07-30T00:00:00.000Z');
    });
  });

  it('storage trả not_found → vẫn soft-delete + audit, storageOutcome="not_found" (requirement 8)', async () => {
    mediaRepo.findOrphanCleanupCandidates
      .mockImplementationOnce(async () => [candidate()])
      .mockImplementationOnce(async () => []);
    storage.deleteObjectForCleanup.mockResolvedValue({ outcome: 'not_found' });
    mediaRepo.softDeleteOrphanCandidate.mockResolvedValue(true);

    const summary = await sut.run();

    expect(mediaRepo.softDeleteOrphanCandidate).toHaveBeenCalledWith('m1');
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ context: expect.objectContaining({ storageOutcome: 'not_found' }) }),
    );
    expect(summary).toMatchObject({ deleted: 0, notFound: 1 });
  });

  it('lỗi storage KHÁC (không phải not-found) → KHÔNG soft-delete, KHÔNG ghi audit, tiếp tục dòng kế (requirement 9)', async () => {
    const c1 = candidate({ id: 'm1' });
    const c2 = candidate({ id: 'm2' });
    mediaRepo.findOrphanCleanupCandidates
      .mockImplementationOnce(async () => [c1, c2])
      .mockImplementationOnce(async () => []);
    storage.deleteObjectForCleanup
      .mockRejectedValueOnce(new Error('network down'))
      .mockResolvedValueOnce({ outcome: 'deleted' });
    mediaRepo.softDeleteOrphanCandidate.mockResolvedValue(true);

    const summary = await sut.run();

    expect(mediaRepo.softDeleteOrphanCandidate).toHaveBeenCalledTimes(1);
    expect(mediaRepo.softDeleteOrphanCandidate).toHaveBeenCalledWith('m2');
    expect(audit.record).toHaveBeenCalledTimes(1);
    expect(summary).toMatchObject({ errors: 1, deleted: 1 });
  });

  it('UPDATE khớp 0 dòng (đã bị dọn bởi lần chạy khác) → không ghi audit, không phải lỗi', async () => {
    mediaRepo.findOrphanCleanupCandidates
      .mockImplementationOnce(async () => [candidate()])
      .mockImplementationOnce(async () => []);
    storage.deleteObjectForCleanup.mockResolvedValue({ outcome: 'deleted' });
    mediaRepo.softDeleteOrphanCandidate.mockResolvedValue(false);

    const summary = await sut.run();

    expect(audit.record).not.toHaveBeenCalled();
    expect(summary).toMatchObject({ errors: 0, alreadyHandled: 1 });
  });

  it('object_key rỗng → bỏ qua gọi storage, vẫn soft-delete + audit (storageOutcome="skipped_no_object_key")', async () => {
    mediaRepo.findOrphanCleanupCandidates
      .mockImplementationOnce(async () => [candidate({ objectKey: null })])
      .mockImplementationOnce(async () => []);
    mediaRepo.softDeleteOrphanCandidate.mockResolvedValue(true);

    const summary = await sut.run();

    expect(storage.deleteObjectForCleanup).not.toHaveBeenCalled();
    expect(mediaRepo.softDeleteOrphanCandidate).toHaveBeenCalledWith('m1');
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ context: expect.objectContaining({ storageOutcome: 'skipped_no_object_key' }) }),
    );
    expect(summary).toMatchObject({ skippedNoObjectKey: 1 });
  });

  it('vòng lặp dừng khi một lô trả về ít hơn batchSize (đã hết ứng viên)', async () => {
    mediaRepo.findOrphanCleanupCandidates.mockResolvedValueOnce([candidate()]);
    storage.deleteObjectForCleanup.mockResolvedValue({ outcome: 'deleted' });
    mediaRepo.softDeleteOrphanCandidate.mockResolvedValue(true);

    await sut.run({ batchSize: 10 });

    expect(mediaRepo.findOrphanCleanupCandidates).toHaveBeenCalledTimes(1);
  });

  it('tôn trọng maxBatches (an toàn không chạy vô hạn)', async () => {
    mediaRepo.findOrphanCleanupCandidates.mockResolvedValue([candidate()]); // luôn trả đủ batchSize=1 → không bao giờ "hết"
    storage.deleteObjectForCleanup.mockResolvedValue({ outcome: 'deleted' });
    mediaRepo.softDeleteOrphanCandidate.mockResolvedValue(true);

    const summary = await sut.run({ batchSize: 1, maxBatches: 3 });

    expect(mediaRepo.findOrphanCleanupCandidates).toHaveBeenCalledTimes(3);
    expect(summary.batchesRun).toBe(3);
  });

  describe('giới hạn thời gian thực thi (maxExecutionMs)', () => {
    it('hoàn tất dòng ĐANG xử lý an toàn, rồi dừng — không dòng nào bị xử lý dở dang', async () => {
      let now = 0;
      jest.spyOn(Date, 'now').mockImplementation(() => now);

      const c1 = candidate({ id: 'm1' });
      const c2 = candidate({ id: 'm2' });
      mediaRepo.findOrphanCleanupCandidates.mockImplementationOnce(async () => [c1, c2]);
      storage.deleteObjectForCleanup.mockImplementation(async () => {
        now = 1000; // vượt ngân sách NGAY SAU khi bắt đầu xử lý dòng đầu tiên
        return { outcome: 'deleted' };
      });
      mediaRepo.softDeleteOrphanCandidate.mockResolvedValue(true);

      const summary = await sut.run({ maxExecutionMs: 500 });

      // Dòng đầu tiên (m1) đã bắt đầu trước khi vượt ngân sách → PHẢI hoàn tất toàn bộ chuỗi
      // storage→db→audit của chính nó (không dở dang), rồi mới dừng trước dòng thứ hai (m2).
      expect(mediaRepo.softDeleteOrphanCandidate).toHaveBeenCalledTimes(1);
      expect(mediaRepo.softDeleteOrphanCandidate).toHaveBeenCalledWith('m1');
      expect(audit.record).toHaveBeenCalledTimes(1);
      expect(summary.timeBudgetExceeded).toBe(true);
      expect(summary.scanned).toBe(1); // m2 chưa từng được đếm — vòng lặp dừng TRƯỚC khi chạm nó

      jest.spyOn(Date, 'now').mockRestore();
    });
  });

  describe('dry-run', () => {
    it('không gọi storage/DB-write/audit; vẫn chạy đúng truy vấn ứng viên và tổng hợp thống kê', async () => {
      const older = candidate({ id: 'm1', objectKey: 'media/m1.jpg', createdAt: new Date('2026-07-28T00:00:00Z') });
      const newer = candidate({ id: 'm2', objectKey: 'media/m2.jpg', createdAt: new Date('2026-07-30T00:00:00Z') });
      mediaRepo.findOrphanCleanupCandidates
        .mockImplementationOnce(async () => [older, newer])
        .mockImplementationOnce(async () => []);

      const summary = await sut.run({ dryRun: true });

      expect(storage.deleteObjectForCleanup).not.toHaveBeenCalled();
      expect(mediaRepo.softDeleteOrphanCandidate).not.toHaveBeenCalled();
      expect(audit.record).not.toHaveBeenCalled();
      expect(summary).toMatchObject({
        dryRun: true,
        scanned: 2,
        eligible: 2,
        oldestCandidateCreatedAt: older.createdAt,
        newestCandidateCreatedAt: newer.createdAt,
      });
      expect(summary.sampleCandidates).toEqual([
        { id: 'm1', objectKey: 'media/m1.jpg' },
        { id: 'm2', objectKey: 'media/m2.jpg' },
      ]);
    });

    it('không có ứng viên nào → tổng hợp toàn 0, không lỗi', async () => {
      mediaRepo.findOrphanCleanupCandidates.mockResolvedValueOnce([]);
      const summary = await sut.run({ dryRun: true });
      expect(summary).toMatchObject({ scanned: 0, eligible: 0, sampleCandidates: [] });
    });

    it('reuse cùng một truy vấn ứng viên như real run (không phân nhánh logic riêng)', async () => {
      mediaRepo.findOrphanCleanupCandidates.mockResolvedValueOnce([]);
      await sut.run({ dryRun: true, batchSize: 25 });
      expect(mediaRepo.findOrphanCleanupCandidates).toHaveBeenCalledWith(25);
    });
  });
});
