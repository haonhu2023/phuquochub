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
import { PlacesModule } from '../places/places.module';
import { RbacModule } from '../rbac/rbac.module';
import { UsersModule } from '../users/users.module';

// ADR-015 Claim Decision Workflow + Business Manager Assignment/Revocation — `PlacesModule` cấp
// `PlacesRepository` (đọc place khi submit + ghi verification cache khi approve claim, cùng
// transaction). `RbacModule` cấp `RolesRepository`/`UserRolesRepository` (gán/thu hồi
// `business_owner`/`business_manager`). `UsersModule` cấp `UsersRepository` (xác nhận target user
// tồn tại khi gán manager — Business Manager milestone). Cả ba đều KHÔNG import ngược
// BusinessModule — một chiều, không vòng lặp, cùng tiền lệ `ModerationModule`.
@Module({
  imports: [
    TypeOrmModule.forFeature([BusinessClaim, BusinessMember]),
    PlacesModule,
    RbacModule,
    UsersModule,
  ],
  controllers: [BusinessClaimsController, BusinessManagersController],
  providers: [
    BusinessClaimsRepository,
    BusinessMembersRepository,
    BusinessClaimsService,
    BusinessManagersService,
  ],
  exports: [BusinessClaimsRepository, BusinessMembersRepository],
})
export class BusinessModule {}
