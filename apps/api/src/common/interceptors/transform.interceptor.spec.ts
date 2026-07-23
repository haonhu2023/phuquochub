import { lastValueFrom, of } from 'rxjs';
import { CallHandler, ExecutionContext } from '@nestjs/common';
import { TransformInterceptor } from './transform.interceptor';

function makeContext(): ExecutionContext {
  return {} as ExecutionContext;
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
});
