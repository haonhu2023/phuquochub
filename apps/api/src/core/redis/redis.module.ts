import { Global, Module } from '@nestjs/common';
import { RedisService } from './redis.service';

// Global: các module khác inject RedisService mà không cần import lại.
@Global()
@Module({
  providers: [RedisService],
  exports: [RedisService],
})
export class RedisModule {}
