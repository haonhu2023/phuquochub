import { Global, Module } from '@nestjs/common';
import { CacheInvalidationService } from './cache-invalidation.service';

// @Global() — same convention as core/media-url, core/storage: any module writing place data
// needs this without a per-module import.
@Global()
@Module({
  providers: [CacheInvalidationService],
  exports: [CacheInvalidationService],
})
export class CacheInvalidationModule {}
