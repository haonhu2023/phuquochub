/**
 * So sánh/băm JSON KHÔNG phụ thuộc thứ tự khoá.
 *
 * BẮT BUỘC: Postgres lưu `jsonb` với khoá đã chuẩn hoá (sắp xếp), nên giá trị đọc lên là
 * `{is_24h, regular{fri,mon,...}, timezone}` trong khi một manifest tay khai `{timezone, is_24h,
 * regular {mon,tue,...}}`. `JSON.stringify` nhạy thứ tự khoá ⇒ so sánh thô LUÔN khác nhau. Với
 * `verified-facts-ingestion.service.ts`, điều này từng làm mất tính idempotent (chạy lại ghi đè
 * `opening_hours` và sinh thêm một `wiki_revisions` + một `source_attributions` mới — quan sát
 * thấy thật: lần chạy thứ hai tạo revision #2 và attribution thứ 6). Với
 * `publish-manifest.contract.ts`, cùng hàm này giữ checksum ổn định bất kể manifest được viết tay
 * theo thứ tự khoá nào.
 *
 * DI CHUYỂN VỀ ĐÂY (2026-08-24, Slice 0.5B): trước đó hàm này nằm trong
 * `verified-facts-ingestion.service.ts`. `publish-manifest.contract.ts` cần dùng lại đúng hàm này
 * để tính checksum, và một runner sản xuất sau này (Slice 0.5E) nhiều khả năng sẽ khiến
 * `verified-facts-ingestion.service.ts` cần đọc TYPE từ `publish-manifest.contract.ts` (để nhận
 * một manifest đã duyệt làm input) — nếu vẫn giữ hàm trong service đó, hai file sẽ import CHÉO
 * nhau (contract → service để lấy `canonicalJson`, service → contract để lấy type manifest), tạo
 * circular import. Chuyển hàm THUẦN, KHÔNG phụ thuộc NestJS/DB/HTTP này ra `common/` cắt đứt vòng
 * lặp đó từ gốc — cùng chỗ với `pagination.ts`/`opening-hours.ts`/`geo-bounds.ts`, những hàm thuần
 * khác không thuộc riêng một module nghiệp vụ nào.
 *
 * Hành vi và output giữ NGUYÊN BYTE-FOR-BYTE so với bản gốc — chỉ đổi vị trí file.
 */
export function canonicalJson(value: unknown): string {
  const normalize = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(normalize);
    if (v !== null && typeof v === 'object') {
      return Object.keys(v as Record<string, unknown>)
        .sort()
        .reduce<Record<string, unknown>>((acc, k) => {
          acc[k] = normalize((v as Record<string, unknown>)[k]);
          return acc;
        }, {});
    }
    return v;
  };
  return JSON.stringify(normalize(value));
}
