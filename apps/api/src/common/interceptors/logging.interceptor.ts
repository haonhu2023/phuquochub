import { CallHandler, ExecutionContext, Injectable, LoggerService, NestInterceptor } from '@nestjs/common';
import type { Request, Response } from 'express';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { AppLoggerService } from '../../core/logger/app-logger.service';
import { getCorrelationId } from '../middleware/correlation-id.middleware';

// Interceptor logging (architecture.md §5 common: "Interceptors (logging, cache, transform)").
// Ghi MỘT dòng có cấu trúc cho mỗi request HTTP: correlationId, method, path, status, thời lượng.
// KHÔNG log body/headers để tránh rò rỉ dữ liệu nhạy cảm (coding-standard §8);
// lỗi 5xx đã được AllExceptionsFilter log kèm stack, ở đây chỉ ghi vòng đời request.
//
// PLACE-030: dùng AppLoggerService thay vì Logger trần (hoàn thiện thiết kế logging tập trung đã
// có sẵn — TD-03). Tham số logger có default để KHÔNG phá vỡ các chỗ gọi `new LoggingInterceptor()`
// không đối số hiện có (main.ts truyền instance đã wire; nơi khác vẫn hoạt động như cũ).
@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  constructor(private readonly logger: LoggerService = new AppLoggerService().setContext('HTTP')) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') {
      return next.handle();
    }

    const http = context.switchToHttp();
    const req = http.getRequest<Request>();
    const { method, url } = req;
    const correlationId = getCorrelationId(req);
    const startedAt = Date.now();

    return next.handle().pipe(
      tap({
        next: () =>
          this.write(correlationId, method, url, http.getResponse<Response>().statusCode, startedAt),
        // Lỗi: status thật do exception filter quyết định; ghi mốc thời gian để trace.
        error: () => this.write(correlationId, method, url, 'ERR', startedAt),
      }),
    );
  }

  private write(
    correlationId: string,
    method: string,
    url: string,
    status: number | string,
    startedAt: number,
  ): void {
    this.logger.log({
      correlationId,
      method,
      path: url,
      statusCode: status,
      durationMs: Date.now() - startedAt,
    });
  }
}
