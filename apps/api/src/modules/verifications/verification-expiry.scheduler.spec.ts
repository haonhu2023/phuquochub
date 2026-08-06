import { ConfigService } from '@nestjs/config';
import { SchedulerRegistry } from '@nestjs/schedule';
import { VerificationExpiryScheduler, VERIFICATION_EXPIRY_CRON_JOB_NAME } from './verification-expiry.scheduler';
import { VerificationsService, type VerificationExpirySummary } from './verifications.service';
import { createMock, LooseMock } from '../../../test/helpers/create-mock';

function makeSummary(overrides: Partial<VerificationExpirySummary> = {}): VerificationExpirySummary {
  return {
    dryRun: false,
    scanned: 0,
    eligible: 0,
    expired: 0,
    conflicts: 0,
    errors: 0,
    batchesRun: 0,
    timeBudgetExceeded: false,
    oldestProcessedExpiresAt: null,
    newestProcessedExpiresAt: null,
    durationMs: 0,
    ...overrides,
  };
}

describe('VerificationExpiryScheduler (VERIFICATION SCHEDULER — Operational Enablement)', () => {
  let verificationsService: LooseMock<VerificationsService>;
  let config: LooseMock<ConfigService>;
  let schedulerRegistry: LooseMock<SchedulerRegistry>;
  let scheduler: VerificationExpiryScheduler;
  let configValues: Record<string, unknown>;

  beforeEach(() => {
    configValues = {
      'verificationExpiry.scheduleEnabled': false,
      'verificationExpiry.cron': '0 */15 * * * *',
      'verificationExpiry.batchSize': 100,
      'verificationExpiry.maxBatches': 50,
      'verificationExpiry.maxExecutionMs': 300000,
    };
    verificationsService = createMock<VerificationsService>({ expireOverdue: jest.fn() });
    config = createMock<ConfigService>({
      get: jest.fn((key: string) => configValues[key]),
    });
    schedulerRegistry = createMock<SchedulerRegistry>({
      addCronJob: jest.fn(),
      deleteCronJob: jest.fn(),
      doesExist: jest.fn().mockReturnValue(false),
    });
    scheduler = new VerificationExpiryScheduler(verificationsService, config, schedulerRegistry);
  });

  describe('onModuleInit — bật/tắt lịch', () => {
    it('scheduleEnabled=false (mặc định) -> KHÔNG đăng ký cron job nào', () => {
      scheduler.onModuleInit();
      expect(schedulerRegistry.addCronJob).not.toHaveBeenCalled();
    });

    it('scheduleEnabled=true -> đăng ký ĐÚNG MỘT cron job, đã start, đúng tên/biểu thức cấu hình', () => {
      configValues['verificationExpiry.scheduleEnabled'] = true;
      configValues['verificationExpiry.cron'] = '0 */5 * * * *';

      scheduler.onModuleInit();

      expect(schedulerRegistry.addCronJob).toHaveBeenCalledTimes(1);
      const [name, job] = schedulerRegistry.addCronJob.mock.calls[0];
      expect(name).toBe(VERIFICATION_EXPIRY_CRON_JOB_NAME);
      expect(job.isActive).toBe(true); // job.start() đã được gọi
      expect(job.cronTime.source).toBe('0 */5 * * * *');

      job.stop(); // dọn timer thật trước khi test kết thúc
    });
  });

  describe('onModuleDestroy', () => {
    it('cron job đang tồn tại -> xoá khỏi registry', () => {
      schedulerRegistry.doesExist.mockReturnValue(true);
      scheduler.onModuleDestroy();
      expect(schedulerRegistry.deleteCronJob).toHaveBeenCalledWith(VERIFICATION_EXPIRY_CRON_JOB_NAME);
    });

    it('cron job KHÔNG tồn tại (lịch chưa từng bật) -> KHÔNG gọi deleteCronJob (tránh lỗi registry)', () => {
      schedulerRegistry.doesExist.mockReturnValue(false);
      scheduler.onModuleDestroy();
      expect(schedulerRegistry.deleteCronJob).not.toHaveBeenCalled();
    });
  });

  describe('runTick — chống chạy chồng + giải phóng khoá', () => {
    it('gọi expireOverdue ĐÚNG MỘT lần với options từ config', async () => {
      verificationsService.expireOverdue.mockResolvedValue(makeSummary({ expired: 3 }));
      const result = await scheduler.runTick();

      expect(verificationsService.expireOverdue).toHaveBeenCalledTimes(1);
      expect(verificationsService.expireOverdue).toHaveBeenCalledWith({
        batchSize: 100,
        maxBatches: 50,
        maxExecutionMs: 300000,
      });
      expect(result?.expired).toBe(3);
    });

    it('lần chạy TRƯỚC vẫn đang xử lý -> lần gọi chồng lên bị BỎ QUA (trả null), KHÔNG gọi expireOverdue lần hai', async () => {
      let resolveFirst!: (s: VerificationExpirySummary) => void;
      verificationsService.expireOverdue.mockReturnValue(
        new Promise((resolve) => {
          resolveFirst = resolve;
        }),
      );

      const firstRun = scheduler.runTick(); // chưa resolve — "đang chạy"
      const overlappingRun = await scheduler.runTick(); // phải bị bỏ qua NGAY, không chờ firstRun

      expect(overlappingRun).toBeNull();
      expect(verificationsService.expireOverdue).toHaveBeenCalledTimes(1); // KHÔNG gọi lần hai

      resolveFirst(makeSummary());
      await firstRun;
    });

    it('khoá được GIẢI PHÓNG sau khi chạy THÀNH CÔNG -> lần gọi kế tiếp chạy bình thường (không còn bị coi là chồng)', async () => {
      verificationsService.expireOverdue.mockResolvedValue(makeSummary());
      await scheduler.runTick();
      await scheduler.runTick();
      expect(verificationsService.expireOverdue).toHaveBeenCalledTimes(2);
    });

    it('khoá được GIẢI PHÓNG sau khi expireOverdue THROW -> lần gọi kế tiếp vẫn chạy được (không kẹt khoá vĩnh viễn)', async () => {
      verificationsService.expireOverdue.mockRejectedValueOnce(new Error('sự cố kết nối DB'));
      verificationsService.expireOverdue.mockResolvedValueOnce(makeSummary({ expired: 1 }));

      const firstResult = await scheduler.runTick();
      expect(firstResult).toBeNull(); // lỗi hệ thống -> null, KHÔNG throw ra ngoài (callback lập lịch nền)

      const secondResult = await scheduler.runTick();
      expect(secondResult?.expired).toBe(1);
      expect(verificationsService.expireOverdue).toHaveBeenCalledTimes(2);
    });

    it('lỗi hệ thống -> được LOG (không âm thầm nuốt)', async () => {
      const loggerErrorSpy = jest.spyOn((scheduler as unknown as { logger: { error: jest.Mock } }).logger, 'error');
      verificationsService.expireOverdue.mockRejectedValue(new Error('sự cố kết nối DB'));

      await scheduler.runTick();

      expect(loggerErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('sự cố kết nối DB'),
        expect.any(String),
      );
    });

    it('bị bỏ qua do chạy chồng -> được LOG mức WARN (không phải lỗi)', async () => {
      const loggerWarnSpy = jest.spyOn((scheduler as unknown as { logger: { warn: jest.Mock } }).logger, 'warn');
      let resolveFirst!: (s: VerificationExpirySummary) => void;
      verificationsService.expireOverdue.mockReturnValue(
        new Promise((resolve) => {
          resolveFirst = resolve;
        }),
      );

      const firstRun = scheduler.runTick();
      await scheduler.runTick();

      expect(loggerWarnSpy).toHaveBeenCalledWith(expect.stringContaining('BỎ QUA'));

      resolveFirst(makeSummary());
      await firstRun;
    });
  });
});
