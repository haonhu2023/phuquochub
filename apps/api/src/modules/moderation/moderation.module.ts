import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ModerationCase } from './entities/moderation-case.entity';
import { Report } from './entities/report.entity';
import { ModerationCasesRepository } from './repositories/moderation-cases.repository';
import { ReportsRepository } from './repositories/reports.repository';

// Moderation Foundation, M1 (ADR-018) — CHỈ entities + repositories, KHÔNG controller/service.
// Hàng chờ đọc (M2), quyết định media/review (M3/M4), report (M5) đều thêm vào module này ở các
// milestone sau — không tạo module riêng cho từng milestone (case/report là hai bảng của MỘT
// miền, đúng cách BookingsModule gộp Booking+BookingItem).
@Module({
  imports: [TypeOrmModule.forFeature([ModerationCase, Report])],
  providers: [ModerationCasesRepository, ReportsRepository],
  exports: [ModerationCasesRepository, ReportsRepository],
})
export class ModerationModule {}
