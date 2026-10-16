import { getPlaceMapLinks } from './mapLinks';

describe('getPlaceMapLinks — phân biệt hồ sơ đã xác nhận / tìm kiếm / toạ độ tham khảo / chỉ đường', () => {
  it('KHÔNG có Place ID, CÓ địa chỉ: primary là tìm kiếm theo tên+địa chỉ, primaryCertain=false', () => {
    const links = getPlaceMapLinks(
      { lat: 10.0572576, lng: 104.0363948, name: 'Bãi Sao', address: 'An Thới, Phú Quốc' },
      'vi',
    );
    expect(links).not.toBeNull();
    expect(links!.primaryCertain).toBe(false);
    expect(links!.primary.url).toBe(
      'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent('Bãi Sao, An Thới, Phú Quốc'),
    );
    expect(links!.primary.label).toBe('Tìm trên Google Maps →');
    expect(links!.referencePin).not.toBeNull(); // chưa xác nhận -> vẫn giữ fallback toạ độ tham khảo
    expect(links!.referencePin!.url).toBe('https://www.google.com/maps?q=10.0572576,104.0363948');
    expect(links!.directions.url).toBe('https://www.google.com/maps/dir/?api=1&destination=10.0572576,104.0363948');
  });

  it('KHÔNG có Place ID, KHÔNG có địa chỉ: tìm kiếm theo tên + bù ngữ cảnh "Phú Quốc" (tránh trùng tên nơi khác)', () => {
    const links = getPlaceMapLinks({ lat: 10.0572576, lng: 104.0363948, name: 'Bãi Sao', address: null }, 'vi');
    expect(links!.primary.url).toBe(
      'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent('Bãi Sao, Phú Quốc, Việt Nam'),
    );
  });

  it('locale=en, KHÔNG có địa chỉ: ngữ cảnh bù thêm cũng bằng tiếng Anh ("Phú Quốc, Vietnam")', () => {
    const links = getPlaceMapLinks({ lat: 10.0572576, lng: 104.0363948, name: 'Sao Beach', address: null }, 'en');
    expect(links!.primary.url).toBe(
      'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent('Sao Beach, Phú Quốc, Vietnam'),
    );
  });

  it('CÓ Place ID: primary mở đúng hồ sơ, primaryCertain=true, kèm query_place_id/destination_place_id, KHÔNG còn referencePin (một nút chính là đủ)', () => {
    const links = getPlaceMapLinks(
      { lat: 10.1288141, lng: 103.9807506, name: 'Novotel Phú Quốc Resort', address: null, googlePlaceId: 'ChIJ_testPlaceId123' },
      'vi',
    );
    expect(links!.primaryCertain).toBe(true);
    expect(links!.primary.label).toBe('Xem trên Google Maps →');
    expect(links!.primary.url).toContain('query_place_id=ChIJ_testPlaceId123');
    expect(links!.directions.url).toContain('destination_place_id=ChIJ_testPlaceId123');
    expect(links!.referencePin).toBeNull();
  });

  it('Thiếu toạ độ hợp lệ (NaN) → trả null, không dựng link nào', () => {
    expect(getPlaceMapLinks({ lat: NaN, lng: 104, name: 'X', address: null }, 'vi')).toBeNull();
  });

  it('Toạ độ ngoài phạm vi hợp lệ (vd lat>90) → trả null', () => {
    expect(getPlaceMapLinks({ lat: 999, lng: 104, name: 'X', address: null }, 'vi')).toBeNull();
  });

  it('Tên có dấu/ký tự đặc biệt (&, dấu phẩy) được encode đúng, không làm hỏng URL', () => {
    const links = getPlaceMapLinks(
      { lat: 10, lng: 104, name: 'Nhà hàng Ra Khơi & Bạn', address: 'Đường 30/4, Dương Đông' },
      'vi',
    );
    const decoded = decodeURIComponent(links!.primary.url.split('query=')[1]);
    expect(decoded).toBe('Nhà hàng Ra Khơi & Bạn, Đường 30/4, Dương Đông');
  });

  it('locale=en: nhãn tiếng Anh đúng, cùng URL logic', () => {
    const links = getPlaceMapLinks({ lat: 10, lng: 104, name: 'Bai Sao', address: null }, 'en');
    expect(links!.primary.label).toBe('Find on Google Maps →');
    expect(links!.referencePin!.label).toBe('View reference location');
    expect(links!.directions.label).toBe('Directions →');
  });
});
