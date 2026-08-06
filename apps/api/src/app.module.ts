import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { AppConfigModule } from './core/config/config.module';
import { LoggerModule } from './core/logger/logger.module';
import { AuditModule } from './core/audit/audit.module';
import { DatabaseModule } from './core/database/database.module';
import { RedisModule } from './core/redis/redis.module';
import { StorageModule } from './core/storage/storage.module';
import { RateLimitModule } from './core/rate-limit/rate-limit.module';
import { HealthModule } from './modules/health/health.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { RbacModule } from './modules/rbac/rbac.module';
import { CategoriesModule } from './modules/categories/categories.module';
import { MediaModule } from './modules/media/media.module';
import { ContactsModule } from './modules/contacts/contacts.module';
import { PricesModule } from './modules/prices/prices.module';
import { PlacesModule } from './modules/places/places.module';
import { GeoModule } from './modules/geo/geo.module';
import { SearchModule } from './modules/search/search.module';
import { HotelsModule } from './modules/hotels/hotels.module';
import { RestaurantsModule } from './modules/restaurants/restaurants.module';
import { ToursModule } from './modules/tours/tours.module';
import { AttractionsModule } from './modules/attractions/attractions.module';
import { BeachesModule } from './modules/beaches/beaches.module';
import { TransportsModule } from './modules/transports/transports.module';
import { EventsModule } from './modules/events/events.module';
import { SourcesModule } from './modules/sources/sources.module';
import { ReviewsModule } from './modules/reviews/reviews.module';
import { BookingsModule } from './modules/bookings/bookings.module';
import { AvailabilityModule } from './modules/availability/availability.module';
import { ModerationModule } from './modules/moderation/moderation.module';
import { BusinessModule } from './modules/business/business.module';
import { VerificationsModule } from './modules/verifications/verifications.module';

// Sprint 0: core+health. Sprint 1: auth/users/rbac/categories.
// Wave 1: media(entity)/contacts/prices/places/geo/search.
// Provenance: sources (source.md).
//
// VERIFICATION SCHEDULER — Operational Enablement (2026-08-06). `ScheduleModule.forRoot()` — MỘT
// cơ chế lập lịch DUY NHẤT cho toàn app (yêu cầu tường minh), đăng ký Ở ĐÂY một lần, KHÔNG lặp lại
// ở module con nào. `VerificationExpirySchedulerService` (trong `VerificationsModule`) tự đăng ký
// động (SchedulerRegistry) MỘT cron job khi module khởi tạo, CHỈ khi cấu hình bật — xem
// `verificationExpiry.scheduleEnabled` (configuration.ts).
@Module({
  imports: [
    ScheduleModule.forRoot(),
    AppConfigModule,
    LoggerModule,
    AuditModule,
    DatabaseModule,
    RedisModule,
    StorageModule,
    RateLimitModule,
    HealthModule,
    AuthModule,
    UsersModule,
    RbacModule,
    CategoriesModule,
    MediaModule,
    ContactsModule,
    PricesModule,
    PlacesModule,
    GeoModule,
    SearchModule,
    HotelsModule,
    RestaurantsModule,
    ToursModule,
    AttractionsModule,
    BeachesModule,
    TransportsModule,
    EventsModule,
    SourcesModule,
    ReviewsModule,
    AvailabilityModule,
    BookingsModule,
    ModerationModule,
    BusinessModule,
    VerificationsModule,
  ],
})
export class AppModule {}
