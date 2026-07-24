import { Controller, Get, INestApplication, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { SkipThrottle, ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import request from 'supertest';

// Kiểm tra cơ chế ThrottlerGuard bằng limit thấp có chủ đích (deterministic, không phụ thuộc
// DB/Redis) — độc lập với giá trị mặc định production (RATE_LIMIT_LIMIT=100).
@Controller('probe')
class ProbeController {
  @Get('limited')
  limited() {
    return { ok: true };
  }

  @SkipThrottle()
  @Get('exempt')
  exempt() {
    return { ok: true };
  }
}

@Module({
  imports: [ThrottlerModule.forRoot({ throttlers: [{ ttl: 60_000, limit: 3 }] })],
  controllers: [ProbeController],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
class ProbeModule {}

describe('RateLimitModule (ThrottlerGuard mechanism)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [ProbeModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('cho phép request trong giới hạn (limit=3) và trả 429 khi vượt quá', async () => {
    for (let i = 0; i < 3; i += 1) {
      const res = await request(app.getHttpServer()).get('/probe/limited');
      expect(res.status).toBe(200);
    }
    const blocked = await request(app.getHttpServer()).get('/probe/limited');
    expect(blocked.status).toBe(429);
  });

  it('endpoint @SkipThrottle() không bao giờ bị giới hạn', async () => {
    for (let i = 0; i < 5; i += 1) {
      const res = await request(app.getHttpServer()).get('/probe/exempt');
      expect(res.status).toBe(200);
    }
  });
});
