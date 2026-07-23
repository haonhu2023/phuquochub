import { toPlaceDetail } from './places.mapper';
import { PlaceStatus } from './place.enums';
import type { PlaceDetailRow } from './repositories/places.repository';

describe('toPlaceDetail', () => {
  const baseRow: PlaceDetailRow = {
    id: 'p1',
    name: 'Bãi Sao',
    slug: 'bai-sao',
    category_id: 'c1',
    short_description: 'Bãi biển',
    price_range: null,
    cover_image_url: null,
    rating_avg: '4.5',
    rating_count: 10,
    verification_status: 'pending',
    status: PlaceStatus.PUBLISHED,
    lat: 10.0466,
    lng: 104.0281,
    address: 'An Thới',
    ward: 'An Thới',
    description: 'Cát trắng',
    opening_hours: null,
    osm_id: '123456789',
    created_at: new Date('2026-01-01T00:00:00Z'),
    updated_at: new Date('2026-01-02T00:00:00Z'),
  };

  it('mở rộng card + scalar chi tiết; osm_id string → number', () => {
    const d = toPlaceDetail(baseRow);
    expect(d.slug).toBe('bai-sao');
    expect(d.location).toEqual({ lat: 10.0466, lng: 104.0281 });
    expect(d.address).toBe('An Thới');
    expect(d.osm_id).toBe(123456789);
    expect(d.opening_hours).toBeNull();
  });

  it('osm_id null giữ null', () => {
    expect(toPlaceDetail({ ...baseRow, osm_id: null }).osm_id).toBeNull();
  });
});
