import { apiGet } from '@/lib/http';
import type { PlaceCard, PlaceDetail } from '../types';

export interface ListPlacesParams {
  category?: string;
  ward?: string;
  price_range?: string;
  page?: number;
  limit?: number;
}

export async function listPlaces(params: ListPlacesParams = {}): Promise<PlaceCard[]> {
  const qs = new URLSearchParams();
  if (params.category) qs.set('category', params.category);
  if (params.ward) qs.set('ward', params.ward);
  if (params.price_range) qs.set('price_range', params.price_range);
  if (params.page) qs.set('page', String(params.page));
  if (params.limit) qs.set('limit', String(params.limit));
  const q = qs.toString();
  return apiGet<PlaceCard[]>(`/places${q ? `?${q}` : ''}`, { cache: 'no-store' });
}

export async function getPlace(slug: string): Promise<PlaceDetail> {
  return apiGet<PlaceDetail>(`/places/${encodeURIComponent(slug)}`, { cache: 'no-store' });
}
