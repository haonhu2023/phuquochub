import { NextRequest } from 'next/server';
import { proxy, config } from './proxy';
import { LOCALE_COOKIE_NAME } from '@/lib/locale';

function req(path: string, opts: { cookie?: string } = {}): NextRequest {
  const headers = new Headers();
  if (opts.cookie) headers.set('cookie', opts.cookie);
  return new NextRequest(new URL(`https://phuquochub.example${path}`), { headers });
}

describe('proxy — redirect matrix (PR A)', () => {
  it('/ → 307 /vi (mặc định, không cookie)', () => {
    const res = proxy(req('/'));
    expect(res.status).toBe(307);
    expect(new URL(res.headers.get('location')!).pathname).toBe('/vi');
  });

  it('/ → 307 /en khi cookie đã lưu en', () => {
    const res = proxy(req('/', { cookie: `${LOCALE_COOKIE_NAME}=en` }));
    expect(new URL(res.headers.get('location')!).pathname).toBe('/en');
  });

  it('/places → 307 /vi/places, giữ query string', () => {
    const res = proxy(req('/places?category=beach&page=2'));
    expect(res.status).toBe(307);
    const location = new URL(res.headers.get('location')!);
    expect(location.pathname).toBe('/vi/places');
    expect(location.search).toBe('?category=beach&page=2');
  });

  it.each([
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
  ])('/%s → 307 /vi/%s (toàn bộ route public cũ)', (route) => {
    const res = proxy(req(`/${route}`));
    expect(res.status).toBe(307);
    expect(new URL(res.headers.get('location')!).pathname).toBe(`/vi/${route}`);
  });

  it('/hotels/vinpearl-resort (route con động) → 307 /vi/hotels/vinpearl-resort', () => {
    const res = proxy(req('/hotels/vinpearl-resort'));
    expect(new URL(res.headers.get('location')!).pathname).toBe('/vi/hotels/vinpearl-resort');
  });

  it('/vi/... → pass-through, KHÔNG redirect (chặn loop)', () => {
    const res = proxy(req('/vi/places/bai-sao'));
    expect(res.headers.get('location')).toBeNull();
  });

  it('/en/... → pass-through, KHÔNG redirect', () => {
    const res = proxy(req('/en/places/bai-sao'));
    expect(res.headers.get('location')).toBeNull();
  });

  it('/vi (không có gì theo sau) → pass-through', () => {
    const res = proxy(req('/vi'));
    expect(res.headers.get('location')).toBeNull();
  });

  it('/fr/places → KHÔNG redirect, KHÔNG fallback (để rơi vào notFound() ở layout)', () => {
    const res = proxy(req('/fr/places'));
    expect(res.headers.get('location')).toBeNull();
    expect(res.status).not.toBe(307);
  });

  it('/xyz-not-a-route → KHÔNG redirect (không phải locale, không phải route public đã biết)', () => {
    const res = proxy(req('/xyz-not-a-route'));
    expect(res.headers.get('location')).toBeNull();
  });

  it('không có redirect nào lặp lại quá 1 lần (chống loop, chạy đệ quy trên chính output)', () => {
    let res = proxy(req('/places'));
    for (let i = 0; i < 3; i++) {
      const location = res.headers.get('location');
      if (!location) break;
      res = proxy(req(new URL(location).pathname + new URL(location).search));
    }
    expect(res.headers.get('location')).toBeNull();
  });
});

describe('proxy — cookie contract', () => {
  it('request có locale tường minh → ghi cookie NEXT_LOCALE khớp locale đó', () => {
    const res = proxy(req('/en/places'));
    const setCookie = res.headers.get('set-cookie') ?? '';
    expect(setCookie).toMatch(new RegExp(`${LOCALE_COOKIE_NAME}=en`));
  });

  it('cookie không hợp lệ (poisoning) bị bỏ qua, rơi về DEFAULT_LOCALE — không phản chiếu ra Location', () => {
    const res = proxy(req('/', { cookie: `${LOCALE_COOKIE_NAME}=<script>alert(1)</script>` }));
    const location = res.headers.get('location')!;
    expect(location).not.toContain('<script>');
    expect(new URL(location).pathname).toBe('/vi');
  });

  it('cookie giá trị lạ khác (không phải locale hợp lệ) → rơi về vi', () => {
    const res = proxy(req('/', { cookie: `${LOCALE_COOKIE_NAME}=malicious-value` }));
    expect(new URL(res.headers.get('location')!).pathname).toBe('/vi');
  });
});

describe('proxy — security', () => {
  it('không bao giờ redirect ra ngoài origin/domain hiện tại (open redirect)', () => {
    const res = proxy(req('/places'));
    const location = res.headers.get('location');
    if (location) {
      expect(new URL(location).origin).toBe('https://phuquochub.example');
    }
  });

  it('path traversal trong segment locale không được dùng để build path — vẫn 404 qua notFound(), không redirect', () => {
    const res = proxy(req('/..%2f..%2fetc%2fpasswd'));
    // Segment lạ, không khớp locale/route công khai đã biết → pass-through, không redirect.
    expect(res.headers.get('location')).toBeNull();
  });
});

describe('proxy — matcher exclusion boundary (config.matcher, Next.js router áp dụng TRƯỚC khi gọi proxy())', () => {
  // `matcher` được Next.js router compile thành RegExp và test trực tiếp trên pathname — proxy()
  // không hề được gọi khi không khớp. Test ở đây verify chính source regex.
  //
  // PHẢI neo `^...$` khi test: `config.matcher[0]` không tự neo (không có `^`/`$`), nên
  // `new RegExp(source).test(path)` không neo sẽ khớp SAI nếu tồn tại BẤT KỲ vị trí nào trong
  // chuỗi thoả pattern — ví dụ '/dashboard/settings' khớp sai=true vì regex tìm thấy một điểm bắt
  // đầu khác (vd tại '/settings') dù điểm bắt đầu thật (offset 0) đúng ra phải bị loại. Đã đối
  // chiếu: `new RegExp('^'+source+'$')` cho kết quả khớp 100% với regex THẬT Next.js compile ra
  // (đọc trực tiếp từ `.next/server/functions-config-manifest.json` sau `next build` — xem
  // functions['/_middleware'].matchers[0].regexp, có thêm tiền tố `_next/data` và hậu tố
  // `.json|.rsc|...` optional rồi neo `^...$`); bản neo đơn giản ở đây tương đương cho mọi path
  // test vì các path test không đụng nhánh `_next/data` hay hậu tố `.json/.rsc`.
  const matcherPattern = new RegExp(`^${config.matcher[0]}$`);

  it.each(['/dashboard', '/dashboard/', '/dashboard/settings', '/login', '/register'])(
    '%s bị loại khỏi matcher — ĐÚNG route auth/dashboard thật (segment boundary, không phải prefix)',
    (path) => {
      expect(matcherPattern.test(path)).toBe(false);
    },
  );

  it.each(['/robots.txt', '/sitemap.xml', '/_next/static/example.js', '/_next/image'])(
    '%s vẫn bị loại khỏi matcher (static asset / reserved path, không đổi)',
    (path) => {
      expect(matcherPattern.test(path)).toBe(false);
    },
  );

  it.each(['/places', '/vi', '/fr', '/'])('%s vẫn khớp matcher (route public/locale bình thường không bị loại nhầm)', (path) => {
    expect(matcherPattern.test(path)).toBe(true);
  });

  // SỬA trong lượt này: trước đây lookahead khớp theo PREFIX chuỗi con (`/dashboard-example` cũng
  // bắt đầu bằng "dashboard" nên bị loại nhầm khỏi proxy) — một boundary defect vô hại với route
  // hiện tại nhưng có thể làm route public tương lai mang tiền tố này mất locale routing một cách
  // im lặng. Nay `dashboard(?:/|$)` chỉ khớp CHÍNH XÁC `/dashboard` hoặc `/dashboard/...`, không
  // còn khớp `/dashboard-example`.
  it.each(['/dashboard-example', '/login-help', '/register-info', '/dashboarding'])(
    '%s KHÔNG còn bị loại khỏi matcher (đã sửa boundary — proxy() giờ CHẠY trên các path này)',
    (path) => {
      expect(matcherPattern.test(path)).toBe(true);
    },
  );
});

describe('proxy — hành vi thực tế của proxy() trên các path ranh giới (bổ sung matcher, không thay quyết định redirect)', () => {
  // Quyết định của owner cho lượt sửa này: CHỈ sửa matcher boundary, KHÔNG mở rộng logic redirect
  // của proxy(). '/dashboard-example' v.v. không nằm trong PUBLIC_ROUTE_ROOTS (không phải route
  // public thật, chỉ là ví dụ minh hoạ boundary) và không phải locale — nên khi proxy() THẬT SỰ
  // chạy trên chúng (nay matcher đã cho phép), chúng rơi vào đúng nhánh cuối cùng: pass-through,
  // giống hệt '/xyz-not-a-route' — KHÔNG redirect, KHÔNG đoán locale. Nếu một route public thật sự
  // mang tên dạng này được thêm vào PUBLIC_ROUTE_ROOTS ở PR sau, nó sẽ tự động được redirect đúng
  // qua nhánh PUBLIC_ROUTE_ROOTS đã có sẵn — matcher fix này là điều kiện CẦN (không còn bị chặn ở
  // cửa router), còn việc redirect thật là trách nhiệm của PUBLIC_ROUTE_ROOTS, ngoài phạm vi sửa này.
  it.each(['/dashboard-example', '/login-help', '/register-info', '/dashboarding'])(
    '%s → pass-through khi proxy() chạy thật (không phải PUBLIC_ROUTE_ROOTS, không phải locale) — KHÔNG redirect',
    (path) => {
      const res = proxy(req(path));
      expect(res.headers.get('location')).toBeNull();
    },
  );

  it('/login-help?x=1 → pass-through, giữ nguyên toàn bộ URL gốc (không có redirect nào để làm mất query string)', () => {
    const res = proxy(req('/login-help?x=1'));
    expect(res.headers.get('location')).toBeNull();
  });

  it('cookie NEXT_LOCALE=en không làm /dashboard-example bị redirect (nhánh pass-through không đọc cookie locale)', () => {
    const res = proxy(req('/dashboard-example', { cookie: `${LOCALE_COOKIE_NAME}=en` }));
    expect(res.headers.get('location')).toBeNull();
  });

  // Defense-in-depth: dù matcher đã loại các path này khỏi proxy() trong production, gọi trực tiếp
  // hàm vẫn phải pass-through — không có nhánh nào trong proxy() tự redirect dashboard/login/register.
  it.each(['/dashboard', '/dashboard/settings', '/login', '/register'])(
    '%s → pass-through nếu proxy() được gọi trực tiếp (defense-in-depth, dù matcher đã chặn từ router)',
    (path) => {
      const res = proxy(req(path));
      expect(res.headers.get('location')).toBeNull();
    },
  );
});
