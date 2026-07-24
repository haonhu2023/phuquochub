import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import type { Request } from 'express';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import type { ApiSuccess } from '@phuquochub/shared-types';
import { getCorrelationId } from '../middleware/correlation-id.middleware';

// Bọc mọi response thành envelope { data, meta } (khớp openapi.yaml).
// Nếu handler đã trả về đúng dạng { data, meta } thì không bọc lại (tránh lồng).
// PLACE-030: meta.requestId hoàn thiện trường ApiMeta.requestId vốn đã khai báo trong
// shared-types/openapi.yaml nhưng chưa từng được điền — cùng correlation ID với header response.
@Injectable()
export class TransformInterceptor<T> implements NestInterceptor<T, ApiSuccess<T>> {
  intercept(context: ExecutionContext, next: CallHandler<T>): Observable<ApiSuccess<T>> {
    const correlationId =
      context.getType() === 'http'
        ? getCorrelationId(context.switchToHttp().getRequest<Request>())
        : 'unknown';

    return next.handle().pipe(
      map((payload): ApiSuccess<T> => {
        if (
          payload &&
          typeof payload === 'object' &&
          'success' in payload &&
          'data' in payload
        ) {
          return payload as unknown as ApiSuccess<T>;
        }
        return {
          success: true,
          data: payload,
          meta: { timestamp: new Date().toISOString(), requestId: correlationId },
        };
      }),
    );
  }
}
