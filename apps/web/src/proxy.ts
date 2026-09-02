import { NextResponse, type NextRequest } from 'next/server';
import {
  DEFAULT_LOCALE,
  isSupportedLocale,
  LOCALE_COOKIE_NAME,
  PUBLIC_ROUTE_ROOTS,
  normalizeLocaleInput,
} from '@/lib/locale';

// Locale routing foundation (PR A). Chạy TRƯỚC route resolution — đây là cơ chế duy nhất giữ cho
// URL public cũ (không prefix) không bao giờ 404 sau khi toàn bộ `(public)/**` chuyển vào
// `[locale]/(public)/**`: proxy chặn request `/places/x` lại và redirect sang
// `/vi/places/x` TRƯỚC KHI Next.js thử khớp file route (lúc đó đã không còn file nào ở vị trí cũ).
//
// `proxy.ts` là convention thay thế `middleware.ts` kể từ Next.js 16.3 (file cũ đã deprecated —
// xem https://nextjs.org/docs/messages/middleware-to-proxy). Cùng vị trí, cùng `config.matcher`,
// chỉ đổi tên export `middleware` → `proxy`; hành vi runtime giữ nguyên 100%.
//
// Không dùng Accept-Language (quyết định owner #3) — mặc định luôn `vi` trừ khi cookie đã lưu lựa
// chọn trước đó hoặc URL tự mang locale tường minh.
// Lookahead loại trừ dashboard/login/register theo RANH GIỚI SEGMENT (`(?:/|$)` — theo sau bởi `/`
// hoặc hết chuỗi), KHÔNG theo prefix chuỗi con. Bản cũ (`dashboard|login|register` trần) loại nhầm
// mọi path chỉ TRÙNG TIỀN TỐ — `/dashboard-example`, `/login-help`, `/register-info` — khỏi proxy,
// khiến các route public tương lai mang tiền tố này mất locale routing mà không có lỗi báo hiệu gì.
export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon\\.ico|robots\\.txt|sitemap\\.xml|dashboard(?:/|$)|login(?:/|$)|register(?:/|$)).*)',
  ],
};

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

function resolvePreferredLocale(req: NextRequest) {
  return normalizeLocaleInput(req.cookies.get(LOCALE_COOKIE_NAME)?.value) ?? DEFAULT_LOCALE;
}

function withLocaleCookie(res: NextResponse, locale: string): NextResponse {
  res.cookies.set(LOCALE_COOKIE_NAME, locale, {
    path: '/',
    sameSite: 'lax',
    maxAge: ONE_YEAR_SECONDS,
    secure: process.env.NODE_ENV === 'production',
  });
  return res;
}

export function proxy(req: NextRequest): NextResponse {
  const { pathname, search } = req.nextUrl;
  const segments = pathname.split('/');
  const firstSegment = segments[1] ?? '';

  // `/vi/...`, `/en/...` — locale tường minh trong URL LUÔN thắng cookie (owner decision #3).
  // Pass-through, không redirect: đây chính là điều kiện duy nhất chặn redirect loop — mọi đích
  // redirect bên dưới đều có segment đầu thuộc SUPPORTED_LOCALES nên request kế tiếp luôn rơi vào
  // đúng nhánh này.
  if (isSupportedLocale(firstSegment)) {
    // Người dùng vừa "chọn" locale bằng cách vào thẳng URL này — cập nhật cookie cho lần `/` tiếp
    // theo, không cần một component selector riêng nào để làm việc này (PR A chưa xây selector).
    return withLocaleCookie(NextResponse.next(), firstSegment);
  }

  // `/` (trang chủ, không segment) — luôn redirect, ưu tiên cookie đã lưu, mặc định `vi`.
  if (firstSegment === '') {
    const target = req.nextUrl.clone();
    target.pathname = `/${resolvePreferredLocale(req)}`;
    return withLocaleCookie(NextResponse.redirect(target, 307), resolvePreferredLocale(req));
  }

  // Segment đầu khớp một route public THẬT (vd `/places`, `/hotels/abc`) nhưng chưa có locale
  // prefix — URL cũ, redirect thêm locale, GIỮ NGUYÊN phần còn lại của path + query string.
  if ((PUBLIC_ROUTE_ROOTS as readonly string[]).includes(firstSegment)) {
    const locale = resolvePreferredLocale(req);
    const target = req.nextUrl.clone();
    target.pathname = `/${locale}${pathname}`;
    target.search = search;
    return withLocaleCookie(NextResponse.redirect(target, 307), locale);
  }

  // Segment đầu KHÔNG phải locale hỗ trợ, KHÔNG phải route public đã biết (vd `/fr/...`, hoặc bất
  // kỳ chuỗi lạ nào) — KHÔNG đoán, KHÔNG redirect. Next.js sẽ khớp `[locale]` = segment đó, và
  // `[locale]/layout.tsx` gọi `notFound()` vì nó không thuộc SUPPORTED_LOCALES → 404 thật, đúng
  // yêu cầu "unknown locale phải 404, không fallback/redirect".
  return NextResponse.next();
}
