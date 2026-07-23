import type { PlaceCard } from '@phuquochub/shared-types';
import { PlaceCardRow, PlaceDetailRow } from './repositories/places.repository';

// Shape response openapi PlaceCard (snake_case) — nay khai báo MỘT LẦN ở
// @phuquochub/shared-types (GAP-11), dùng chung với apps/web thay vì mỗi bên tự định nghĩa.
// Re-export để mọi importer hiện có của './places.mapper' giữ nguyên đường dẫn.
export type { PlaceCard };

// Map row phẳng (snake_case DB) → response snake_case (khớp openapi PlaceCard).
export function toPlaceCard(row: PlaceCardRow): PlaceCard {
  const card: PlaceCard = {
    id: row.id,
    name: row.name,
    slug: row.slug,
    category_id: row.category_id,
    short_description: row.short_description,
    price_range: row.price_range,
    cover_image_url: row.cover_image_url,
    rating_avg: row.rating_avg !== null ? Number(row.rating_avg) : null,
    rating_count: row.rating_count,
    verification_status: row.verification_status,
    status: row.status,
    location: { lat: Number(row.lat), lng: Number(row.lng) },
  };
  if (row.distance_m !== undefined && row.distance_m !== null) {
    card.distance_m = Number(row.distance_m);
  }
  // F-17/OD-F-17: KHÔNG ánh xạ `row.score` sang card. Điểm ts_rank là tín hiệu xếp hạng NỘI BỘ
  // (SearchService đọc thẳng row cho hợp đồng SearchResult riêng); công bố một con số chưa định
  // nghĩa được thang đo/khoảng giá trị/tính ổn định ra hợp đồng công khai là KHÔNG được duyệt.
  // Nhánh cũ vốn không bao giờ chạy: không caller nào của toPlaceCard truyền row có score.
  return card;
}

// Map row chi tiết → phần scalar của openapi Place (mảng contacts/prices/media/faqs
// do service ghép). osm_id bigint (string) → number (id OSM < 2^53, an toàn).
export function toPlaceDetail(row: PlaceDetailRow) {
  return {
    ...toPlaceCard(row),
    address: row.address,
    ward: row.ward,
    description: row.description,
    opening_hours: row.opening_hours ?? null,
    osm_id: row.osm_id !== null && row.osm_id !== undefined ? Number(row.osm_id) : null,
    // F-19: kiểu trên dây (shared-types PlaceDetail) khai created_at/updated_at là CHUỖI ISO —
    // JSON không có kiểu Date. Trả thẳng Date thì payload vẫn đúng (JSON.stringify(Date) sinh
    // đúng chuỗi ISO-8601 đó), nhưng kiểu trả về của mapper lại không gán được cho chính kiểu
    // mô tả response của nó. Chuyển tường minh ở đây: JSON phát ra KHÔNG đổi một byte nào,
    // còn ranh giới thì hết nói dối.
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
  };
}
