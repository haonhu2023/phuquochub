import { THROTTLER_LIMIT, THROTTLER_TTL } from '@nestjs/throttler/dist/throttler.constants';
import { AiRecommendationsController } from './ai-recommendations.controller';
import { PERMISSIONS_KEY } from '../authz/decorators/require-permissions.decorator';

// Controller mỏng — cùng khuôn ModerationController.spec.ts: ranh giới bảo mật kiểm chứng qua
// metadata của decorator.
type Handler = keyof AiRecommendationsController;

function handlerOf(name: Handler): object {
  return AiRecommendationsController.prototype[name] as unknown as object;
}

describe('AiRecommendationsController — ranh giới đặc quyền (M7)', () => {
  it('generate (POST) yêu cầu AI.ModerateMedia — KHÔNG quyền mới, tái dùng đúng permission đã seed cho ai_agent', () => {
    expect(Reflect.getMetadata(PERMISSIONS_KEY, handlerOf('generate'))).toEqual(['AI.ModerateMedia']);
  });

  it('getLatest (GET) yêu cầu Moderation.Queue.View — cùng quyền đọc hàng chờ đã có', () => {
    expect(Reflect.getMetadata(PERMISSIONS_KEY, handlerOf('getLatest'))).toEqual(['Moderation.Queue.View']);
  });

  it('generate giới hạn 60 request/phút (đặc quyền hơn đọc)', () => {
    const target = handlerOf('generate');
    expect(Reflect.getMetadata(THROTTLER_LIMIT + 'default', target)).toBe(60);
    expect(Reflect.getMetadata(THROTTLER_TTL + 'default', target)).toBe(60_000);
  });

  it('getLatest giới hạn 120 request/phút (cùng ngưỡng đọc hàng chờ)', () => {
    const target = handlerOf('getLatest');
    expect(Reflect.getMetadata(THROTTLER_LIMIT + 'default', target)).toBe(120);
    expect(Reflect.getMetadata(THROTTLER_TTL + 'default', target)).toBe(60_000);
  });
});
