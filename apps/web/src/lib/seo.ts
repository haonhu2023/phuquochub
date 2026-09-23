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
 * Trạng thái công khai THẬT của bản dịch tiếng Anh cho một trang chi tiết thực thể (place/hotel/
 * restaurant/tour) — đầu vào của {@link isEnDetailIndexable}. Cả hai field đều đến từ API
 * (`en_display_name_approved`/`en_short_description_approved` trên `PlaceDetail`), vốn LUÔN tra
 * đúng locale 'en' bất kể `?locale=` của request — không phải suy ra từ việc response hiện tại có
 * đang hiển thị tiếng Anh hay không (một trang `/vi` cũng cần biết trạng thái này để dựng đúng
 * hreflang="en").
 */
export interface EnIndexabilityInput {
  displayNameEnApproved: boolean;
  shortDescriptionEnApproved: boolean;
}

/**
 * Cổng lập chỉ mục cho TRANG CHI TIẾT một thực thể (place/hotel/restaurant/tour) ở bản `en`
 * (Phase 20 — "EN indexation gate"; v2 — entity-aware thay vì khoá cứng toàn cục).
 *
 * Sự thật kỹ thuật: `GET /places/{slug}?locale=en` (và các endpoint chi tiết tương tự) trả về bản
 * dịch CÔNG KHAI+HIỆN HÀNH nếu có, LÙI VỀ NGUYÊN VĂN TIẾNG VIỆT nếu không — response đó tự nó
 * không phân biệt được "đây là bản dịch thật" với "đây là bản gốc lùi về". Vì vậy quyết định index
 * KHÔNG được suy từ nội dung response hiển thị, mà từ hai cờ tường minh
 * (`en_display_name_approved`/`en_short_description_approved`) mà API tính THẲNG từ
 * `place_translations` (is_current + is_public + is_production_data — cùng seam
 * `getCurrentPublicTranslatedText` mà tầng đọc công khai đã dùng, không phải một định nghĩa
 * "công khai" thứ hai).
 *
 * Chính sách MVP: CẢ HAI field bắt buộc (name + short_description) — một entity chỉ có tên dịch
 * mà chưa có mô tả dịch vẫn CHƯA đủ để công bố với công cụ tìm kiếm như một trang tiếng Anh hoàn
 * chỉnh. Chưa có translation nào (input `null`/`undefined`, hoặc translation đang PENDING/
 * REJECTED/NEEDS_CHANGES — mọi trạng thái khác APPROVED+public) đều rơi về `false`, không bao giờ
 * suy đoán "có lẽ đã dịch".
 */
export function isEnDetailIndexable(input: EnIndexabilityInput | null | undefined): boolean {
  if (!input) return false;
  return input.displayNameEnApproved && input.shortDescriptionEnApproved;
}

/** `robots` Metadata cho một trang KHÔNG nên vào index nhưng VẪN phải crawl được (Phase 27: một
 * `noindex` không có tác dụng nếu robots.txt đã chặn crawler đọc chính trang đó). */
export const NOINDEX_FOLLOW = { index: false, follow: true } as const;
