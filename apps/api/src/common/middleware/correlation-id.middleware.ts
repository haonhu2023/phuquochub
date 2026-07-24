import { randomUUID } from 'crypto';
import type { NextFunction, Request, Response } from 'express';

// PLACE-030: không có quy ước header correlation-ID nào tồn tại sẵn trong repo (grep-verified) —
// X-Request-Id được chọn vì là tên header thực tế phổ biến nhất (Heroku/AWS ALB/GitHub...).
export const CORRELATION_ID_HEADER = 'X-Request-Id';

// Charset an toàn cho ID đến từ client: chữ/số + dấu phân cách thông dụng, giới hạn độ dài.
// Giá trị không khớp sẽ bị bỏ qua (sinh ID mới) để tránh log/header injection từ input client.
const VALID_CORRELATION_ID = /^[A-Za-z0-9._-]{1,128}$/;

export interface RequestWithCorrelationId extends Request {
  correlationId: string;
}

/**
 * Middleware gắn correlation ID cho MỖI request. Trạng thái nằm trên chính object `req`
 * (mỗi request có object riêng của Express/Node) — KHÔNG dùng biến module-level nào,
 * nên không có rủi ro state toàn cục bị ghi đè giữa các request đồng thời.
 */
export function correlationIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  const incoming = req.header(CORRELATION_ID_HEADER);
  const correlationId = incoming && VALID_CORRELATION_ID.test(incoming) ? incoming : randomUUID();
  (req as RequestWithCorrelationId).correlationId = correlationId;
  res.setHeader(CORRELATION_ID_HEADER, correlationId);
  next();
}

/**
 * Đọc correlation ID đã gắn bởi correlationIdMiddleware. Middleware này được đăng ký global
 * (app.use, trước mọi guard/interceptor) nên trong request thực tế luôn có giá trị; fallback
 * 'unknown' chỉ dùng khi một test/hook không wire middleware (không phải hành vi production).
 */
export function getCorrelationId(req: Request): string {
  return (req as RequestWithCorrelationId).correlationId ?? 'unknown';
}
