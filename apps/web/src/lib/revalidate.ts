// C1 (2026-09-22, hardened same day) — gọi SAU KHI một mutation ghi công khai đã thành công (không
// phải trước, không phải "chắc là thành công" — mọi call site phải await mutation trước rồi mới gọi
// hàm này). Đánh thẳng vào route nội bộ `app/api/revalidate/route.ts` của CHÍNH web app (không phải
// API backend).
//
// Đây là đường FAST-PATH UX cho dashboard, KHÔNG phải đảm bảo tính đúng đắn duy nhất — đảm bảo thật
// (bao gồm cả những caller không đi qua web client, ví dụ gọi API trực tiếp) nằm ở
// `CacheInvalidationService` phía API (`apps/api/src/core/cache-invalidation/`), tự gọi route này
// SAU KHI write-boundary của PlacesService commit thành công. Client gọi thêm ở đây chỉ để owner
// thấy trang công khai đổi ngay, không phải chờ round-trip của API-side call.
//
// Không còn gửi tag thô — route tự tính tag từ `{entityType, slug}` (server-side, không tin client
// đưa tag tuỳ ý). Thất bại ở đây KHÔNG được làm hỏng UX của mutation đã thành công — swallow lỗi,
// dựa vào cửa sổ `revalidate: 60` (xem places.api.ts) làm lưới an toàn.
export async function triggerRevalidate(
  entity: { entityType: 'place'; slug: string },
  accessToken: string,
): Promise<void> {
  try {
    await fetch('/api/revalidate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify(entity),
    });
  } catch {
    // Cố ý nuốt lỗi — xem comment đầu file.
  }
}
