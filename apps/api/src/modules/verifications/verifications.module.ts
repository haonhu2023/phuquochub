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
@Module({
  imports: [
    TypeOrmModule.forFeature([Verification, VerificationEvent, VerificationVote]),
    PlacesModule,
    ContactsModule,
    PricesModule,
    SourcesModule,
  ],
  controllers: [VerificationsController],
  providers: [VerificationsRepository, VerificationEventsRepository, VerificationVotesRepository, VerificationsService],
  exports: [VerificationsRepository, VerificationsService],
})
export class VerificationsModule {}
