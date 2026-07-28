import { Module } from '@nestjs/common';
import { AppConfigModule } from './core/config/config.module';
import { LoggerModule } from './core/logger/logger.module';
import { AuditModule } from './core/audit/audit.module';
import { DatabaseModule } from './core/database/database.module';
import { RedisModule } from './core/redis/redis.module';
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
import { EventsModule } from './modules/events/events.module';
import { SourcesModule } from './modules/sources/sources.module';
import { ReviewsModule } from './modules/reviews/reviews.module';

// Sprint 0: core+health. Sprint 1: auth/users/rbac/categories.
// Wave 1: media(entity)/contacts/prices/places/geo/search.
// Provenance: sources (source.md).
@Module({
  imports: [
    AppConfigModule,
    LoggerModule,
    AuditModule,
    DatabaseModule,
    RedisModule,
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
    EventsModule,
    SourcesModule,
    ReviewsModule,
  ],
})
export class AppModule {}
