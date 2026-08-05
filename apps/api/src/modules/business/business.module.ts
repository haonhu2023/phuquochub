import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BusinessClaim } from './entities/business-claim.entity';
import { BusinessMember } from './entities/business-member.entity';
import { BusinessClaimsRepository } from './repositories/business-claims.repository';
import { BusinessMembersRepository } from './repositories/business-members.repository';
import { BusinessClaimsService } from './business-claims.service';
import { BusinessClaimsController } from './business-claims.controller';
import { PlacesModule } from '../places/places.module';
import { RbacModule } from '../rbac/rbac.module';

// ADR-015 Claim Decision Workflow — module ĐẦU TIÊN của ADR-015 trong repo này (không có M1/M2
// trước đó). `PlacesModule` cấp `PlacesRepository` (đọc place khi submit + ghi verification cache
// khi approve, cùng transaction). `RbacModule` cấp `RolesRepository`/`UserRolesRepository` (gán
// `business_owner` khi approve). Cả hai đều KHÔNG import ngược BusinessModule — một chiều, không
// vòng lặp, cùng tiền lệ `ModerationModule` import `PlacesModule`/`RbacModule`.
@Module({
  imports: [TypeOrmModule.forFeature([BusinessClaim, BusinessMember]), PlacesModule, RbacModule],
  controllers: [BusinessClaimsController],
  providers: [BusinessClaimsRepository, BusinessMembersRepository, BusinessClaimsService],
  exports: [BusinessClaimsRepository, BusinessMembersRepository],
})
export class BusinessModule {}
