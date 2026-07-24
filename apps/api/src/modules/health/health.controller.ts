import { Controller, Get } from '@nestjs/common';
import {
  HealthCheck,
  HealthCheckService,
  TypeOrmHealthIndicator,
} from '@nestjs/terminus';
import { SkipThrottle } from '@nestjs/throttler';
import { RedisHealthIndicator } from './indicators/redis.health';
import { Public } from '../authz/decorators/public.decorator';

// GET /api/health — kiểm tra DB (Postgres) + Redis. Trả 200 nếu tất cả 'up',
// 503 nếu có thành phần 'down'. Dùng cho readiness/liveness probe.
// @SkipThrottle: probe được gọi lặp lại thường xuyên bởi container orchestrator — không giới hạn.
@Public()
@SkipThrottle()
@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly db: TypeOrmHealthIndicator,
    private readonly redis: RedisHealthIndicator,
  ) {}

  @Get()
  @HealthCheck()
  check() {
    return this.health.check([
      () => this.db.pingCheck('database', { timeout: 3000 }),
      () => this.redis.isHealthy('redis'),
    ]);
  }
}
