// Locale routing foundation (PR A). Nguồn locale cho TẦNG ROUTING/EDGE — cố ý TÁCH khỏi
// `supported_locales` (bảng DB phía API, ADR-020): middleware cần biết locale hợp lệ ngay ở edge,
// không round-trip DB mỗi request. Thêm locale mới phải sửa CẢ hằng số này LẪN seed
// `supported_locales` — hai nguồn cố ý không dùng chung, xem báo cáo audit "SSOT + UUID
// reconciliation" / PR A design cho lý do đầy đủ.
export const SUPPORTED_LOCALES = ['vi', 'en'] as const;

export type Locale = (typeof SUPPORTED_LOCALES)[number];

export const DEFAULT_LOCALE: Locale = 'vi';

export const LOCALE_COOKIE_NAME = 'NEXT_LOCALE';

// Danh sách first-segment của MỌI route public thật (khớp `apps/web/src/app/[locale]/(public)/**`).
// Dùng ở middleware để phân biệt "URL công khai cũ chưa có prefix → cần redirect thêm locale" với
// "segment lạ, không khớp route/locale nào → để rơi thẳng vào notFound(), không đoán/redirect".
// PHẢI cập nhật danh sách này khi thêm route public mới ở PR sau — không có cách nào suy ra tự
// động từ file-system route tree tại tầng middleware (Edge runtime không có quyền đọc `app/`).
export const PUBLIC_ROUTE_ROOTS = [
  'places',
  'search',
  'map',
  'explore',
  'hotels',
  'restaurants',
  'tours',
  'beaches',
  'attractions',
  'events',
  'about',
  'contact',
  'privacy',
  'terms',
] as const;

export function isSupportedLocale(value: string): value is Locale {
  return (SUPPORTED_LOCALES as readonly string[]).includes(value);
}

// Chuẩn hoá giá trị cookie/param locale không đáng tin: trả về Locale hợp lệ hoặc null (KHÔNG bao
// giờ throw) — gọi nơi nào đọc locale từ input bên ngoài (cookie, query) trước khi dùng.
export function normalizeLocaleInput(value: string | null | undefined): Locale | null {
  if (!value) return null;
  return isSupportedLocale(value) ? value : null;
}

// Nối `locale` vào đầu `path` — path LUÔN bắt đầu bằng '/'. Không tự thêm locale lần hai nếu path
// đã tự mang một prefix locale hợp lệ (tránh double-prefix khi gọi lồng/gọi nhầm).
export function localizedHref(locale: Locale, path: string): string {
  const firstSegment = path.split('/')[1];
  if (firstSegment && isSupportedLocale(firstSegment)) {
    return path;
  }
  return path === '/' ? `/${locale}` : `/${locale}${path}`;
}
