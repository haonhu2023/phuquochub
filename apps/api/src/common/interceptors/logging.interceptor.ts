import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import type { Request } from 'express';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';

// Interceptor logging (architecture.md §5 common: "Interceptors (logging, cache, transform)").
// Ghi một dòng cho mỗi request HTTP: method, url, status, thời lượng (ms).
// KHÔNG log body/headers để tránh rò rỉ dữ liệu nhạy cảm (coding-standard §8);
// lỗi 5xx đã được AllExceptionsFilter log kèm stack, ở đây chỉ ghi vòng đời request.
@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') {
      return next.handle();
    }

    const http = context.switchToHttp();
    const req = http.getRequest<Request>();
    const { method, url } = req;
    const startedAt = Date.now();

    return next.handle().pipe(
      tap({
        next: () => this.write(method, url, http.getResponse<{ statusCode: number }>().statusCode, startedAt),
        // Lỗi: status thật do exception filter quyết định; ghi mốc thời gian để trace.
        error: () => this.write(method, url, 'ERR', startedAt),
      }),
    );
  }

  private write(method: string, url: string, status: number | string, startedAt: number): void {
    this.logger.log(`${method} ${url} → ${status} (${Date.now() - startedAt}ms)`);
  }
}
