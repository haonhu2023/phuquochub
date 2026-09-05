// MVP SEO pass: no structured data (JSON-LD) existed anywhere in this app before this (confirmed
// absent, PLACE-036/041 grep). Builds schema.org objects from data these pages already fetch --
// never fabricates a field the API didn't actually return.
import type { PlaceDetail } from '@/modules/places/types';
import type { HotelDetail } from '@/modules/hotels/api/hotels.api';
import type { RestaurantDetail } from '@/modules/restaurants/api/restaurants.api';
import type { TourDetail } from '@/modules/tours/api/tours.api';
import type { EventDetail } from '@/modules/events/api/events.api';
import { getSiteUrl } from './site';
import { localizedHref, type Locale } from './locale';
import { hasOpeningHours, regularOf, validRanges, WEEKDAY_KEYS, type WeekdayKey } from '@/modules/places/openingHours';

type JsonLd = Record<string, unknown>;

// Community-contributed fields (name/description) could contain `</script>` -- JSON.stringify
// does NOT escape that sequence, so injecting it raw into a <script> tag via
// dangerouslySetInnerHTML could break out of the tag. Escaping `<` as < (still valid,
// semantically identical JSON) closes that hole; this is the standard safe pattern for inline
// JSON-LD, not a new one invented here.
export function serializeJsonLd(data: JsonLd): string {
  return JSON.stringify(data).replace(/</g, '\\u003c');
}

const SCHEMA_LANGUAGE: Record<Locale, string> = { vi: 'vi-VN', en: 'en-US' };

/**
 * JSON-LD trang chủ. CHỈ `WebSite` — CỐ Ý KHÔNG phát `Organization`/`LocalBusiness`: những kiểu đó
 * đòi các dữ kiện pháp nhân (logo, địa chỉ, mạng xã hội, số đăng ký) mà repo này không có nguồn
 * nào xác thực được, và bịa ra chúng là đúng thứ mà kỷ luật "không suy diễn khi không có bằng
 * chứng" của file này cấm.
 *
 * `potentialAction` trỏ tới `/{locale}/search?q=` — endpoint tìm kiếm CÓ THẬT của ứng dụng
 * (`app/[locale]/(public)/search/page.tsx` đọc đúng tham số `q`), không phải một khai báo lấy lệ.
 *
 * `locale` (SEO v2): trước đây `inLanguage`/`url`/`potentialAction.target` đều hằng-số tiếng Việt
 * bất kể trang chủ đang phục vụ `/vi` hay `/en` — JSON-LD của một trang `/en` do đó tự mâu thuẫn
 * với chính `<html lang="en">` render cùng lúc. Nhận `locale` để cả ba trường khớp ĐÚNG bản đang
 * hiển thị.
 */
export function buildWebSiteJsonLd(name: string, description: string, locale: Locale): JsonLd {
  const site = getSiteUrl();
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name,
    description,
    url: `${site}${localizedHref(locale, '/')}`,
    inLanguage: SCHEMA_LANGUAGE[locale],
    potentialAction: {
      '@type': 'SearchAction',
      target: {
        '@type': 'EntryPoint',
        urlTemplate: `${site}${localizedHref(locale, '/search')}?q={search_term_string}`,
      },
      'query-input': 'required name=search_term_string',
    },
  };
}

/**
 * `PostalAddress` dựng TỪ dữ liệu canonical của Place — không hard-code địa danh hành chính.
 *
 * Trước đây hàm này gắn cứng `addressRegion: 'Kiên Giang'` cho MỌI place. Giá trị đó đã SAI kể từ
 * 01/7/2025: Nghị quyết 1654/NQ-UBTVQH15 nhập 2 phường + 6 xã của Phú Quốc thành một `đặc khu Phú
 * Quốc` thuộc tỉnh **An Giang**. Và vì nó là hằng số trong code chứ không phải dữ liệu, không có
 * cột nào sửa được nó — mọi trang địa điểm đều phát đi một tỉnh không còn tồn tại cho công cụ tìm
 * kiếm đọc.
 *
 * Ba quyết định ánh xạ, ghi lại để không bị "sửa nhầm" về như cũ:
 *
 *  1. `addressRegion` ← `place.province`. `null` thì **BỎ HẲN trường**, không thay bằng mặc định
 *     nào. Cả 49 place hiện có đều chưa xác minh đơn vị hành chính (migration cố ý không backfill),
 *     nên hôm nay trường này vắng mặt ở mọi trang — đúng như vậy: thiếu một trường tuỳ chọn của
 *     schema.org chỉ làm giảm mức rich-result, còn khai một tỉnh sai là phát tán dữ liệu sai. Đây
 *     cũng chính là kỷ luật "không bịa trường mà API không trả về" ghi ở đầu file này.
 *  2. `addressLocality` ← `admin_area` (đơn vị hành chính) và LÙI VỀ `ward` khi chưa có. Lùi về
 *     `ward` giữ nguyên hành vi cũ cho tới khi dữ liệu hành chính được nhập, nên không có trang
 *     nào mất dữ liệu SEO đang có; `ward` vẫn là địa danh CÓ THẬT nên đây không phải phỏng đoán.
 *  3. `addressCountry: 'VN'` VẪN là hằng số — có chủ ý, không phải sót. Quốc gia không nằm trong
 *     diện sắp xếp đơn vị hành chính và một địa điểm ở Phú Quốc không thể rời khỏi Việt Nam; thứ
 *     đã đổi (và sẽ còn đổi) là cấp tỉnh/xã, và đúng hai cấp đó nay lấy từ dữ liệu.
 */
function postalAddress(place: PlaceDetail): JsonLd | null {
  const locality = place.admin_area ?? place.ward;
  if (!place.address && !locality && !place.province) return null;
  return {
    '@type': 'PostalAddress',
    ...(place.address ? { streetAddress: place.address } : {}),
    ...(locality ? { addressLocality: locality } : {}),
    ...(place.province ? { addressRegion: place.province } : {}),
    addressCountry: 'VN',
  };
}

function baseLocationFields(place: PlaceDetail, path: string): JsonLd {
  const site = getSiteUrl();
  const fields: JsonLd = {
    name: place.name,
    url: `${site}${path}`,
  };
  if (place.short_description ?? place.description) {
    fields.description = place.short_description ?? place.description;
  }
  if (place.cover_image_url) {
    fields.image = place.cover_image_url;
  }
  const address = postalAddress(place);
  if (address) {
    fields.address = address;
  }
  if (place.location) {
    fields.geo = {
      '@type': 'GeoCoordinates',
      latitude: place.location.lat,
      longitude: place.location.lng,
    };
  }
  if (place.rating_avg !== null && place.rating_count > 0) {
    fields.aggregateRating = {
      '@type': 'AggregateRating',
      ratingValue: place.rating_avg,
      reviewCount: place.rating_count,
    };
  }
  return fields;
}

const SCHEMA_DAY: Record<WeekdayKey, string> = {
  mon: 'https://schema.org/Monday',
  tue: 'https://schema.org/Tuesday',
  wed: 'https://schema.org/Wednesday',
  thu: 'https://schema.org/Thursday',
  fri: 'https://schema.org/Friday',
  sat: 'https://schema.org/Saturday',
  sun: 'https://schema.org/Sunday',
};

/**
 * `openingHoursSpecification` — CHỈ lịch tuần thường (`regular`), dùng LẠI `validRanges()` từ
 * `modules/places/openingHours.ts` (cùng định nghĩa "khung giờ hợp lệ" với phần hiển thị, xem chú
 * thích ở đó). Ngoại lệ theo ngày (`exceptions`) CỐ Ý không đưa vào: schema.org có
 * `specialOpeningHoursSpecification` cho việc đó nhưng đòi `validFrom`/`validThrough` — một mở
 * rộng riêng, ngoài phạm vi lượt này (chỉ lịch tuần đều đặn).
 *
 * `undefined` khi không có gì để phát (is_24h không rõ ràng cần một dạng khác — 24/7 dùng
 * `dayOfWeek` phủ cả 7 ngày, `opens: 00:00`, `closes: 23:59`, quy ước phổ biến cho rich results).
 */
function openingHoursSpecification(oh: PlaceDetail['opening_hours']): JsonLd[] | undefined {
  if (!hasOpeningHours(oh)) return undefined;

  if (oh!.is_24h === true) {
    return [
      {
        '@type': 'OpeningHoursSpecification',
        dayOfWeek: WEEKDAY_KEYS.map((d) => SCHEMA_DAY[d]),
        opens: '00:00',
        closes: '23:59',
      },
    ];
  }

  const regular = regularOf(oh!);
  if (!regular) return undefined;

  const specs: JsonLd[] = [];
  for (const day of WEEKDAY_KEYS) {
    const ranges = validRanges(regular[day]);
    for (const range of ranges) {
      specs.push({
        '@type': 'OpeningHoursSpecification',
        dayOfWeek: SCHEMA_DAY[day],
        opens: range.open,
        closes: range.close,
      });
    }
  }
  return specs.length > 0 ? specs : undefined;
}

/**
 * Số điện thoại đầu tiên đọc được từ `contacts` — CÙNG bộ nhận dạng "đây là số điện thoại" mà
 * trang chi tiết đã dùng để dựng link `tel:` (`contactHref`, `places/[slug]/page.tsx`), để
 * `telephone` trong JSON-LD và số hiển thị cho người đọc luôn là MỘT nguồn, không lệch nhau.
 */
function telephoneOf(contacts: PlaceDetail['contacts']): string | undefined {
  const phone = contacts.find(
    (c) => /phone|hotline|mobile|tel|zalo/i.test(c.contact_type) && /^[+\d][\d\s().-]+$/.test(c.value),
  );
  return phone?.value;
}

export function buildPlaceJsonLd(place: PlaceDetail): JsonLd {
  const fields = baseLocationFields(place, `/places/${place.slug}`);
  const hours = openingHoursSpecification(place.opening_hours);
  if (hours) {
    fields.openingHoursSpecification = hours;
  }
  const telephone = telephoneOf(place.contacts);
  if (telephone) {
    fields.telephone = telephone;
  }
  return {
    '@context': 'https://schema.org',
    '@type': 'TouristAttraction',
    ...fields,
  };
}

export interface BreadcrumbItem {
  name: string;
  path: string;
}

/**
 * `BreadcrumbList` (Phase 23) — dựng TỪ cùng danh sách mắt breadcrumb mà trang đã hiển thị cho
 * người dùng (không phải một cấu trúc điều hướng riêng chỉ tồn tại trong JSON-LD, thứ Google coi
 * là spam schema nếu không khớp nội dung nhìn thấy được). `path` là đường dẫn ĐÃ có locale prefix
 * (`localizedHref(locale, ...)`, nơi gọi tự ghép) — hàm này chỉ nối `getSiteUrl()` phía trước.
 */
export function buildBreadcrumbJsonLd(items: BreadcrumbItem[]): JsonLd {
  const site = getSiteUrl();
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: `${site}${item.path}`,
    })),
  };
}

export function buildHotelJsonLd(hotel: HotelDetail): JsonLd {
  return {
    '@context': 'https://schema.org',
    '@type': 'LodgingBusiness',
    ...baseLocationFields(hotel, `/hotels/${hotel.slug}`),
  };
}

export function buildRestaurantJsonLd(restaurant: RestaurantDetail): JsonLd {
  const fields = baseLocationFields(restaurant, `/restaurants/${restaurant.slug}`);
  if (restaurant.cuisines.length > 0) {
    fields.servesCuisine = restaurant.cuisines;
  }
  return {
    '@context': 'https://schema.org',
    '@type': 'Restaurant',
    ...fields,
  };
}

export function buildTourJsonLd(tour: TourDetail): JsonLd {
  return {
    '@context': 'https://schema.org',
    '@type': 'TouristTrip',
    ...baseLocationFields(tour, `/tours/${tour.slug}`),
  };
}

export function buildEventJsonLd(event: EventDetail): JsonLd {
  const site = getSiteUrl();
  const fields: JsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Event',
    name: event.title,
    url: `${site}/events/${event.slug}`,
    startDate: event.start_at,
    endDate: event.end_at,
    eventStatus: 'https://schema.org/EventScheduled',
    eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
  };
  if (event.description) {
    fields.description = event.description;
  }
  // Deliberately no `location` field: EventDetail carries only `place_id` (a UUID), not the
  // place's own name/address/geo -- fabricating a location here would violate this repository's
  // own no-speculation-without-evidence discipline. Google's structured-data guidelines tolerate
  // an Event without `location` (the rich-result eligibility is simply reduced, not an error).
  return fields;
}
