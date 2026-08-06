import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Verification } from './entities/verification.entity';
import { VerificationEvent } from './entities/verification-event.entity';
import { VerificationVote } from './entities/verification-vote.entity';
import { VerificationsRepository } from './repositories/verifications.repository';
import { VerificationEventsRepository } from './repositories/verification-events.repository';
import { VerificationVotesRepository } from './repositories/verification-votes.repository';
import { VerificationsService } from './verifications.service';
import { VerificationsController } from './verifications.controller';
import { VerificationExpiryScheduler } from './verification-expiry.scheduler';
import { PlacesModule } from '../places/places.module';
import { ContactsModule } from '../contacts/contacts.module';
import { PricesModule } from '../prices/prices.module';
import { SourcesModule } from '../sources/sources.module';

// ADR-008 Verification Foundation. `PlacesModule`/`ContactsModule`/`PricesModule` cấp
// `PlacesRepository.updateScalars()`/`ContactsRepository.updateScalars()`/
// `PricesRepository.updateScalars()` (đồng bộ cache `verification_status`/`verified_at` trên ĐÚNG
// entity đích, exclusive arc). `SourcesModule` cấp `SourcesRepository` (xác nhận `source_id` tồn
// tại + đúng nhóm chính thức khi đặt `official`). Cả bốn đều KHÔNG import ngược
// `VerificationsModule` — một chiều, không vòng lặp, cùng tiền lệ `BusinessModule`.
//
// VERIFICATION SCHEDULER — Operational Enablement (2026-08-06): `VerificationExpiryScheduler` đăng
// ký ở ĐÂY (không phải AppModule) — chỉ `VerificationsModule` mới biết `VerificationsService`.
// `ScheduleModule.forRoot()` chỉ đăng ký MỘT LẦN ở AppModule (yêu cầu "một cơ chế lập lịch duy
// nhất"); `SchedulerRegistry` mà scheduler này cần đến từ đó, KHÔNG import lại `ScheduleModule` ở
// đây (Nest cung cấp `SchedulerRegistry` toàn cục sau khi `forRoot()` chạy).
@Module({
  imports: [
    TypeOrmModule.forFeature([Verification, VerificationEvent, VerificationVote]),
    PlacesModule,
    ContactsModule,
    PricesModule,
    SourcesModule,
  ],
  controllers: [VerificationsController],
  providers: [
    VerificationsRepository,
    VerificationEventsRepository,
    VerificationVotesRepository,
    VerificationsService,
    VerificationExpiryScheduler,
  ],
  exports: [VerificationsRepository, VerificationsService],
})
export class VerificationsModule {}
