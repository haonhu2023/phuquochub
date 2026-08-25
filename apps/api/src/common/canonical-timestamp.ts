/**
 * TIMESTAMP CANONICAL của repo — CHÍNH XÁC hình dạng `Date.prototype.toISOString()`:
 * `YYYY-MM-DDTHH:mm:ss.sssZ` (đúng 3 chữ số mili-giây, chữ `Z` hoa, luôn UTC, KHÔNG offset dạng
 * `+HH:MM`). Không phải một lựa chọn tuỳ ý — đây là format DUY NHẤT mà mọi timestamp trong repo
 * đã dùng, không có ngoại lệ (`retrievedAt` của cả 3 target trong `verified-facts.manifest.ts` +
 * `administrative-backfill.manifest.ts` đều `'20XX-XX-XXT00:00:00.000Z'`). Chốt đúng format đó
 * làm canonical thay vì chấp nhận rộng hơn (thiếu mili-giây, có offset) để không phải đoán format
 * nào là "đúng" khi có nhiều biến thể hợp lệ cùng tồn tại.
 *
 * TRÍCH XUẤT (2026-08-25, Slice 0.5D1): hàm này trước ở `publish-manifest.contract.ts` (0.5B),
 * dạng private/không export. `approval-evidence.contract.ts` (0.5D1) cần đúng logic canonical này
 * cho `reviewObservedAt`/`issuedAt`/`notBefore`/`notAfter`. KHÔNG copy-paste một bản thứ hai — dời
 * ra `common/` (cùng chỗ với `canonical-json.ts`, đã dời trước đó vì lý do tương tự: cắt vòng lặp
 * import giữa hai domain contract không nên phụ thuộc lẫn nhau). Hành vi và output giữ NGUYÊN
 * BYTE-FOR-BYTE so với bản gốc trong publish-manifest.contract.ts — chỉ đổi vị trí file.
 * `publish-manifest.contract.ts` giờ import lại từ đây; `manifestChecksum`/`validateManifest()`
 * không đổi hành vi.
 */
export const CANONICAL_UTC_TIMESTAMP_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

/**
 * Kiểm tra một chuỗi vừa ĐÚNG HÌNH DẠNG canonical VỪA là một MỐC THỜI GIAN CÓ THẬT trên lịch.
 *
 * LỖI ĐÃ SỬA (2026-08-24): chỉ dùng `Number.isNaN(Date.parse(value))` KHÔNG đủ — ECMA-262 Date
 * Time String Format tự "chuẩn hoá tràn" (rollover) các thành phần vượt giới hạn thay vì từ chối.
 * Xác nhận thật trên Node runtime của máy này (`process.version`, xem báo cáo commit này):
 *   "2026-02-30T00:00:00.000Z" → Date hợp lệ, tự đổi thành 2026-03-02 (KHÔNG NaN, KHÔNG lỗi)
 *   "2025-02-29T00:00:00.000Z" → tự đổi thành 2025-03-01 (2025 không nhuận, KHÔNG NaN)
 *   "2026-04-31T00:00:00.000Z" → tự đổi thành 2026-05-01 (tháng 4 chỉ có 30 ngày, KHÔNG NaN)
 *   "2024-02-29T00:00:00.000Z" → Date hợp lệ, ĐÚNG 29/02 (2024 là năm nhuận thật)
 *   tháng 13 (vd "...-13-01...")→ Invalid Date (`Number.isNaN(Date.parse())` = true, TRƯỜNG HỢP
 *   NÀY `Date.parse` một mình đã bắt đúng — nhưng ba trường hợp rollover ở trên thì không).
 *
 * CÁCH TRÁNH ROLLOVER: vòng lại `toISOString()` của chính Date vừa parse và so khớp CHÍNH XÁC
 * (character-for-character) với input gốc. Một mốc thời gian THẬT ở dạng canonical, sau khi
 * parse rồi format lại đúng canonical, PHẢI cho ra lại đúng chuỗi đó — không sai một ký tự. Một
 * ngày KHÔNG tồn tại (bị rollover) sẽ format lại thành MỘT NGÀY KHÁC, lộ ra ngay qua so sánh
 * chuỗi. Đây KHÔNG phải chuẩn hoá input (hàm chỉ trả `boolean`, KHÔNG trả giá trị đã sửa) — caller
 * vẫn dùng nguyên chuỗi gốc nếu hợp lệ, và từ chối thẳng nếu không, không âm thầm sửa gì.
 *
 * TẤT ĐỊNH, KHÔNG PHỤ THUỘC TIMEZONE MÁY CHẠY: `CANONICAL_UTC_TIMESTAMP_RE` buộc hậu tố `Z`
 * (UTC), và `toISOString()` LUÔN trả UTC bất kể timezone hệ thống — nên kết quả giống hệt nhau dù
 * chạy ở máy nào, múi giờ nào.
 *
 * KHÔNG gọi `Date.now()` hay đọc đồng hồ hệ thống ở bất kỳ đâu trong hàm này — chỉ parse chuỗi
 * input. Validator dùng hàm này (publish-manifest, approval-evidence) vì vậy vẫn THUẦN.
 */
export function isValidCanonicalTimestamp(value: unknown): value is string {
  if (typeof value !== 'string' || !CANONICAL_UTC_TIMESTAMP_RE.test(value)) return false;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return false;
  return parsed.toISOString() === value;
}
