import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreatePlaceDto, ListPlacesQueryDto, UpdatePlaceDto } from './places.dto';
import { PriceRange } from '../place.enums';
import { PHU_QUOC_BOUNDS } from '../../../common/geo-bounds';

// Khớp cấu hình ValidationPipe toàn cục ở main.ts.
const PIPE_OPTIONS = { whitelist: true, forbidNonWhitelisted: true } as const;

function validateQuery(raw: Record<string, unknown>) {
  return validate(plainToInstance(ListPlacesQueryDto, raw), PIPE_OPTIONS);
}

// Base hợp lệ để cô lập lỗi ở trường `location`.
const VALID_UUID = '11111111-1111-4111-8111-111111111111';
function validateCreate(location: unknown) {
  const dto = plainToInstance(CreatePlaceDto, {
    name: 'Bãi Sao',
    category_id: VALID_UUID,
    location,
  });
  return validate(dto, PIPE_OPTIONS);
}

describe('ListPlacesQueryDto — query công khai (GAP-04)', () => {
  it('từ chối `status` (không cho lọc nội dung chưa kiểm duyệt qua kênh công khai)', async () => {
    const errors = await validateQuery({ status: 'pending' });

    expect(errors).toHaveLength(1);
    expect(errors[0].property).toBe('status');
  });

  it('từ chối `status=published` — trường này không còn thuộc contract công khai', async () => {
    // Chặn cả giá trị "vô hại": whitelist là danh sách trường, không phải danh sách giá trị.
    const errors = await validateQuery({ status: 'published' });

    expect(errors).toHaveLength(1);
    expect(errors[0].property).toBe('status');
  });

  it('chấp nhận bộ lọc công khai hợp lệ', async () => {
    const errors = await validateQuery({
      category: 'c1',
      ward: 'An Thới',
      price_range: PriceRange.LOW,
      page: 2,
      limit: 20,
    });

    expect(errors).toHaveLength(0);
  });

  it('chấp nhận query rỗng (mọi bộ lọc đều optional)', async () => {
    expect(await validateQuery({})).toHaveLength(0);
  });

  it('vẫn từ chối price_range sai enum', async () => {
    const errors = await validateQuery({ price_range: 'luxury' });

    expect(errors).toHaveLength(1);
    expect(errors[0].property).toBe('price_range');
  });

  it('ép kiểu page/limit từ chuỗi query string sang số', async () => {
    const dto = plainToInstance(ListPlacesQueryDto, { page: '2', limit: '50' });

    expect(dto.page).toBe(2);
    expect(dto.limit).toBe(50);
    expect(await validate(dto, PIPE_OPTIONS)).toHaveLength(0);
  });
});

// OD-F-1 (F1-C, 2026-07-23): hộp Phú Quốc là PROVISIONAL nên KHÔNG còn từ chối. Bốn spec
// dưới đây trước kia khẳng định "từ chối ngoài hộp" (GAP-07/PLACE-002) và nay khẳng định điều
// NGƯỢC LẠI — đó chính là hành vi được chủ sở hữu phê duyệt, không phải test bị nới lỏng:
// mỗi spec vẫn kiểm chứng một mệnh đề chặt, chỉ là mệnh đề đã đổi theo quyết định.
describe('GeoPointDto — hộp Phú Quốc PROVISIONAL: cảnh báo, KHÔNG từ chối (F-1/OD-F-1)', () => {
  it('chấp nhận toạ độ hợp lệ trong Phú Quốc (Dương Đông)', async () => {
    expect(await validateCreate({ lat: 10.2145, lng: 103.9603 })).toHaveLength(0);
  });

  it('CHẤP NHẬN vĩ độ ngoài bao Phú Quốc (trước OD-F-1 bị từ chối)', async () => {
    expect(await validateCreate({ lat: 10.9, lng: 103.96 })).toHaveLength(0);
  });

  it('CHẤP NHẬN kinh độ ngoài bao Phú Quốc (đất liền, lng ~105)', async () => {
    expect(await validateCreate({ lat: 10.2, lng: 105.08 })).toHaveLength(0);
  });

  it('CHẤP NHẬN toạ độ ngoài hộp nhưng hợp lệ toàn cầu (Paris) — hộp không còn là cổng chặn', async () => {
    expect(await validateCreate({ lat: 48.8566, lng: 2.3522 })).toHaveLength(0);
  });

  it('chấp nhận giá trị biên (bao gồm cận trên)', async () => {
    expect(
      await validateCreate({ lat: PHU_QUOC_BOUNDS.maxLat, lng: PHU_QUOC_BOUNDS.maxLng }),
    ).toHaveLength(0);
  });

  it('CHẤP NHẬN ngay ngoài cận trên một chút (Thổ Chu và ven biển không còn bị chặn)', async () => {
    expect(
      await validateCreate({ lat: PHU_QUOC_BOUNDS.maxLat + 0.01, lng: PHU_QUOC_BOUNDS.maxLng }),
    ).toHaveLength(0);
  });

  // Ranh giới KHÔNG được nới: toạ độ sai toàn cầu vẫn phải bị từ chối bởi @Min/@Max/@IsNumber.
  it('VẪN TỪ CHỐI vĩ độ ngoài dải Trái Đất (lat 91)', async () => {
    const errors = await validateCreate({ lat: 91, lng: 103.96 });
    expect(errors.map((e) => e.property)).toContain('location');
  });

  it('VẪN TỪ CHỐI kinh độ ngoài dải Trái Đất (lng 181)', async () => {
    const errors = await validateCreate({ lat: 10.2, lng: 181 });
    expect(errors.map((e) => e.property)).toContain('location');
  });

  it('VẪN TỪ CHỐI toạ độ dị dạng (NaN / chuỗi không phải số)', async () => {
    expect((await validateCreate({ lat: Number.NaN, lng: 103.96 })).map((e) => e.property)).toContain(
      'location',
    );
    expect(
      (await validateCreate({ lat: 'mười' as unknown as number, lng: 103.96 })).map((e) => e.property),
    ).toContain('location');
  });
});

// ---------------------------------------------------------------------------
// GAP-14 — cấu trúc opening_hours theo places.md §4 (PLACE-006)
// ---------------------------------------------------------------------------

const VALID_LOCATION = { lat: 10.05, lng: 104.0 };

function validateOpeningHours(opening_hours: unknown) {
  const dto = plainToInstance(CreatePlaceDto, {
    name: 'Bãi Sao',
    category_id: VALID_UUID,
    location: VALID_LOCATION,
    opening_hours,
  });
  return validate(dto, PIPE_OPTIONS);
}

function validateUpdateOpeningHours(opening_hours: unknown) {
  return validate(plainToInstance(UpdatePlaceDto, { opening_hours }), PIPE_OPTIONS);
}

// Trích NGUYÊN VĂN từ docs/data/modules/places.md §4 — nếu ca này hỏng thì validator đã
// chặt hơn SSOT, tức là sai.
const SSOT_EXAMPLE = {
  timezone: 'Asia/Ho_Chi_Minh',
  regular: {
    mon: [{ open: '08:00', close: '22:00' }],
    tue: [{ open: '08:00', close: '22:00' }],
    wed: [{ open: '08:00', close: '22:00' }],
    thu: [{ open: '08:00', close: '22:00' }],
    fri: [{ open: '08:00', close: '23:00' }],
    sat: [{ open: '07:00', close: '23:00' }],
    sun: [],
  },
  is_24h: false,
  exceptions: [
    { date: '2026-01-01', closed: true, note: 'Nghỉ Tết Dương lịch' },
    { date: '2026-02-17', hours: [{ open: '10:00', close: '20:00' }] },
  ],
  note: 'Bếp ngừng nhận order trước giờ đóng 30 phút',
};

describe('CreatePlaceDto.opening_hours — cấu trúc places.md §4 (GAP-14)', () => {
  it('chấp nhận payload mẫu của SSOT nguyên văn', async () => {
    expect(await validateOpeningHours(SSOT_EXAMPLE)).toHaveLength(0);
  });

  it('opening_hours vẫn là TÙY CHỌN (bỏ trống là hợp lệ)', async () => {
    const dto = plainToInstance(CreatePlaceDto, {
      name: 'Bãi Sao',
      category_id: VALID_UUID,
      location: VALID_LOCATION,
    });
    expect(await validate(dto, PIPE_OPTIONS)).toHaveLength(0);
  });

  it('object rỗng hợp lệ — SSOT không đánh dấu trường nào bắt buộc', async () => {
    expect(await validateOpeningHours({})).toHaveLength(0);
  });

  it('ngày đóng cửa = mảng rỗng vẫn hợp lệ', async () => {
    expect(await validateOpeningHours({ regular: { sun: [] } })).toHaveLength(0);
  });

  it('is_24h = true hợp lệ', async () => {
    expect(await validateOpeningHours({ is_24h: true })).toHaveLength(0);
  });

  it('khung qua đêm (22:00–02:00) hợp lệ — KHÔNG ép open < close', async () => {
    const errors = await validateOpeningHours({
      regular: { fri: [{ open: '22:00', close: '02:00' }] },
    });
    expect(errors).toHaveLength(0);
  });

  it('nhiều khung trong ngày (nghỉ trưa) hợp lệ', async () => {
    const errors = await validateOpeningHours({
      regular: {
        mon: [
          { open: '08:00', close: '11:30' },
          { open: '13:30', close: '22:00' },
        ],
      },
    });
    expect(errors).toHaveLength(0);
  });

  it('khoá lạ ở cấp cao nhất được chấp nhận (openapi additionalProperties: true)', async () => {
    expect(await validateOpeningHours({ ...SSOT_EXAMPLE, source: 'osm' })).toHaveLength(0);
  });

  it('từ chối regular.mon là chuỗi thay vì mảng khung giờ', async () => {
    const errors = await validateOpeningHours({ regular: { mon: '08:00' } });
    expect(errors.map((e) => e.property)).toContain('opening_hours');
  });

  it('từ chối giờ sai định dạng HH:MM', async () => {
    const errors = await validateOpeningHours({
      regular: { mon: [{ open: '8h', close: '22:00' }] },
    });
    expect(errors.map((e) => e.property)).toContain('opening_hours');
  });

  it('từ chối giờ ngoài miền (25:00)', async () => {
    const errors = await validateOpeningHours({
      regular: { mon: [{ open: '25:00', close: '26:00' }] },
    });
    expect(errors.map((e) => e.property)).toContain('opening_hours');
  });

  it('từ chối thứ không hợp lệ trong regular', async () => {
    const errors = await validateOpeningHours({ regular: { monday: [] } });
    expect(errors.map((e) => e.property)).toContain('opening_hours');
  });

  it('từ chối exceptions không phải mảng', async () => {
    const errors = await validateOpeningHours({ exceptions: { date: '2026-01-01' } });
    expect(errors.map((e) => e.property)).toContain('opening_hours');
  });

  it('từ chối exceptions[].date sai định dạng YYYY-MM-DD', async () => {
    const errors = await validateOpeningHours({ exceptions: [{ date: '01/01/2026' }] });
    expect(errors.map((e) => e.property)).toContain('opening_hours');
  });

  it('từ chối is_24h không phải boolean', async () => {
    const errors = await validateOpeningHours({ is_24h: 'yes' });
    expect(errors.map((e) => e.property)).toContain('opening_hours');
  });

  it('thông điệp lỗi chỉ ra ĐÚNG đường dẫn trường sai', async () => {
    const errors = await validateOpeningHours({ regular: { mon: [{ open: '8h', close: '22:00' }] } });
    expect(JSON.stringify(errors)).toContain('opening_hours.regular.mon[0].open');
  });
});

describe('UpdatePlaceDto.opening_hours — cùng ràng buộc (không để hở đường ghi)', () => {
  it('chấp nhận payload mẫu SSOT', async () => {
    expect(await validateUpdateOpeningHours(SSOT_EXAMPLE)).toHaveLength(0);
  });

  it('từ chối cấu trúc sai giống Create', async () => {
    const errors = await validateUpdateOpeningHours({ regular: { mon: '08:00' } });
    expect(errors.map((e) => e.property)).toContain('opening_hours');
  });
});
