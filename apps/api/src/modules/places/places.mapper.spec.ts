import { toPlaceCard } from './places.mapper';
import { PlaceCardRow } from './repositories/places.repository';
import { PlaceStatus } from './place.enums';

const baseRow: PlaceCardRow = {
  id: 'p1',
  name: 'Bãi Sao',
  slug: 'bai-sao',
  category_id: 'c1',
  short_description: 'Bãi biển đẹp',
  price_range: null,
  cover_image_url: null,
  rating_avg: '4.5',
  rating_count: 12,
  verification_status: 'verified',
  status: PlaceStatus.PUBLISHED,
  lat: 10.05,
  lng: 104.0,
};

describe('toPlaceCard', () => {
  it('map location thành {lat,lng} và ép kiểu số', () => {
    const card = toPlaceCard(baseRow);
    expect(card.location).toEqual({ lat: 10.05, lng: 104.0 });
    expect(card.rating_avg).toBe(4.5);
    expect(card.rating_count).toBe(12);
    expect(card.cover_image_url).toBeNull();
  });

  it('chỉ thêm distance_m khi có', () => {
    expect('distance_m' in toPlaceCard(baseRow)).toBe(false);
    const withDist = toPlaceCard({ ...baseRow, distance_m: 1200 });
    expect(withDist.distance_m).toBe(1200);
  });

  // F-17/OD-F-17: score là tín hiệu xếp hạng NỘI BỘ, không thuộc hợp đồng công khai.
  it('KHÔNG BAO GIỜ phát score ra card, kể cả khi row có score (hợp đồng công khai)', () => {
    expect('score' in toPlaceCard(baseRow)).toBe(false);
    expect('score' in toPlaceCard({ ...baseRow, score: 0.0607927 })).toBe(false);
  });

  // status là trạng thái XUẤT BẢN và luôn có mặt — nay đã được khai trong openapi PlaceCard.
  it('status luôn có mặt và giữ nguyên giá trị enum xuất bản', () => {
    expect(toPlaceCard(baseRow).status).toBe(baseRow.status);
    expect('status' in toPlaceCard(baseRow)).toBe(true);
  });

  it('rating_avg null giữ nguyên null', () => {
    expect(toPlaceCard({ ...baseRow, rating_avg: null }).rating_avg).toBeNull();
  });
});
