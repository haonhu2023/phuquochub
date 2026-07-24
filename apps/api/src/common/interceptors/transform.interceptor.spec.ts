import { lastValueFrom, of } from 'rxjs';
import { CallHandler, ExecutionContext } from '@nestjs/common';
import { TransformInterceptor } from './transform.interceptor';
import type { RequestWithCorrelationId } from '../middleware/correlation-id.middleware';

function makeContext(correlationId?: string): ExecutionContext {
  const req = correlationId ? { correlationId } : {};
  return {
    getType: () => 'http',
    switchToHttp: () => ({ getRequest: () => req as RequestWithCorrelationId }),
  } as unknown as ExecutionContext;
}

function makeHandler<T>(value: T): CallHandler<T> {
  return { handle: () => of(value) };
}

describe('TransformInterceptor', () => {
  const interceptor = new TransformInterceptor();

  it('bọc payload thô thành { success, data, meta }', async () => {
    const result = await lastValueFrom(
      interceptor.intercept(makeContext(), makeHandler({ id: 1, name: 'Bãi Sao' })),
    );
    expect(result.success).toBe(true);
    expect(result.data).toEqual({ id: 1, name: 'Bãi Sao' });
    expect(typeof result.meta.timestamp).toBe('string');
  });

  it('không bọc lại nếu đã đúng dạng envelope (có success)', async () => {
    const envelope = { success: true as const, data: [1, 2, 3], meta: { timestamp: 'x' } };
    const result = await lastValueFrom(
      interceptor.intercept(makeContext(), makeHandler(envelope)),
    );
    expect(result).toBe(envelope);
  });

  it('bọc được giá trị nguyên thủy', async () => {
    const result = await lastValueFrom(
      interceptor.intercept(makeContext(), makeHandler('pong')),
    );
    expect(result.success).toBe(true);
    expect(result.data).toBe('pong');
  });

  // PLACE-030: meta.requestId hoàn thiện trường ApiMeta.requestId (khớp header X-Request-Id).
  it('điền meta.requestId từ correlation ID của request', async () => {
    const result = await lastValueFrom(
      interceptor.intercept(makeContext('corr-abc-123'), makeHandler({ id: 1 })),
    );
    expect(result.meta.requestId).toBe('corr-abc-123');
  });

  it('meta.requestId là "unknown" khi request không có correlation ID (không throw)', async () => {
    const result = await lastValueFrom(
      interceptor.intercept(makeContext(), makeHandler({ id: 1 })),
    );
    expect(result.meta.requestId).toBe('unknown');
  });
});
