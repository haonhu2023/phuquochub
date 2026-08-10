import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { BboxQueryDto, NearbyQueryDto } from './geo.dto';
import { PHU_QUOC_BOUNDS } from '../../../common/geo-bounds';

// Khớp cấu hình ValidationPipe toàn cục ở main.ts.
const PIPE_OPTIONS = { whitelist: true, forbidNonWhitelisted: true } as const;

function validateDto<T extends object>(cls: new () => T, raw: Record<string, unknown>) {
  return validate(plainToInstance(cls, raw), PIPE_OPTIONS);
}

describe('NearbyQueryDto — validation biên Phú Quốc + trần radius (GAP-07)', () => {
  const validPoint = { lat: '10.2145', lng: '103.9603' }; // query string → ép kiểu số

  it('chấp nhận điểm hợp lệ trong Phú Quốc (không radius)', async () => {
    expect(await validateDto(NearbyQueryDto, { ...validPoint })).toHaveLength(0);
  });

  it('bỏ trống radius vẫn hợp lệ (mặc định do service áp)', async () => {
    const errors = await validateDto(NearbyQueryDto, { ...validPoint });
    expect(errors.map((e) => e.property)).not.toContain('radius');
  });

  it('chấp nhận radius trong trần', async () => {
    expect(await validateDto(NearbyQueryDto, { ...validPoint, radius: '2000' })).toHaveLength(0);
  });

  it('từ chối radius vượt trần (60000 > 50000)', async () => {
    const errors = await validateDto(NearbyQueryDto, { ...validPoint, radius: '60000' });
    expect(errors.map((e) => e.property)).toContain('radius');
  });

  // OD-F-1 (F1-C): hộp PROVISIONAL không còn từ chối. Đường ĐỌC cũng cố tình KHÔNG phát tín
  // hiệu (xem chú thích ở geo.dto.ts) — truy vấn ngoài hộp chỉ trả về rỗng, vô hại.
  it('CHẤP NHẬN vĩ độ ngoài Phú Quốc (trước OD-F-1 bị từ chối)', async () => {
    expect(await validateDto(NearbyQueryDto, { lat: '10.9', lng: '103.96' })).toHaveLength(0);
  });

  it('CHẤP NHẬN kinh độ ngoài Phú Quốc (đất liền ~105)', async () => {
    expect(await validateDto(NearbyQueryDto, { lat: '10.2', lng: '105.08' })).toHaveLength(0);
  });

  it('VẪN TỪ CHỐI vĩ độ ngoài dải Trái Đất (lat 91)', async () => {
    const errors = await validateDto(NearbyQueryDto, { lat: '91', lng: '103.96' });
    expect(errors.map((e) => e.property)).toContain('lat');
  });

  it('VẪN TỪ CHỐI kinh độ ngoài dải Trái Đất (lng 181)', async () => {
    const errors = await validateDto(NearbyQueryDto, { lat: '10.2', lng: '181' });
    expect(errors.map((e) => e.property)).toContain('lng');
  });

  it('VẪN TỪ CHỐI toạ độ dị dạng (không phải số)', async () => {
    const errors = await validateDto(NearbyQueryDto, { lat: 'mười', lng: '103.96' });
    expect(errors.map((e) => e.property)).toContain('lat');
  });
});

describe('BboxQueryDto — validation biên Phú Quốc (GAP-07)', () => {
  const validBbox = { minLng: '103.8', minLat: '10.0', maxLng: '104.1', maxLat: '10.4' };

  it('chấp nhận bbox hợp lệ trong Phú Quốc', async () => {
    expect(await validateDto(BboxQueryDto, { ...validBbox, zoom: '12' })).toHaveLength(0);
  });

  it('CHẤP NHẬN bbox có cạnh ngoài Phú Quốc (trước OD-F-1 bị từ chối)', async () => {
    expect(await validateDto(BboxQueryDto, { ...validBbox, maxLng: '105.2' })).toHaveLength(0);
  });

  it('VẪN TỪ CHỐI cạnh ngoài dải Trái Đất (maxLng 181)', async () => {
    const errors = await validateDto(BboxQueryDto, { ...validBbox, maxLng: '181' });
    expect(errors.map((e) => e.property)).toContain('maxLng');
  });

  it('chấp nhận giá trị biên inclusive', async () => {
    expect(
      await validateDto(BboxQueryDto, {
        minLng: PHU_QUOC_BOUNDS.minLng,
        minLat: PHU_QUOC_BOUNDS.minLat,
        maxLng: PHU_QUOC_BOUNDS.maxLng,
        maxLat: PHU_QUOC_BOUNDS.maxLat,
      }),
    ).toHaveLength(0);
  });

  // Search Filters trên bản đồ — category/ward optional, cùng convention ListPlacesQueryDto.
  it('chấp nhận category/ward tuỳ chọn', async () => {
    expect(
      await validateDto(BboxQueryDto, { ...validBbox, category: 'c1', ward: 'An Thới' }),
    ).toHaveLength(0);
  });

  it('bỏ trống category/ward vẫn hợp lệ (mặc định service không lọc)', async () => {
    const errors = await validateDto(BboxQueryDto, { ...validBbox });
    expect(errors.map((e) => e.property)).not.toContain('category');
    expect(errors.map((e) => e.property)).not.toContain('ward');
  });

  // Map Audit (2026-08-10): bbox lộn ngược (maxLng < minLng hoặc maxLat < minLat) trước đây
  // không bị DTO từ chối — mỗi cạnh chỉ tự kiểm tra biên Trái Đất độc lập.
  it('TỪ CHỐI bbox lộn ngược theo kinh độ (maxLng < minLng)', async () => {
    const errors = await validateDto(BboxQueryDto, { ...validBbox, minLng: '104.1', maxLng: '103.8' });
    expect(errors.map((e) => e.property)).toContain('maxLng');
  });

  it('TỪ CHỐI bbox lộn ngược theo vĩ độ (maxLat < minLat)', async () => {
    const errors = await validateDto(BboxQueryDto, { ...validBbox, minLat: '10.4', maxLat: '10.0' });
    expect(errors.map((e) => e.property)).toContain('maxLat');
  });

  it('chấp nhận bbox suy biến (min == max, cạnh 0 độ rộng)', async () => {
    expect(
      await validateDto(BboxQueryDto, { minLng: '103.9', minLat: '10.2', maxLng: '103.9', maxLat: '10.2' }),
    ).toHaveLength(0);
  });

  it('chấp nhận zoom trong trần (1..20, khớp GeoService.bbox() clamp)', async () => {
    expect(await validateDto(BboxQueryDto, { ...validBbox, zoom: '1' })).toHaveLength(0);
    expect(await validateDto(BboxQueryDto, { ...validBbox, zoom: '20' })).toHaveLength(0);
  });

  it('TỪ CHỐI zoom ngoài trần (0 và 21)', async () => {
    expect((await validateDto(BboxQueryDto, { ...validBbox, zoom: '0' })).map((e) => e.property)).toContain('zoom');
    expect((await validateDto(BboxQueryDto, { ...validBbox, zoom: '21' })).map((e) => e.property)).toContain('zoom');
  });
});
