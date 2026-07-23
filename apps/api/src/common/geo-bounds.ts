/**
 * Hộp giới hạn địa lý Phú Quốc — TÍN HIỆU CẢNH BÁO cho toạ độ Place (KHÔNG còn là cổng từ chối).
 *
 * SSOT yêu cầu toạ độ phải nằm trong **bao Phú Quốc**:
 *   - docs/api/api.md §11 (:184) — "tọa độ trong Phú Quốc"
 *   - docs/product/modules/place.md:102 — "tọa độ phải nằm trong **bao Phú Quốc** (validation biên)"
 *   - docs/architecture/search.md:107, docs/workflow/contribution.md:97
 *
 * ⚠️ PROVISIONAL — CHƯA có hằng số biên chính thức trong tài liệu. Các giá trị dưới đây được
 * **suy ra từ dữ liệu seed thật** (1720000900000-SeedInitialPlaces / 1720001600000-SeedPlacesExpansion:
 * lng ≈ 103.85–104.05, lat ≈ 10.02–10.33) cộng biên đệm ~0.15–0.3° để bao trọn đảo chính, quần đảo
 * An Thới và vùng ven biển. Đây **không** phải biên cuối cùng.
 *
 * → Cần CHỦ SỞ HỮU xác nhận hộp giới hạn chính thức (PLACE-002 open_question / stop_condition #1).
 *   Khi có biên chính thức, chỉ cần cập nhật 4 hằng số bên dưới.
 *
 * ⚖️ QUYẾT ĐỊNH OD-F-1 (F1-C, phê duyệt 2026-07-23 — docs/delivery/decisions/OWNER-DECISION-F-1.md):
 * hộp này KHÔNG được dùng để TỪ CHỐI dữ liệu nữa. Toạ độ ngoài hộp vẫn được chấp nhận và chỉ
 * sinh một TÍN HIỆU kiểm toán được (structured log ở tầng service). Lý do: giá trị dưới đây là
 * suy ra, chưa có nguồn thẩm quyền, nên chặn cứng theo nó có thể loại bỏ dữ liệu hợp lệ (ví dụ
 * quần đảo Thổ Chu thuộc TP. Phú Quốc nằm ngoài cả 4 cận). Toạ độ SAI TOÀN CẦU (|lat|>90,
 * |lng|>180, NaN) vẫn bị từ chối — bởi @Min/@Max/@IsNumber ở DTO, không phải bởi hộp này.
 */
export const PHU_QUOC_BOUNDS = {
  minLat: 9.7,
  maxLat: 10.6,
  minLng: 103.7,
  maxLng: 104.2,
} as const;

/** true nếu vĩ độ (lat) nằm trong bao Phú Quốc (biên PROVISIONAL). */
export function isLatInPhuQuoc(value: number): boolean {
  return (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    value >= PHU_QUOC_BOUNDS.minLat &&
    value <= PHU_QUOC_BOUNDS.maxLat
  );
}

/** true nếu kinh độ (lng) nằm trong bao Phú Quốc (biên PROVISIONAL). */
export function isLngInPhuQuoc(value: number): boolean {
  return (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    value >= PHU_QUOC_BOUNDS.minLng &&
    value <= PHU_QUOC_BOUNDS.maxLng
  );
}

/** Một trường toạ độ nằm NGOÀI hộp PROVISIONAL — dữ liệu cho tín hiệu kiểm toán. */
export interface OutOfProvisionalBounds {
  field: 'lat' | 'lng';
  value: number;
  bounds: readonly [number, number];
}

/**
 * Liệt kê các trường của một điểm nằm NGOÀI hộp PROVISIONAL.
 *
 * Trả về mảng RỖNG khi điểm nằm trong hộp ⇒ caller không phát tín hiệu (đường đi phổ biến).
 * KHÔNG ném lỗi, KHÔNG từ chối: theo OD-F-1 đây là hàm quan sát, không phải cổng chặn.
 * Giá trị không hữu hạn (NaN/Infinity) được coi là NGOÀI hộp, nhưng chúng đã bị @IsNumber/
 * @Min/@Max chặn từ DTO nên thực tế không tới được đây.
 */
export function outOfProvisionalBounds(point: { lat: number; lng: number }): OutOfProvisionalBounds[] {
  const outside: OutOfProvisionalBounds[] = [];
  if (!isLatInPhuQuoc(point.lat)) {
    outside.push({ field: 'lat', value: point.lat, bounds: [PHU_QUOC_BOUNDS.minLat, PHU_QUOC_BOUNDS.maxLat] });
  }
  if (!isLngInPhuQuoc(point.lng)) {
    outside.push({ field: 'lng', value: point.lng, bounds: [PHU_QUOC_BOUNDS.minLng, PHU_QUOC_BOUNDS.maxLng] });
  }
  return outside;
}
