import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PlaceExternalIdentifier } from './entities/place-external-identifier.entity';
import { PlaceExternalIdentifiersRepository } from './repositories/place-external-identifiers.repository';
import { PlaceExternalIdentifiersService } from './place-external-identifiers.service';
import { PlaceExternalIdentifiersController } from './place-external-identifiers.controller';

// Controller thêm 2026-10-16 (gói "mở đúng hồ sơ Google Maps", Track A) — dashboard đọc/ghi Google
// Place ID theo record qua đây. Guard của route (Place.Edit.Managed + AuthorizationContext) là
// APP_GUARD toàn cục (auth.module.ts) nên module này KHÔNG cần import RbacModule chỉ để guard hoạt
// động — exports vẫn giữ PlaceExternalIdentifiersService cho job remediation/import cũ VÀ cho
// PlacesModule (đọc google_place_id đủ điều kiện ở buildDetailResponse — xem places.module.ts).
@Module({
  imports: [TypeOrmModule.forFeature([PlaceExternalIdentifier])],
  controllers: [PlaceExternalIdentifiersController],
  providers: [PlaceExternalIdentifiersRepository, PlaceExternalIdentifiersService],
  exports: [PlaceExternalIdentifiersService],
})
export class PlaceExternalIdentifiersModule {}
