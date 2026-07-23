import { Test } from '@nestjs/testing';
import { HealthCheckService, TypeOrmHealthIndicator } from '@nestjs/terminus';
import { HealthController } from './health.controller';
import { RedisHealthIndicator } from './indicators/redis.health';

describe('HealthController', () => {
  let controller: HealthController;
  const healthCheck = jest.fn();

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        { provide: HealthCheckService, useValue: { check: healthCheck } },
        { provide: TypeOrmHealthIndicator, useValue: { pingCheck: jest.fn() } },
        { provide: RedisHealthIndicator, useValue: { isHealthy: jest.fn() } },
      ],
    }).compile();

    controller = moduleRef.get(HealthController);
  });

  afterEach(() => jest.clearAllMocks());

  it('được định nghĩa', () => {
    expect(controller).toBeDefined();
  });

  it('gọi HealthCheckService.check với 2 indicator (db + redis)', async () => {
    healthCheck.mockResolvedValue({ status: 'ok' });
    const result = await controller.check();
    expect(result).toEqual({ status: 'ok' });
    expect(healthCheck).toHaveBeenCalledTimes(1);
    const indicators = healthCheck.mock.calls[0][0];
    expect(Array.isArray(indicators)).toBe(true);
    expect(indicators).toHaveLength(2);
  });
});
