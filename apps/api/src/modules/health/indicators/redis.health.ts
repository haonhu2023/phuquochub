import { Injectable } from '@nestjs/common';
import { HealthCheckError, HealthIndicator, HealthIndicatorResult } from '@nestjs/terminus';
import { RedisService } from '../../../core/redis/redis.service';

// Health indicator cho Redis: PING phải trả 'PONG'.
@Injectable()
export class RedisHealthIndicator extends HealthIndicator {
  constructor(private readonly redis: RedisService) {
    super();
  }

  async isHealthy(key: string): Promise<HealthIndicatorResult> {
    try {
      const pong = await this.redis.ping();
      const isUp = pong === 'PONG';
      const result = this.getStatus(key, isUp, { response: pong });
      if (isUp) {
        return result;
      }
      throw new HealthCheckError('Redis ping failed', result);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'unknown error';
      throw new HealthCheckError(
        'Redis check failed',
        this.getStatus(key, false, { message }),
      );
    }
  }
}
