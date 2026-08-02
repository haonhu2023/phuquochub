import { NotFoundException } from '@nestjs/common';
import { ModerationService } from './moderation.service';
import { ModerationCasesRepository } from './repositories/moderation-cases.repository';
import { ReportsRepository } from './repositories/reports.repository';
import { ModerationCase } from './entities/moderation-case.entity';
import {
  ModerationCaseSeverity,
  ModerationCaseSource,
  ModerationCaseStatus,
  ModerationTargetType,
} from './moderation.enums';
import { createMock, LooseMock } from '../../../test/helpers/create-mock';

function makeCase(overrides: Partial<ModerationCase> = {}): ModerationCase {
  const c = new ModerationCase();
  c.id = 'c1';
  c.targetType = ModerationTargetType.MEDIA;
  c.targetId = 'm1';
  c.status = ModerationCaseStatus.OPEN;
  c.source = ModerationCaseSource.NEW_CONTENT;
  c.severity = ModerationCaseSeverity.LOW;
  c.priority = 0;
  c.reportCount = 0;
  c.assignedTo = null;
  c.claimedAt = null;
  c.decision = null;
  c.reason = null;
  c.resolvedBy = null;
  c.resolvedAt = null;
  c.aiScore = null;
  c.aiLabels = null;
  c.createdAt = new Date('2026-08-02T00:00:00Z');
  c.updatedAt = new Date('2026-08-02T00:00:00Z');
  return Object.assign(c, overrides);
}

describe('ModerationService', () => {
  let casesRepo: LooseMock<ModerationCasesRepository>;
  let reportsRepo: LooseMock<ReportsRepository>;
  let service: ModerationService;

  beforeEach(() => {
    casesRepo = createMock<ModerationCasesRepository>({
      list: jest.fn(),
      findById: jest.fn(),
      findTargetPreview: jest.fn(),
      createOpenCase: jest.fn(),
    });
    reportsRepo = createMock<ReportsRepository>({ findByCaseId: jest.fn() });
    service = new ModerationService(casesRepo, reportsRepo);
  });

  describe('list', () => {
    it('không truyền status -> mặc định lọc [open, claimed] (hàng chờ)', async () => {
      casesRepo.list.mockResolvedValue({ items: [], total: 0 });
      await service.list({});
      expect(casesRepo.list).toHaveBeenCalledWith(
        expect.objectContaining({ statuses: [ModerationCaseStatus.OPEN, ModerationCaseStatus.CLAIMED] }),
      );
    });

    it('truyền status tường minh -> lọc đúng MỘT giá trị đó (kể cả resolved, xem lịch sử)', async () => {
      casesRepo.list.mockResolvedValue({ items: [], total: 0 });
      await service.list({ status: ModerationCaseStatus.RESOLVED });
      expect(casesRepo.list).toHaveBeenCalledWith(
        expect.objectContaining({ statuses: [ModerationCaseStatus.RESOLVED] }),
      );
    });

    it('page/limit không truyền -> dùng mặc định clampPage/clampLimit (page=1, limit=20)', async () => {
      casesRepo.list.mockResolvedValue({ items: [], total: 0 });
      await service.list({});
      expect(casesRepo.list).toHaveBeenCalledWith(expect.objectContaining({ limit: 20, offset: 0 }));
    });

    it('page=3, limit=10 -> offset = (3-1)*10 = 20', async () => {
      casesRepo.list.mockResolvedValue({ items: [], total: 0 });
      await service.list({ page: 3, limit: 10 });
      expect(casesRepo.list).toHaveBeenCalledWith(expect.objectContaining({ limit: 10, offset: 20 }));
    });

    it('truyền đủ target_type/source/severity/assigned_to -> chuyển thẳng xuống repository', async () => {
      casesRepo.list.mockResolvedValue({ items: [], total: 0 });
      await service.list({
        target_type: ModerationTargetType.REVIEW,
        source: ModerationCaseSource.REPORT,
        severity: ModerationCaseSeverity.HIGH,
        assigned_to: 'mod-1',
      });
      expect(casesRepo.list).toHaveBeenCalledWith(
        expect.objectContaining({
          targetType: ModerationTargetType.REVIEW,
          source: ModerationCaseSource.REPORT,
          severity: ModerationCaseSeverity.HIGH,
          assignedTo: 'mod-1',
        }),
      );
    });

    it('map kết quả qua mapper và trả về envelope phân trang chuẩn (success/data/meta)', async () => {
      casesRepo.list.mockResolvedValue({ items: [makeCase()], total: 1 });
      const result = await service.list({});
      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(1);
      expect(result.data[0].id).toBe('c1');
      expect(result.meta.total).toBe(1);
      expect(result.meta.page).toBe(1);
      expect(result.meta.pageSize).toBe(20);
    });

    it('KHÔNG gọi bất kỳ method ghi nào (đọc thuần)', async () => {
      casesRepo.list.mockResolvedValue({ items: [], total: 0 });
      await service.list({});
      expect(casesRepo.createOpenCase).not.toHaveBeenCalled();
    });
  });

  describe('getById', () => {
    it('case không tồn tại -> NotFoundException, KHÔNG gọi reportsRepo/findTargetPreview', async () => {
      casesRepo.findById.mockResolvedValue(null);
      await expect(service.getById('missing')).rejects.toThrow(NotFoundException);
      expect(reportsRepo.findByCaseId).not.toHaveBeenCalled();
      expect(casesRepo.findTargetPreview).not.toHaveBeenCalled();
    });

    it('case tồn tại -> gộp case + reports + target preview', async () => {
      const found = makeCase();
      casesRepo.findById.mockResolvedValue(found);
      reportsRepo.findByCaseId.mockResolvedValue([]);
      casesRepo.findTargetPreview.mockResolvedValue({
        found: false,
        targetType: ModerationTargetType.MEDIA,
        targetId: 'm1',
      });

      const result = await service.getById('c1');

      expect(reportsRepo.findByCaseId).toHaveBeenCalledWith('c1');
      expect(casesRepo.findTargetPreview).toHaveBeenCalledWith(ModerationTargetType.MEDIA, 'm1');
      expect(result.id).toBe('c1');
      expect(result.reports).toEqual([]);
      expect(result.target_preview).toEqual({ found: false, target_type: 'media', target_id: 'm1' });
    });

    it('KHÔNG tự bọc {success,data} — để TransformInterceptor bọc (cùng quy ước mọi service khác)', async () => {
      const found = makeCase();
      casesRepo.findById.mockResolvedValue(found);
      reportsRepo.findByCaseId.mockResolvedValue([]);
      casesRepo.findTargetPreview.mockResolvedValue({
        found: false,
        targetType: ModerationTargetType.MEDIA,
        targetId: 'm1',
      });

      const result = await service.getById('c1');
      expect(result).not.toHaveProperty('success');
      expect(result).not.toHaveProperty('data');
    });
  });
});
