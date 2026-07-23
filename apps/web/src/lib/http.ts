import { buildApiUrl } from './api';

// Envelope chuẩn của API ({ success, data, meta } | { success, error }).
interface Envelope<T> {
  success: boolean;
  data: T;
  error?: { code?: string; message: string };
}

// Lỗi API có mang theo HTTP status + mã lỗi ổn định (NOT_FOUND, VALIDATION_ERROR…).
// Kế thừa Error nên mọi `catch` cũ (đọc `.message`) vẫn hoạt động; thêm `status`
// để phân biệt "không tìm thấy" (404) với lỗi server/mạng.
export class ApiError extends Error {
  readonly status: number;
  readonly code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }

  get isNotFound(): boolean {
    return this.status === 404;
  }
}

// GET công khai (không auth) — unwrap envelope, ném ApiError nếu thất bại.
export async function apiGet<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(buildApiUrl(path), {
    ...init,
    headers: { Accept: 'application/json', ...(init?.headers ?? {}) },
  });

  // Body có thể không phải JSON (proxy lỗi, 502…) — không để res.json() ném lỗi trần.
  let body: Envelope<T> | undefined;
  try {
    body = (await res.json()) as Envelope<T>;
  } catch {
    body = undefined;
  }

  if (!res.ok || !body || body.success === false) {
    const message = body?.error?.message ?? `Yêu cầu thất bại (${res.status})`;
    throw new ApiError(message, res.status, body?.error?.code);
  }

  return body.data;
}
