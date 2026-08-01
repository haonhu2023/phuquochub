import { Global, Module } from '@nestjs/common';
import { StorageService } from './storage.service';

// Global — same convention as core/redis: any module needing object storage (currently only
// media) injects StorageService directly, no per-module import required.
@Global()
@Module({
  providers: [StorageService],
  exports: [StorageService],
})
export class StorageModule {}
