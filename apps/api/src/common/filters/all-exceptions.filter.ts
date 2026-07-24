import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  LoggerService,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import type { ApiErrorBody } from '@phuquochub/shared-types';
import { AppLoggerService } from '../../core/logger/app-logger.service';
import { getCorrelationId } from '../middleware/correlation-id.middleware';

// Chuẩn hóa mọi lỗi thành envelope { error, meta }. Map HttpException → code ổn định.
// PLACE-030: dùng AppLoggerService (tham số có default, không phá vỡ các chỗ gọi
// `new AllExceptionsFilter()` không đối số hiện có trong các file e2e-spec); mọi log lỗi 5xx
// và meta.requestId của response đều mang cùng correlation ID với response header.
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  constructor(
    private readonly logger: LoggerService = new AppLoggerService().setContext(
      AllExceptionsFilter.name,
    ),
  ) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const correlationId = getCorrelationId(request);

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let code = 'INTERNAL_SERVER_ERROR';
    let message = 'Đã xảy ra lỗi không mong muốn';
    let details: unknown;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const res = exception.getResponse();
      if (typeof res === 'string') {
        message = res;
      } else if (res && typeof res === 'object') {
        const r = res as Record<string, unknown>;
        const rawMessage = r.message;
        if (Array.isArray(rawMessage)) {
          // ValidationPipe: mảng thông điệp → details = array of objects (openapi ErrorEnvelope).
          message = 'Dữ liệu không hợp lệ';
          details = rawMessage.map((m) => (typeof m === 'string' ? { message: m } : m));
        } else if (typeof rawMessage === 'string') {
          message = rawMessage;
        }
      }
      code = this.statusToCode(status);
    } else if (exception instanceof Error) {
      message = exception.message;
    }

    // Chỉ log lỗi không mong đợi (>=500) — lỗi nghiệp vụ (400/401/403/404/429...) đã có ý nghĩa
    // tự thân, log ở đây sẽ tạo nhiễu không kiểm soát được (giữ nguyên hành vi trước PLACE-030).
    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(
        {
          correlationId,
          method: request.method,
          path: request.url,
          statusCode: status,
          errorType: exception instanceof Error ? exception.constructor.name : typeof exception,
          message,
        },
        exception instanceof Error ? exception.stack : undefined,
      );
    }

    const body: ApiErrorBody = {
      success: false,
      error: { code, message, details },
      meta: { timestamp: new Date().toISOString(), requestId: correlationId },
    };
    response.status(status).json(body);
  }

  private statusToCode(status: number): string {
    const map: Record<number, string> = {
      400: 'VALIDATION_ERROR',
      401: 'UNAUTHORIZED',
      403: 'FORBIDDEN',
      404: 'NOT_FOUND',
      409: 'CONFLICT',
      422: 'UNPROCESSABLE_ENTITY',
      429: 'TOO_MANY_REQUESTS',
      503: 'SERVICE_UNAVAILABLE',
    };
    return map[status] ?? 'ERROR';
  }
}
