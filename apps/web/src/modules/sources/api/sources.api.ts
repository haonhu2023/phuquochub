import { apiPost } from '@/lib/http';

// Tái dùng `sources` đã có (POST /sources, Source.Create — content_owner đã có quyền này) — KHÔNG
// dựng hệ nguồn thứ hai cho "hạng sao có nguồn"/các trường có nguồn của beach.
export interface CreateSourceInput {
  type: string;
  kind: string;
  title?: string;
  url?: string;
}

export interface Source {
  id: string;
  type: string;
  kind: string;
  title: string | null;
  url: string | null;
}

export async function createSource(payload: CreateSourceInput, accessToken: string): Promise<Source> {
  return apiPost<Source>('/sources', accessToken, payload);
}
