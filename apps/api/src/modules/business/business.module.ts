import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BusinessClaim } from './entities/business-claim.entity';
import { BusinessMember } from './entities/business-member.entity';
import { BusinessClaimsRepository } from './repositories/business-claims.repository';
import { BusinessMembersRepository } from './repositories/business-members.repository';
import { BusinessClaimsService } from './business-claims.service';
import { BusinessClaimsController } from './business-claims.controller';
import { BusinessManagersService } from './business-managers.service';
import { BusinessManagersController } from './business-managers.controller';
import { BusinessTransferService } from './business-transfer.service';
import { BusinessTransferController } from './business-transfer.controller';
import { PlacesModule } from '../places/places.module';
import { RbacModule } from '../rbac/rbac.module';
import { UsersModule } from '../users/users.module';
import { VerificationsModule } from '../verifications/verifications.module';
import { SourcesModule } from '../sources/sources.module';

// ADR-015 Claim Decision Workflow + Business Manager Assignment/Revocation + Business Ownership
// Transfer — `PlacesModule` cấp `PlacesRepository` (đọc place khi submit). `RbacModule` cấp
// `RolesRepository`/`UserRolesRepository` (gán/thu hồi `business_owner`/`business_manager`).
// `UsersModule` cấp `UsersRepository` (xác nhận target user tồn tại khi gán manager/transfer).
// CLAIM -> SOURCE -> VERIFICATION INTEGRATION (2026-08-06): `VerificationsModule` cấp
// `VerificationsService` (`ensureOfficialFromClaim()` — đưa place tới `official` khi approve claim,
// nguồn sự thật DUY NHẤT của `places.verification_status`/`verifiedAt` từ nay), `SourcesModule` cấp
// `SourcesRepository` (tạo `sources` type=business_owner cho mỗi claim approve). Một chiều:
// `VerificationsModule`/`SourcesModule` KHÔNG import ngược BusinessModule — không vòng lặp, cùng
// tiền lệ `ModerationModule`.
@Module({
  imports: [
    TypeOrmModule.forFeature([BusinessClaim, BusinessMember]),
    PlacesModule,
    RbacModule,
    UsersModule,
    VerificationsModule,
    SourcesModule,
  ],
  controllers: [BusinessClaimsController, BusinessManagersController, BusinessTransferController],
  providers: [
    BusinessClaimsRepository,
    BusinessMembersRepository,
    BusinessClaimsService,
    BusinessManagersService,
    BusinessTransferService,
  ],
  exports: [BusinessClaimsRepository, BusinessMembersRepository],
})
export class BusinessModule {}
