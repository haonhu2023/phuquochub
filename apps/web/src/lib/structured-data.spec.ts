import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { PlaceDetail } from '@phuquochub/shared-types';
import { buildPlaceJsonLd, buildWebSiteJsonLd, serializeJsonLd } from './structured-data';

// STRUCTURED_DATA_NO_HARDCODED_REGION (Place Information Foundation, 2026-08-18).

const basePlace: PlaceDetail = {
  id: 'p1',
  name: 'Bãi Sao',
  slug: 'bai-sao',
  category_id: 'c1',
  category_slug: 'beach',
  short_description: 'Bãi biển cát trắng',
  price_range: null,
  cover_image_url: null,
  rating_avg: null,
  rating_count: 0,
  verification_status: 'pending',
  status: 'published',
  location: { lat: 10.0466, lng: 104.0281 },
  address: 'Bãi Sao, An Thới',
  ward: 'An Thới',
  province: null,
  admin_area: null,
  description: null,
  opening_hours: null,
  osm_id: null,
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
  verified_at: null,
  contacts: [],
  prices: [],
  media: [],
  faqs: [],
  trust_sources: [],
};

function addressOf(place: PlaceDetail): Record<string, unknown> | undefined {
  return buildPlaceJsonLd(place).address as Record<string, unknown> | undefined;
}

describe('buildPlaceJsonLd — địa chỉ lấy từ dữ liệu canonical', () => {
  it('province có giá trị → addressRegion đúng giá trị đó', () => {
    const address = addressOf({ ...basePlace, province: 'An Giang' });
    expect(address?.addressRegion).toBe('An Giang');
  });

  // Điểm cốt lõi: 49 place hiện tại đều chưa xác minh đơn vị hành chính. Thà THIẾU một trường tuỳ
  // chọn của schema.org còn hơn phát đi một tỉnh sai cho công cụ tìm kiếm đọc.
  it('province null → BỎ HẲN addressRegion, không thay bằng mặc định nào', () => {
    const address = addressOf(basePlace);
    expect(address).toBeDefined();
    expect(address).not.toHaveProperty('addressRegion');
    expect(JSON.stringify(address)).not.toContain('Kiên Giang');
  });

  it('admin_area là addressLocality khi đã có (đơn vị hành chính hiện hành)', () => {
    const address = addressOf({ ...basePlace, admin_area: 'Đặc khu Phú Quốc' });
    expect(address?.addressLocality).toBe('Đặc khu Phú Quốc');
  });

  // Không được để trang nào MẤT dữ liệu SEO đang có chỉ vì cột hành chính chưa nhập.
  it('chưa có admin_area → lùi về ward (giữ nguyên hành vi cũ, không mất dữ liệu)', () => {
    expect(addressOf(basePlace)?.addressLocality).toBe('An Thới');
  });

  it('addressCountry vẫn là VN — hằng số có chủ ý, không thuộc diện sắp xếp hành chính', () => {
    expect(addressOf(basePlace)?.addressCountry).toBe('VN');
  });

  it('không có address/ward/province → bỏ hẳn khối address, không phát PostalAddress rỗng', () => {
    const bare = { ...basePlace, address: null, ward: null };
    expect(buildPlaceJsonLd(bare)).not.toHaveProperty('address');
  });

  it('geo/rating giữ nguyên hành vi cũ (refactor không được làm rơi trường nào)', () => {
    const jsonLd = buildPlaceJsonLd({ ...basePlace, rating_avg: 4.5, rating_count: 12 });
    expect(jsonLd['@type']).toBe('TouristAttraction');
    expect(jsonLd.geo).toEqual({
      '@type': 'GeoCoordinates',
      latitude: 10.0466,
      longitude: 104.0281,
    });
    expect(jsonLd.aggregateRating).toEqual({
      '@type': 'AggregateRating',
      ratingValue: 4.5,
      reviewCount: 12,
    });
  });

  // `location` là NOT NULL ở DB và non-nullable trong kiểu, nên đường này không tới được qua API —
  // nhưng builder có sẵn guard `if (place.location)`. Test khoá guard đó lại: nếu ai gỡ nó, JSON-LD
  // sẽ phát `GeoCoordinates` với latitude/longitude `undefined` thay vì bỏ khối geo đi.
  it('không có toạ độ → bỏ hẳn khối geo, không phát GeoCoordinates rỗng', () => {
    const noGeo = { ...basePlace, location: undefined as unknown as PlaceDetail['location'] };
    const jsonLd = buildPlaceJsonLd(noGeo);
    expect(jsonLd).not.toHaveProperty('geo');
    expect(jsonLd.name).toBe('Bãi Sao'); // phần còn lại vẫn dựng bình thường
  });

  // "JSON-LD remains valid": chuỗi nhúng vào <script> phải parse lại được thành đúng object ban đầu.
  it('chuỗi phát ra parse lại được và giữ nguyên @context/@type', () => {
    const withAll: PlaceDetail = { ...basePlace, province: 'An Giang', admin_area: 'Đặc khu Phú Quốc' };
    const parsed = JSON.parse(serializeJsonLd(buildPlaceJsonLd(withAll))) as Record<string, unknown>;
    expect(parsed['@context']).toBe('https://schema.org');
    expect(parsed['@type']).toBe('TouristAttraction');
    expect(parsed.address).toMatchObject({
      '@type': 'PostalAddress',
      addressLocality: 'Đặc khu Phú Quốc',
      addressRegion: 'An Giang',
      addressCountry: 'VN',
    });
  });

  it('serializeJsonLd vẫn thoát `<` (chống thoát khỏi thẻ script)', () => {
    const out = serializeJsonLd(buildPlaceJsonLd({ ...basePlace, name: '</script><b>x' }));
    expect(out).not.toContain('</script>');
    expect(out).toContain('\\u003c');
  });
});

// STRUCTURED_DATA — openingHoursSpecification/telephone (Place Trust & Freshness Surface, 2026-08-19).
describe('buildPlaceJsonLd — openingHoursSpecification', () => {
  it('opening_hours null → không phát openingHoursSpecification', () => {
    expect(buildPlaceJsonLd(basePlace)).not.toHaveProperty('openingHoursSpecification');
  });

  it('chỉ timezone/note (không có lịch thật) → không phát openingHoursSpecification', () => {
    const place = { ...basePlace, opening_hours: { timezone: 'Asia/Ho_Chi_Minh' } };
    expect(buildPlaceJsonLd(place)).not.toHaveProperty('openingHoursSpecification');
  });

  it('lịch tuần hợp lệ → mỗi khung giờ một OpeningHoursSpecification, đúng dayOfWeek schema.org', () => {
    const place = {
      ...basePlace,
      opening_hours: {
        regular: {
          mon: [{ open: '08:00', close: '22:00' }],
          tue: [],
        },
      },
    };
    const jsonLd = buildPlaceJsonLd(place);
    expect(jsonLd.openingHoursSpecification).toEqual([
      {
        '@type': 'OpeningHoursSpecification',
        dayOfWeek: 'https://schema.org/Monday',
        opens: '08:00',
        closes: '22:00',
      },
    ]);
  });

  it('nhiều ca trong ngày → nhiều OpeningHoursSpecification cho cùng dayOfWeek', () => {
    const place = {
      ...basePlace,
      opening_hours: {
        regular: {
          mon: [
            { open: '08:00', close: '11:30' },
            { open: '13:00', close: '22:00' },
          ],
        },
      },
    };
    const specs = buildPlaceJsonLd(place).openingHoursSpecification as Array<Record<string, unknown>>;
    expect(specs).toHaveLength(2);
    expect(specs.every((s) => s.dayOfWeek === 'https://schema.org/Monday')).toBe(true);
  });

  // Dữ liệu hỏng không được biến thành một khẳng định sai trong JSON-LD (cùng nguyên tắc
  // modules/places/openingHours.ts) — khung không đọc được thì BỎ QUA, không phát 'undefined'.
  it('khung giờ hỏng (thiếu close) bị loại khỏi openingHoursSpecification, khung hợp lệ khác vẫn giữ', () => {
    const place = {
      ...basePlace,
      opening_hours: {
        regular: {
          mon: [{ open: '08:00' } as never],
          tue: [{ open: '08:00', close: '20:00' }],
        },
      },
    };
    const specs = buildPlaceJsonLd(place).openingHoursSpecification as Array<Record<string, unknown>>;
    expect(specs).toHaveLength(1);
    expect(specs[0].dayOfWeek).toBe('https://schema.org/Tuesday');
  });

  it('is_24h → một OpeningHoursSpecification phủ cả 7 ngày, 00:00–23:59', () => {
    const place = { ...basePlace, opening_hours: { is_24h: true } };
    const specs = buildPlaceJsonLd(place).openingHoursSpecification as Array<Record<string, unknown>>;
    expect(specs).toHaveLength(1);
    expect(specs[0].opens).toBe('00:00');
    expect(specs[0].closes).toBe('23:59');
    expect((specs[0].dayOfWeek as string[]).length).toBe(7);
  });
});

describe('buildPlaceJsonLd — telephone', () => {
  it('không có contact nào dạng điện thoại → không phát telephone', () => {
    expect(buildPlaceJsonLd(basePlace)).not.toHaveProperty('telephone');
  });

  it('có contact contact_type=phone hợp lệ → phát telephone', () => {
    const place = {
      ...basePlace,
      contacts: [
        {
          id: 'ct1',
          contact_type: 'phone',
          value: '+84987654321',
          label: null,
          is_primary: true,
          verification_status: 'pending' as const,
          display_order: 0,
        },
      ],
    };
    expect(buildPlaceJsonLd(place).telephone).toBe('+84987654321');
  });

  it('contact không phải dạng số điện thoại (vd email) → không phát telephone', () => {
    const place = {
      ...basePlace,
      contacts: [
        {
          id: 'ct1',
          contact_type: 'email',
          value: 'contact@example.com',
          label: null,
          is_primary: true,
          verification_status: 'pending' as const,
          display_order: 0,
        },
      ],
    };
    expect(buildPlaceJsonLd(place)).not.toHaveProperty('telephone');
  });
});

/**
 * Negative control ở mức MÃ NGUỒN, không phải mức hành vi.
 *
 * Các test trên chỉ chứng minh `buildPlaceJsonLd` hành xử đúng với dữ liệu đưa vào. Chúng KHÔNG
 * chặn được việc ai đó thêm lại một hằng số địa danh vào một builder khác trong cùng file
 * (`buildHotelJsonLd`, `buildEventJsonLd`, …) — đúng cách lỗi cũ đã tồn tại: một dòng hằng số nằm
 * trong hàm dùng chung, không test nào chạm tới.
 *
 * Nên test này đọc thẳng file và cấm mọi tên đơn vị hành chính xuất hiện dưới dạng chuỗi. Dữ liệu
 * hành chính phải đến từ `place.province`/`place.admin_area`, không bao giờ từ mã nguồn.
 */
describe('structured-data.ts không được hard-code địa danh hành chính', () => {
  const FORBIDDEN = [
    'Kiên Giang',
    'Kien Giang',
    'An Giang',
    'Phú Quốc',
    'Phu Quoc',
    'Đặc khu',
    'Dac khu',
  ];

  it.each(FORBIDDEN)('không xuất hiện chuỗi "%s" trong mã nguồn', (needle) => {
    const source = readFileSync(join(__dirname, 'structured-data.ts'), 'utf8');
    // Bỏ comment trước khi kiểm: phần giải thích BẮT BUỘC phải nhắc tên tỉnh để nói rõ vì sao
    // không được hard-code — cấm cả trong comment sẽ cấm luôn chính lời giải thích đó.
    const code = source
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '');
    expect(code).not.toContain(needle);
  });
});

// SEO v2 — trước đây `inLanguage`/`url`/`potentialAction.target` đều hằng số tiếng Việt bất kể
// trang chủ đang phục vụ locale nào, tự mâu thuẫn với `<html lang="en">` render cùng lúc trên
// `/en`. Khoá lại: cả ba trường phải khớp ĐÚNG locale được truyền vào.
describe('buildWebSiteJsonLd — locale-aware (SEO v2)', () => {
  it('locale=vi: inLanguage/url/search action đều là bản vi', () => {
    const jsonLd = buildWebSiteJsonLd('PhuQuocHub', 'Mô tả', 'vi');
    expect(jsonLd.inLanguage).toBe('vi-VN');
    expect(jsonLd.url).toBe('http://localhost:3000/vi');
    expect((jsonLd.potentialAction as { target: { urlTemplate: string } }).target.urlTemplate).toBe(
      'http://localhost:3000/vi/search?q={search_term_string}',
    );
  });

  it('locale=en: cả ba trường đổi đúng sang bản en, không còn URL /vi nào', () => {
    const jsonLd = buildWebSiteJsonLd('PhuQuocHub', 'Description', 'en');
    expect(jsonLd.inLanguage).toBe('en-US');
    expect(jsonLd.url).toBe('http://localhost:3000/en');
    expect((jsonLd.potentialAction as { target: { urlTemplate: string } }).target.urlTemplate).toBe(
      'http://localhost:3000/en/search?q={search_term_string}',
    );
  });
});
