import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';

// PLACE-028 (OD2-12): giới hạn tần suất request toàn cục, in-memory (single-instance).
// Không dùng Redis storage — không có yêu cầu multi-instance hiện tại; giới hạn này được
// ghi nhận rõ ràng (xem docs/architecture/deployment.md).
@Module({
  imports: [
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        throttlers: [
          {
            ttl: (config.get<number>('rateLimit.ttl') ?? 60) * 1000,
            limit: config.get<number>('rateLimit.limit') ?? 100,
          },
        ],
      }),
    }),
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class RateLimitModule {}
