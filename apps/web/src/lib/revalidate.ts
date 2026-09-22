// C1 (2026-09-22) — gọi SAU KHI một mutation ghi công khai đã thành công (không phải trước, không
// phải "chắc là thành công" — mọi call site phải await mutation trước rồi mới gọi hàm này). Đánh
// thẳng vào route nội bộ `app/api/revalidate/route.ts` của CHÍNH web app (không phải API backend).
//
// Thất bại ở đây KHÔNG được làm hỏng UX của mutation đã thành công — swallow lỗi, dựa vào cửa sổ
// `revalidate: 60` (xem places.api.ts) làm lưới an toàn nếu lần gọi này thất bại vì lý do gì đó
// (mất mạng, route tạm thời lỗi…).
export async function triggerRevalidate(tags: string[], accessToken: string): Promise<void> {
  if (tags.length === 0) return;
  try {
    await fetch('/api/revalidate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ tags }),
    });
  } catch {
    // Cố ý nuốt lỗi — xem comment đầu file.
  }
}
