import type { APIRequestContext } from '@playwright/test';
import { API_BASE_URL } from './auth';

// T1 (2026-09-22) — tạo địa điểm thật qua API thật (nhanh, ổn định) để các spec KHÔNG phải lái
// lại form tạo địa điểm ở mọi nơi cần "một địa điểm có sẵn" — place-lifecycle.spec.ts là nơi DUY
// NHẤT lái form tạo qua UI (đúng luồng người dùng thật §16 yêu cầu).
export interface CreatedPlace {
  id: string;
  slug: string;
  status: string;
  content_version: number;
}

export async function firstCategoryId(request: APIRequestContext): Promise<string> {
  const res = await request.get(`${API_BASE_URL}/categories`);
  if (!res.ok()) throw new Error(`[e2e] GET /categories thất bại (${res.status()})`);
  const body = await res.json();
  const first = Array.isArray(body.data) ? body.data[0] : undefined;
  if (!first?.id) throw new Error('[e2e] Không có category nào trên DB dev local — không tạo được địa điểm.');
  return first.id;
}

export async function createPlace(
  request: APIRequestContext,
  accessToken: string,
  overrides: { name: string },
): Promise<CreatedPlace> {
  const categoryId = await firstCategoryId(request);
  const res = await request.post(`${API_BASE_URL}/places`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    data: {
      name: overrides.name,
      category_id: categoryId,
      location: { lat: 10.22, lng: 103.96 },
    },
  });
  if (!res.ok()) {
    throw new Error(`[e2e] POST /places thất bại (${res.status()}): ${await res.text()}`);
  }
  const body = await res.json();
  return body.data;
}
