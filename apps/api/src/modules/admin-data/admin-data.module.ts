import { Module } from '@nestjs/common';
import { PlacesModule } from '../places/places.module';
import { RevisionsModule } from '../revisions/revisions.module';
import { SourcesModule } from '../sources/sources.module';
import { VerificationsModule } from '../verifications/verifications.module';
import { AdministrativeBackfillService } from './administrative-backfill.service';

// Administrative Data Backfill (2026-08-18). KHÔNG có controller — chạy qua script CLI
// (`src/scripts/backfill-administrative-data.ts`, cùng khuôn `verification:expire`/
// `operator:bootstrap`: `NestFactory.createApplicationContext()`, không mở HTTP, không đăng ký
// cron). `PlacesModule` cấp `PlacesRepository`/`PlacesService` (đọc + PATCH qua đúng luồng
// revision-tracked). `RevisionsModule` cấp `RevisionsService` (đọc lại revision vừa tạo — xem chú
// thích ở `administrative-backfill.service.ts` vì sao không sửa chữ ký `PlacesService.update()`).
// `SourcesModule` cấp `SourcesRepository`/`SourceAttributionsRepository` (nguồn dùng chung + trích
// dẫn cấp field/revision). `VerificationsModule` cấp `VerificationsService`
// (`ensureOfficialFromClaim()`, tái dùng cho method=SOURCE_MATCH thay vì OWNER_CLAIM).
@Module({
  imports: [PlacesModule, RevisionsModule, SourcesModule, VerificationsModule],
  providers: [AdministrativeBackfillService],
  exports: [AdministrativeBackfillService],
})
export class AdminDataModule {}
