import { buildWebSiteJsonLd, serializeJsonLd } from './structured-data';

// Chỉ bao phủ phần MỚI thêm cho trang chủ (WebSite) + `serializeJsonLd` mà nó dùng. Các builder
// place/hotel/restaurant/tour/event có sẵn không bị đụng tới trong task này.
describe('buildWebSiteJsonLd', () => {
  const SITE = 'http://localhost:3000'; // getSiteUrl() mặc định khi không đặt NEXT_PUBLIC_SITE_URL

  it('phát đúng kiểu WebSite kèm ngôn ngữ và URL gốc', () => {
    const jsonLd = buildWebSiteJsonLd('PhuQuocHub', 'Mô tả');
    expect(jsonLd).toMatchObject({
      '@context': 'https://schema.org',
      '@type': 'WebSite',
      name: 'PhuQuocHub',
      description: 'Mô tả',
      url: SITE,
      inLanguage: 'vi-VN',
    });
  });

  // SearchAction phải trỏ tới endpoint tìm kiếm CÓ THẬT (/search?q=) — khai báo một endpoint không
  // tồn tại là dữ liệu có cấu trúc sai sự thật.
  it('SearchAction trỏ tới /search?q= với query-input hợp lệ', () => {
    const jsonLd = buildWebSiteJsonLd('PhuQuocHub', 'Mô tả') as {
      potentialAction: { target: { urlTemplate: string }; 'query-input': string };
    };
    expect(jsonLd.potentialAction.target.urlTemplate).toBe(`${SITE}/search?q={search_term_string}`);
    expect(jsonLd.potentialAction['query-input']).toBe('required name=search_term_string');
  });

  // Kỷ luật của file này: KHÔNG bịa dữ kiện pháp nhân (logo/địa chỉ/mạng xã hội/pháp nhân).
  it('KHÔNG phát Organization/địa chỉ/logo/mạng xã hội nào', () => {
    const jsonLd = buildWebSiteJsonLd('PhuQuocHub', 'Mô tả');
    expect(jsonLd).not.toHaveProperty('address');
    expect(jsonLd).not.toHaveProperty('logo');
    expect(jsonLd).not.toHaveProperty('sameAs');
    expect(jsonLd).not.toHaveProperty('publisher');
    expect(JSON.stringify(jsonLd)).not.toContain('Organization');
  });
});

describe('serializeJsonLd', () => {
  // Chuỗi `</script>` trong dữ liệu cộng đồng không được phép thoát ra khỏi thẻ <script>.
  it('escape dấu < để không thoát khỏi thẻ script', () => {
    const out = serializeJsonLd({ name: '</script><img onerror=alert(1)>' });
    expect(out).not.toContain('</script>');
    expect(out).toContain('\\u003c');
  });
});
