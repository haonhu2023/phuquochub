import { buildApiUrl } from './api';
import type { PaginationMeta } from '@phuquochub/shared-types';

// Envelope chuẩn của API ({ success, data, meta } | { success, error, meta }).
interface Envelope<T> {
  success: boolean;
  data: T;
  meta?: Record<string, unknown>;
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

  get isConflict(): boolean {
    return this.status === 409;
  }
}

// Gọi fetch + bóc envelope; dùng chung cho GET công khai và POST có xác thực bên dưới. Body có
// thể không phải JSON (proxy lỗi, 502…) — không để res.json() ném lỗi trần.
async function fetchEnvelope<T>(path: string, init: RequestInit): Promise<Envelope<T>> {
  const res = await fetch(buildApiUrl(path), init);

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

  return body;
}

// GET công khai (không auth) — unwrap envelope, ném ApiError nếu thất bại.
export async function apiGet<T>(path: string, init?: RequestInit): Promise<T> {
  const body = await fetchEnvelope<T>(path, {
    ...init,
    headers: { Accept: 'application/json', ...(init?.headers ?? {}) },
  });
  return body.data;
}

// GET công khai có phân trang — giữ lại `meta` (page/pageSize/total/totalPages) thay vì bỏ như
// apiGet, cho các trang browse cần render điều khiển phân trang thật (không chỉ danh sách phẳng).
export async function apiGetPaginated<T>(
  path: string,
  init?: RequestInit,
): Promise<{ data: T[]; meta: PaginationMeta }> {
  const body = await fetchEnvelope<T[]>(path, {
    ...init,
    headers: { Accept: 'application/json', ...(init?.headers ?? {}) },
  });
  return { data: body.data, meta: body.meta as PaginationMeta };
}

// POST có xác thực (Bearer) — dùng cho các luồng ghi đầu tiên của FE (reviews, và các module
// ghi sau này). Cùng envelope + lỗi với apiGet nên component xử lý ApiError thống nhất một chỗ.
export async function apiPost<T>(path: string, accessToken: string, payload?: unknown): Promise<T> {
  const body = await fetchEnvelope<T>(path, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: payload !== undefined ? JSON.stringify(payload) : undefined,
  });
  return body.data;
}
