import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SchedulerRegistry } from '@nestjs/schedule';
import { CronJob } from 'cron';
import { VerificationsService } from './verifications.service';
import type { VerificationExpirySummary } from './verifications.service';

export const VERIFICATION_EXPIRY_CRON_JOB_NAME = 'verification-expiry';

/**
 * VERIFICATION SCHEDULER — Operational Enablement (2026-08-06, ADR-008). Đăng ký MỘT cron job
 * ĐỘNG (không dùng `@Cron()` tĩnh — biểu thức cron đến từ `ConfigService`, chỉ có SAU khi DI đã
 * dựng xong, không có ở thời điểm decorate class) gọi định kỳ
 * `VerificationsService.expireOverdue()` — KHÔNG một state machine/logic hết hạn thứ hai, chỉ bọc
 * lịch chạy + chống chạy chồng quanh phương thức đã có.
 *
 * Chống chạy chồng: CHỈ trong-tiến-trình (`isRunning` — biến instance, KHÔNG global mutable state
 * kiểu module-level, sống/chết theo vòng đời request-scope... thực ra `VerificationExpirySchedulerService`
 * là singleton (Nest mặc định), nên CHÍNH XÁC là "một cờ mutable duy nhất cho MỘT tiến trình API",
 * đúng yêu cầu Phase 4 "at minimum, prevent concurrent runs within the same API process"). KHÔNG
 * phát minh khoá phân tán (Redis) — repo CHƯA có tiền lệ khoá phân tán nào đã kiểm chứng; nhiều
 * replica API cùng bật lịch là mối lo triển khai CẦN xử lý riêng (ghi rõ ở tài liệu vận hành), tài
 * liệu hoá KHÔNG âm thầm giả định.
 */
@Injectable()
export class VerificationExpiryScheduler implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(VerificationExpiryScheduler.name);

  // Cờ chống chạy chồng — TRONG TIẾN TRÌNH NÀY. `false` = có thể chạy; `true` = một lần chạy khác
  // đang xử lý. KHÔNG static/module-level — sống theo instance (singleton, xem chú thích lớp).
  private isRunning = false;

  constructor(
    private readonly verificationsService: VerificationsService,
    private readonly config: ConfigService,
    private readonly schedulerRegistry: SchedulerRegistry,
  ) {}

  onModuleInit(): void {
    const enabled = this.config.get<boolean>('verificationExpiry.scheduleEnabled') ?? false;
    if (!enabled) {
      this.logger.log(
        'Verification expiry schedule: TẮT (VERIFICATION_EXPIRY_SCHEDULE_ENABLED=false hoặc chưa đặt) — ' +
          'đặt =true để bật. Job vẫn dùng được thủ công qua manual runner (npm run verification:expire).',
      );
      return;
    }

    const cronExpression = this.config.get<string>('verificationExpiry.cron') ?? '0 */15 * * * *';
    const job = CronJob.from({
      cronTime: cronExpression,
      onTick: () => {
        // KHÔNG await ở đây — `onTick` của thư viện `cron` không chờ Promise trả về theo mặc định
        // (trừ khi `waitForCompletion=true`, KHÔNG dùng ở đây vì chính `isRunning` đã đóng vai trò
        // chống chạy chồng một cách tường minh, dễ test hơn dựa vào hành vi nội bộ thư viện).
        void this.runTick();
      },
      start: false,
      timeZone: 'UTC',
      // Timer nền KHÔNG tự giữ tiến trình sống một mình — server đã có HTTP listener giữ event
      // loop; giúp test/CLI ngắn hạn thoát sạch, không cần `job.stop()` tường minh.
      unrefTimeout: true,
    });

    this.schedulerRegistry.addCronJob(VERIFICATION_EXPIRY_CRON_JOB_NAME, job);
    job.start();
    this.logger.log(`Verification expiry schedule: BẬT — cron="${cronExpression}" (UTC).`);
  }

  onModuleDestroy(): void {
    if (this.schedulerRegistry.doesExist('cron', VERIFICATION_EXPIRY_CRON_JOB_NAME)) {
      this.schedulerRegistry.deleteCronJob(VERIFICATION_EXPIRY_CRON_JOB_NAME);
    }
  }

  /**
   * Một lần "tick" của lịch. `null` = bị bỏ qua (chạy chồng — KHÔNG phải lỗi, chỉ log WARN) hoặc
   * lỗi hệ thống (đã log ERROR đầy đủ, KHÔNG throw ra ngoài — đây là callback của thư viện cron,
   * không có nơi nào "phía trên" để bắt một promise reject). Cờ `isRunning` LUÔN được giải phóng ở
   * `finally`, kể cả khi `expireOverdue()` throw.
   */
  async runTick(): Promise<VerificationExpirySummary | null> {
    if (this.isRunning) {
      this.logger.warn(
        'Verification expiry: BỎ QUA lần chạy này — lần chạy TRƯỚC vẫn đang xử lý ' +
          '(chống chạy chồng trong tiến trình, KHÔNG phải lỗi).',
      );
      return null;
    }

    this.isRunning = true;
    try {
      const options = {
        batchSize: this.config.get<number>('verificationExpiry.batchSize'),
        maxBatches: this.config.get<number>('verificationExpiry.maxBatches'),
        maxExecutionMs: this.config.get<number>('verificationExpiry.maxExecutionMs'),
      };
      return await this.verificationsService.expireOverdue(options);
    } catch (err) {
      // Lỗi hệ thống KHÔNG lường trước ở TẦNG job (khác lỗi từng dòng — đã được
      // `expireOverdue()` tự bắt và đếm vào `summary.errors`). Log ĐẦY ĐỦ (không âm thầm nuốt) —
      // KHÔNG throw tiếp vì đây là callback lập lịch nền, không có caller nào chờ promise này.
      this.logger.error(
        `Verification expiry: lỗi hệ thống khi chạy lịch — ${(err as Error).message}`,
        (err as Error).stack,
      );
      return null;
    } finally {
      this.isRunning = false;
    }
  }
}
