import type { ApiPaginated, PaginationMeta } from '@phuquochub/shared-types';

// Envelope phân trang chuẩn (khớp openapi Meta: page/limit/total). Có `success`
// nên TransformInterceptor sẽ trả nguyên (không bọc lại).
export function paginate<T>(items: T[], page: number, limit: number, total: number): ApiPaginated<T> & {
  success: true;
} {
  const meta: PaginationMeta = {
    timestamp: new Date().toISOString(),
    page,
    pageSize: limit,
    total,
    totalPages: limit > 0 ? Math.ceil(total / limit) : 0,
  };
  return { success: true, data: items, meta };
}

export function clampLimit(limit: number | undefined, def = 20, max = 100): number {
  if (!limit || limit < 1) return def;
  return Math.min(limit, max);
}

export function clampPage(page: number | undefined): number {
  if (!page || page < 1) return 1;
  return page;
}
