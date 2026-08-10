import { apiGet } from '@/lib/http';
import type { PlaceCard } from '@/modules/places/types';

// Marker bản đồ: cụm (nhiều điểm) hoặc một địa điểm — khớp GeoService.bbox (BE).
export type BboxMarker =
  | { type: 'cluster'; count: number; lng: number; lat: number }
  | { type: 'place'; id: string; slug: string; title: string; lng: number; lat: number };

export interface BboxParams {
  minLng: number;
  minLat: number;
  maxLng: number;
  maxLat: number;
  zoom: number;
  category?: string;
  ward?: string;
}

export async function nearby(
  lat: number,
  lng: number,
  radius?: number,
  category?: string,
): Promise<PlaceCard[]> {
  const qs = new URLSearchParams({ lat: String(lat), lng: String(lng) });
  if (radius) qs.set('radius', String(radius));
  if (category) qs.set('category', category);
  return apiGet<PlaceCard[]>(`/geo/nearby?${qs.toString()}`);
}

export async function bbox(p: BboxParams): Promise<BboxMarker[]> {
  const qs = new URLSearchParams({
    minLng: String(p.minLng),
    minLat: String(p.minLat),
    maxLng: String(p.maxLng),
    maxLat: String(p.maxLat),
    zoom: String(p.zoom),
  });
  if (p.category) qs.set('category', p.category);
  if (p.ward) qs.set('ward', p.ward);
  return apiGet<BboxMarker[]>(`/geo/bbox?${qs.toString()}`);
}
