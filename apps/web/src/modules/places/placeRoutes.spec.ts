import { categorySlugOfPlace, placeDetailHref, placeDetailPath, specialisedRouteFor } from './placeRoutes';

describe('specialisedRouteFor', () => {
  it('hotel và resort đều vào route khách sạn', () => {
    expect(specialisedRouteFor('hotel')).toBe('hotels');
    expect(specialisedRouteFor('resort')).toBe('hotels');
  });

  it('restaurant và tour có route chuyên biệt riêng', () => {
    expect(specialisedRouteFor('restaurant')).toBe('restaurants');
    expect(specialisedRouteFor('tour')).toBe('tours');
  });

  it('beach, attraction, market, cafe không có route chuyên biệt → null (giữ route chung)', () => {
    expect(specialisedRouteFor('beach')).toBeNull();
    expect(specialisedRouteFor('attraction')).toBeNull();
    expect(specialisedRouteFor('market')).toBeNull();
    expect(specialisedRouteFor('cafe')).toBeNull();
  });

  it('category không biết, null, undefined, chuỗi rỗng → null (không đoán)', () => {
    expect(specialisedRouteFor('chua-biet')).toBeNull();
    expect(specialisedRouteFor(null)).toBeNull();
    expect(specialisedRouteFor(undefined)).toBeNull();
    expect(specialisedRouteFor('')).toBeNull();
  });
});

describe('placeDetailPath (không có locale)', () => {
  it('khách sạn → /hotels/{slug}', () => {
    expect(placeDetailPath('novotel-phu-quoc', 'hotel')).toBe('/hotels/novotel-phu-quoc');
  });

  it('nhà hàng → /restaurants/{slug}', () => {
    expect(placeDetailPath('nha-hang-ra-khoi', 'restaurant')).toBe('/restaurants/nha-hang-ra-khoi');
  });

  it('bãi biển và category chưa biết → /places/{slug} (route chung, không đổi hành vi cũ)', () => {
    expect(placeDetailPath('bai-sao', 'beach')).toBe('/places/bai-sao');
    expect(placeDetailPath('x', undefined)).toBe('/places/x');
  });
});

describe('placeDetailHref (có locale)', () => {
  it('vi → tiền tố /vi', () => {
    expect(placeDetailHref('vi', 'novotel-phu-quoc', 'hotel')).toBe('/vi/hotels/novotel-phu-quoc');
  });

  it('en → tiền tố /en, giữ nguyên route chuyên biệt', () => {
    expect(placeDetailHref('en', 'nha-hang-ra-khoi', 'restaurant')).toBe('/en/restaurants/nha-hang-ra-khoi');
  });

  it('bãi biển en → /en/places/{slug}', () => {
    expect(placeDetailHref('en', 'bai-sao', 'beach')).toBe('/en/places/bai-sao');
  });
});

describe('categorySlugOfPlace', () => {
  const lookup = (id: string) => (id === 'c-hotel' ? 'hotel' : null);

  it('ưu tiên category_slug có sẵn trên object (PlaceDetail)', () => {
    expect(categorySlugOfPlace({ category_id: 'c-other', category_slug: 'restaurant' }, lookup)).toBe('restaurant');
  });

  it('không có category_slug (PlaceCard từ list) → tra qua category_id', () => {
    expect(categorySlugOfPlace({ category_id: 'c-hotel' }, lookup)).toBe('hotel');
  });

  it('không có cả hai → null', () => {
    expect(categorySlugOfPlace({ category_id: 'c-unknown' }, lookup)).toBeNull();
  });
});
