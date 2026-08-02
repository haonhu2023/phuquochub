import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ModerationCase } from './entities/moderation-case.entity';
import { Report } from './entities/report.entity';
import { ModerationCasesRepository } from './repositories/moderation-cases.repository';
import { ReportsRepository } from './repositories/reports.repository';
import { ModerationService } from './moderation.service';
import { ModerationController } from './moderation.controller';

// Moderation Foundation. M1 (ADR-018): entities + repositories. M2 (Queue Read API) adds the
// service + controller below — read-only, no decision/report endpoints (those are M3-M5). Case
// và report là hai bảng của MỘT miền — một module cho cả hai, đúng cách BookingsModule gộp
// Booking+BookingItem, không tạo module riêng cho từng milestone.
@Module({
  imports: [TypeOrmModule.forFeature([ModerationCase, Report])],
  controllers: [ModerationController],
  providers: [ModerationCasesRepository, ReportsRepository, ModerationService],
  exports: [ModerationCasesRepository, ReportsRepository],
})
export class ModerationModule {}
