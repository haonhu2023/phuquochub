// Envelope chuẩn cho REST API (khớp api/openapi.yaml — data/meta/error).

export interface ApiMeta {
  /** ISO timestamp phía server khi tạo response. */
  timestamp: string;
  /** Mã định danh request (trace/correlation) nếu có. */
  requestId?: string;
  [key: string]: unknown;
}

export interface ApiSuccess<T> {
  /** Discriminator envelope (khớp openapi.yaml SuccessEnvelope). */
  success: true;
  data: T;
  meta: ApiMeta;
}

export interface ApiErrorBody {
  /** Discriminator envelope (khớp openapi.yaml ErrorEnvelope). */
  success: false;
  error: {
    /** Mã lỗi ổn định (vd VALIDATION_ERROR, UNAUTHORIZED). */
    code: string;
    /** Thông điệp cho người/dev đọc. */
    message: string;
    /** Chi tiết theo trường (validation) nếu có. */
    details?: unknown;
  };
  meta: ApiMeta;
}

export interface PaginationMeta extends ApiMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface ApiPaginated<T> {
  data: T[];
  meta: PaginationMeta;
}
