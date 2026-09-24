import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PlaceEditSuggestion } from './entities/place-edit-suggestion.entity';
import { PlaceSuggestionsRepository } from './place-suggestions.repository';
import { PlaceSuggestionsService } from './place-suggestions.service';
import { PlaceSuggestionsController } from './place-suggestions.controller';
import { PlacesModule } from '../places/places.module';
import { RbacModule } from '../rbac/rbac.module';

// "Báo thông tin sai / Đề xuất chỉnh sửa" — bản tối thiểu (2026-09-24, Ưu tiên 3). PlacesModule:
// PlacesRepository (chụp currentValue lúc gửi). RbacModule: AuthorizationService (khoanh vùng
// resolve theo place). AuditModule là @Global() — AuditService không cần import.
@Module({
  imports: [TypeOrmModule.forFeature([PlaceEditSuggestion]), PlacesModule, RbacModule],
  controllers: [PlaceSuggestionsController],
  providers: [PlaceSuggestionsRepository, PlaceSuggestionsService],
  exports: [PlaceSuggestionsService],
})
export class PlaceSuggestionsModule {}
