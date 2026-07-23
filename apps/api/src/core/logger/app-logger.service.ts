import { Injectable, Logger, LoggerService, Scope } from '@nestjs/common';

// Logging tập trung (architecture.md §5 `core/logger/`). Bọc Logger có sẵn của NestJS
// thay vì thêm thư viện mới — giữ nguyên kiến trúc đã chốt (không drift).
//
// Vì sao có lớp bọc: (1) một điểm duy nhất để sau này đổi transport/format (JSON,
// tập trung ELK) mà không sửa call-site; (2) ép chuẩn "không log dữ liệu nhạy cảm"
// (coding-standard §5, §8) qua danh sách khóa bị che (redact).

/** Các khóa nhạy cảm bị che khi log object (coding-standard §8: không lộ secret/PII). */
const REDACTED_KEYS = new Set([
  'password',
  'passwordHash',
  'accessToken',
  'refreshToken',
  'token',
  'authorization',
  'secret',
]);

const REDACTED = '[REDACTED]';

/**
 * Service logging tiêm được. `Scope.TRANSIENT` để mỗi consumer nhận một instance
 * và tự đặt context riêng (giống cách Logger của Nest gắn tên class).
 */
@Injectable({ scope: Scope.TRANSIENT })
export class AppLoggerService implements LoggerService {
  private readonly delegate = new Logger();
  private context?: string;

  /** Gắn context (thường là tên class) cho mọi dòng log tiếp theo. */
  setContext(context: string): this {
    this.context = context;
    return this;
  }

  log(message: unknown, context?: string): void {
    this.delegate.log(this.format(message), context ?? this.context);
  }

  error(message: unknown, trace?: string, context?: string): void {
    this.delegate.error(this.format(message), trace, context ?? this.context);
  }

  warn(message: unknown, context?: string): void {
    this.delegate.warn(this.format(message), context ?? this.context);
  }

  debug(message: unknown, context?: string): void {
    this.delegate.debug(this.format(message), context ?? this.context);
  }

  verbose(message: unknown, context?: string): void {
    this.delegate.verbose(this.format(message), context ?? this.context);
  }

  /** Chuẩn hóa message: object → JSON đã che khóa nhạy cảm; còn lại giữ nguyên. */
  private format(message: unknown): string {
    if (message && typeof message === 'object') {
      return JSON.stringify(this.redact(message as Record<string, unknown>));
    }
    return String(message);
  }

  /** Che (đệ quy nông) các khóa nhạy cảm để không rò rỉ secret/PII vào log. */
  redact(input: Record<string, unknown>): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(input)) {
      if (REDACTED_KEYS.has(key)) {
        out[key] = REDACTED;
      } else if (value && typeof value === 'object' && !Array.isArray(value)) {
        out[key] = this.redact(value as Record<string, unknown>);
      } else {
        out[key] = value;
      }
    }
    return out;
  }
}
