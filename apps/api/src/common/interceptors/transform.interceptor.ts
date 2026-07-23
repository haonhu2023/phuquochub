import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import type { ApiSuccess } from '@phuquochub/shared-types';

// Bọc mọi response thành envelope { data, meta } (khớp openapi.yaml).
// Nếu handler đã trả về đúng dạng { data, meta } thì không bọc lại (tránh lồng).
@Injectable()
export class TransformInterceptor<T> implements NestInterceptor<T, ApiSuccess<T>> {
  intercept(context: ExecutionContext, next: CallHandler<T>): Observable<ApiSuccess<T>> {
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
          meta: { timestamp: new Date().toISOString() },
        };
      }),
    );
  }
}
