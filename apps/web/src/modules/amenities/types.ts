// Amenities (product spec, 2026-09-29) — dict dùng chung (place_amenities.place_id), KHÔNG phải
// khái niệm riêng của khách sạn. Khớp AmenitiesRepository (apps/api).
export interface Amenity {
  id: string;
  code: string;
  label_vi: string;
  label_en: string | null;
  icon: string | null;
  group: string | null;
}
