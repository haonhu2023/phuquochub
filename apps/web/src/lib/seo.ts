import { getSiteUrl } from './site';
import { SUPPORTED_LOCALES, localizedHref, type Locale } from './locale';

// SEO v2 — hreflang/canonical CHUNG cho mọi route công khai đã bản địa hoá đầy đủ (H1/description/
// UI text thật ở CẢ hai locale, không phải chỉ URL đổi prefix). Một hàm DUY NHẤT dựng cả canonical
// lẫn `alternates.languages` để không có route nào tự tay ghép URL rồi lệch quy ước với route khác
// (ví dụ quên `x-default`, hoặc trỏ `en` về nội dung còn nguyên tiếng Việt).
//
// `x-default`: trỏ về bản `vi` — đây là ngôn ngữ MẶC ĐỊNH thật của sản phẩm (`DEFAULT_LOCALE`,
// `lib/locale.ts`) và là bản mọi middleware/redirect hiện tại đưa người dùng không xác định được
// locale tới, nên nó cũng là lựa chọn đúng cho người dùng tìm kiếm không khớp locale cụ thể nào.
export interface RouteAlternates {
  canonical: string;
  languages: Record<string, string>;
}

export function buildAlternates(path: string): RouteAlternates {
  const site = getSiteUrl();
  const languages: Record<string, string> = {};
  for (const locale of SUPPORTED_LOCALES) {
    languages[locale] = `${site}${localizedHref(locale, path)}`;
  }
  languages['x-default'] = `${site}${localizedHref('vi', path)}`;
  return {
    canonical: `${site}${localizedHref('vi', path)}`, // ghi đè per-locale ở nơi gọi khi cần (xem buildRouteAlternates)
    languages,
  };
}

/**
 * Bản đầy đủ THEO ĐÚNG locale hiện tại — canonical của TRANG NÀY tự trỏ về CHÍNH NÓ (Phase 18:
 * "Do not canonical English to Vietnamese when both are genuine localized versions"), còn
 * `languages` liệt kê CẢ hai bản cộng `x-default` để search engine tự chọn đúng theo người dùng.
 */
export function buildRouteAlternates(locale: Locale, path: string): RouteAlternates {
  const { languages } = buildAlternates(path);
  return { canonical: languages[locale], languages };
}

/**
 * Cổng lập chỉ mục cho TRANG CHI TIẾT một thực thể (place/hotel/restaurant/tour) ở bản `en`
 * (Phase 20 — "EN indexation gate").
 *
 * Sự thật kỹ thuật hiện tại: `GET /places/{slug}?locale=en` (và các endpoint chi tiết tương tự)
 * trả về bản dịch CÔNG KHAI+HIỆN HÀNH nếu có, LÙI VỀ NGUYÊN VĂN TIẾNG VIỆT nếu không — và không hề
 * có cờ nào trong response phân biệt "đây là bản dịch thật" với "đây là bản gốc lùi về". Kiểm tra
 * đó cần đọc `place_translations`/`is_current`/`is_public` (dữ liệu server-side thật), việc mà một
 * Client/Server Component ở tầng trang không thể tự suy ra từ response hiện có.
 *
 * Sự thật dữ liệu hiện tại (xác nhận qua audit governance, không suy đoán): CẢ 49 place trên
 * production đều CHƯA có bản dịch nào ở trạng thái APPROVED/PUBLIC
 * (`production_translation_rows=0` tại thời điểm audit) — nghĩa là MỌI trang chi tiết `en` hôm nay
 * chắc chắn đang hiển thị nguyên văn tiếng Việt, không có ngoại lệ nào cần lo bỏ sót.
 *
 * Vì vậy: khoá CỨNG `false` ở đây — không suy đoán "có lẽ một vài trang đã dịch" — và để lại một
 * điểm nối DUY NHẤT (hàm này) cho lúc pipeline duyệt bản dịch thực sự xuất bản nội dung: khi đó,
 * thay thân hàm bằng một truy vấn thật (ví dụ cờ `has_approved_translation` do API trả kèm chi
 * tiết), KHÔNG đổi bất kỳ nơi gọi nào khác.
 */
export function isEnDetailIndexable(_slug: string): boolean {
  return false;
}

/** `robots` Metadata cho một trang KHÔNG nên vào index nhưng VẪN phải crawl được (Phase 27: một
 * `noindex` không có tác dụng nếu robots.txt đã chặn crawler đọc chính trang đó). */
export const NOINDEX_FOLLOW = { index: false, follow: true } as const;
