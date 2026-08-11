// MVP SEO pass: no structured data (JSON-LD) existed anywhere in this app before this (confirmed
// absent, PLACE-036/041 grep). Builds schema.org objects from data these pages already fetch --
// never fabricates a field the API didn't actually return.
import type { PlaceDetail } from '@/modules/places/types';
import type { HotelDetail } from '@/modules/hotels/api/hotels.api';
import type { RestaurantDetail } from '@/modules/restaurants/api/restaurants.api';
import type { TourDetail } from '@/modules/tours/api/tours.api';
import type { EventDetail } from '@/modules/events/api/events.api';
import { getSiteUrl } from './site';

type JsonLd = Record<string, unknown>;

// Community-contributed fields (name/description) could contain `</script>` -- JSON.stringify
// does NOT escape that sequence, so injecting it raw into a <script> tag via
// dangerouslySetInnerHTML could break out of the tag. Escaping `<` as < (still valid,
// semantically identical JSON) closes that hole; this is the standard safe pattern for inline
// JSON-LD, not a new one invented here.
export function serializeJsonLd(data: JsonLd): string {
  return JSON.stringify(data).replace(/</g, '\\u003c');
}

/**
 * JSON-LD trang chủ. CHỈ `WebSite` — CỐ Ý KHÔNG phát `Organization`/`LocalBusiness`: những kiểu đó
 * đòi các dữ kiện pháp nhân (logo, địa chỉ, mạng xã hội, số đăng ký) mà repo này không có nguồn
 * nào xác thực được, và bịa ra chúng là đúng thứ mà kỷ luật "không suy diễn khi không có bằng
 * chứng" của file này cấm.
 *
 * `potentialAction` trỏ tới `/search?q=` — đây là endpoint tìm kiếm CÓ THẬT của ứng dụng
 * (`app/(public)/search/page.tsx` đọc đúng tham số `q`), không phải một khai báo lấy lệ.
 */
export function buildWebSiteJsonLd(name: string, description: string): JsonLd {
  const site = getSiteUrl();
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name,
    description,
    url: site,
    inLanguage: 'vi-VN',
    potentialAction: {
      '@type': 'SearchAction',
      target: {
        '@type': 'EntryPoint',
        urlTemplate: `${site}/search?q={search_term_string}`,
      },
      'query-input': 'required name=search_term_string',
    },
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
  if (place.address || place.ward) {
    fields.address = {
      '@type': 'PostalAddress',
      ...(place.address ? { streetAddress: place.address } : {}),
      ...(place.ward ? { addressLocality: place.ward } : {}),
      addressRegion: 'Kiên Giang',
      addressCountry: 'VN',
    };
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

export function buildPlaceJsonLd(place: PlaceDetail): JsonLd {
  return {
    '@context': 'https://schema.org',
    '@type': 'TouristAttraction',
    ...baseLocationFields(place, `/places/${place.slug}`),
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
