import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PlacesModule } from '../places/places.module';
import { RevisionsModule } from '../revisions/revisions.module';
import { SourcesModule } from '../sources/sources.module';
import { VerificationsModule } from '../verifications/verifications.module';
import { ContactsModule } from '../contacts/contacts.module';
import { PricesModule } from '../prices/prices.module';
import { MediaModule } from '../media/media.module';
import { ReviewsModule } from '../reviews/reviews.module';
import { BusinessModule } from '../business/business.module';
import { PlaceSeo } from '../places/entities/place-seo.entity';
import { PlaceAiSummary } from '../places/entities/place-ai-summary.entity';
import { AdministrativeBackfillService } from './administrative-backfill.service';
import { DataQualityAuditService } from './data-quality-audit.service';

// Administrative Data Backfill (2026-08-18). KHÔNG có controller — chạy qua script CLI
// (`src/scripts/backfill-administrative-data.ts`, cùng khuôn `verification:expire`/
// `operator:bootstrap`: `NestFactory.createApplicationContext()`, không mở HTTP, không đăng ký
// cron). `PlacesModule` cấp `PlacesRepository`/`PlacesService` (đọc + PATCH qua đúng luồng
// revision-tracked). `RevisionsModule` cấp `RevisionsService` (đọc lại revision vừa tạo — xem chú
// thích ở `administrative-backfill.service.ts` vì sao không sửa chữ ký `PlacesService.update()`).
// `SourcesModule` cấp `SourcesRepository`/`SourceAttributionsRepository` (nguồn dùng chung + trích
// dẫn cấp field/revision). `VerificationsModule` cấp `VerificationsService`
// (`ensureOfficialFromClaim()`, tái dùng cho method=SOURCE_MATCH thay vì OWNER_CLAIM).
//
// Data Quality Audit (2026-08-20) — CÙNG module (script CLI, không controller, chỉ ĐỌC — xem class
// doc DataQualityAuditService). `ContactsModule`/`PricesModule`/`MediaModule`/`ReviewsModule`/
// `BusinessModule` thêm mới cho audit này: không module nào trong năm module đó import ngược
// AdminDataModule (đã kiểm — không vòng lặp, cùng tiền lệ bốn module gốc). `PlaceSeo`/
// `PlaceAiSummary` chưa có repository wrapper riêng ở đâu trong repo (chưa ai đọc hai bảng này) —
// đăng ký `TypeOrmModule.forFeature` ngay tại đây thay vì thêm một repository class chỉ để
// `findOne()` một dòng; nếu sau này có consumer thứ hai, tách repository lúc đó.
@Module({
  imports: [
    PlacesModule,
    RevisionsModule,
    SourcesModule,
    VerificationsModule,
    ContactsModule,
    PricesModule,
    MediaModule,
    ReviewsModule,
    BusinessModule,
    TypeOrmModule.forFeature([PlaceSeo, PlaceAiSummary]),
  ],
  providers: [AdministrativeBackfillService, DataQualityAuditService],
  exports: [AdministrativeBackfillService, DataQualityAuditService],
})
export class AdminDataModule {}
