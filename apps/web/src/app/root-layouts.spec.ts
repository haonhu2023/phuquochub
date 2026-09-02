/**
 * PR A — "multiple root layouts" (xoá `app/layout.tsx` chung, 3 root độc lập:
 * `[locale]/layout.tsx`, `(auth)/layout.tsx`, `(dashboard)/layout.tsx`).
 *
 * Đây là test cấu trúc dựa trên SOURCE TEXT (cùng pattern `legal.spec.tsx` dùng cho các trang
 * pháp lý) thay vì render qua React Testing Library: cả 3 file đều tự khai `<html>/<body>` —
 * render trực tiếp qua RTL sẽ lồng `<html>` vào container mà RTL tự gắn vào `document.body`,
 * không phải cách các file này thực sự chạy trong Next.js. Test nguồn xác nhận đúng những bất biến
 * cấu trúc quan trọng nhất mà không cần giả lập DOM sai sự thật.
 */
import fs from 'node:fs';
import path from 'node:path';

const WEB_SRC = path.join(process.cwd(), 'src');

function readSrc(rel: string): string {
  return fs.readFileSync(path.join(WEB_SRC, rel), 'utf8');
}

describe('không còn app/layout.tsx chung (đã tách 3 root layout độc lập)', () => {
  it('app/layout.tsx không còn tồn tại', () => {
    expect(fs.existsSync(path.join(WEB_SRC, 'app/layout.tsx'))).toBe(false);
  });
});

describe('mỗi root layout tự khai html/body + AuthProvider', () => {
  it.each([
    ['app/[locale]/layout.tsx', 'locale động'],
    ['app/(auth)/layout.tsx', 'vi tĩnh'],
    ['app/(dashboard)/layout.tsx', 'vi tĩnh'],
  ])('%s (%s) có <html>, <body> và bọc AuthProvider', (rel) => {
    const src = readSrc(rel);
    expect(src).toMatch(/<html/);
    expect(src).toMatch(/<body>/);
    expect(src).toMatch(/<AuthProvider>/);
  });
});

describe('html lang đúng theo thiết kế PR A', () => {
  it('[locale]/layout.tsx dùng html lang ĐỘNG theo params.locale, không hardcode', () => {
    const src = readSrc('app/[locale]/layout.tsx');
    expect(src).toMatch(/<html lang=\{locale\}>/);
    expect(src).not.toMatch(/<html lang="vi">/);
  });

  it.each(['app/(auth)/layout.tsx', 'app/(dashboard)/layout.tsx'])(
    '%s dùng html lang="vi" TĨNH (route không có locale prefix)',
    (rel) => {
      expect(readSrc(rel)).toMatch(/<html lang="vi">/);
    },
  );
});

describe('[locale]/layout.tsx từ chối locale không hỗ trợ', () => {
  it('gọi notFound() khi locale không thuộc SUPPORTED_LOCALES', () => {
    const src = readSrc('app/[locale]/layout.tsx');
    expect(src).toMatch(/isSupportedLocale\(locale\)/);
    expect(src).toMatch(/notFound\(\)/);
  });
});

describe('cả 3 root layout dùng chung DEFAULT_METADATA (không lặp lại metadataBase 3 lần)', () => {
  it.each(['app/[locale]/layout.tsx', 'app/(auth)/layout.tsx', 'app/(dashboard)/layout.tsx'])(
    '%s import DEFAULT_METADATA từ lib/default-metadata',
    (rel) => {
      expect(readSrc(rel)).toMatch(/DEFAULT_METADATA/);
    },
  );
});
