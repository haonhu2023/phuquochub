import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ListTransportsQueryDto } from './transports.dto';

// Khớp cấu hình ValidationPipe toàn cục ở main.ts.
const PIPE_OPTIONS = { whitelist: true, forbidNonWhitelisted: true } as const;

function validateQuery(raw: Record<string, unknown>) {
  return validate(plainToInstance(ListTransportsQueryDto, raw), PIPE_OPTIONS);
}

describe('ListTransportsQueryDto', () => {
  it('rỗng → hợp lệ (mọi trường tuỳ chọn)', async () => {
    expect(await validateQuery({})).toHaveLength(0);
  });

  it.each(['rating_desc', 'name_asc', 'newest'])('sort=%s hợp lệ', async (sort) => {
    expect(await validateQuery({ sort })).toHaveLength(0);
  });

  it('từ chối sort ngoài whitelist — client không tự chọn cột/hướng', async () => {
    const errors = await validateQuery({ sort: 'price_asc' });
    expect(errors.some((e) => e.property === 'sort')).toBe(true);
  });

  it('page/limit: chuỗi số → number (@Type)', async () => {
    const dto = plainToInstance(ListTransportsQueryDto, { page: '2', limit: '10' });
    expect(dto.page).toBe(2);
    expect(dto.limit).toBe(10);
    expect(await validate(dto, PIPE_OPTIONS)).toHaveLength(0);
  });

  it.each([
    ['page', '0'],
    ['page', '-1'],
    ['page', 'abc'],
    ['limit', '0'],
    ['limit', 'abc'],
  ])('từ chối %s=%p (không phải số nguyên ≥ 1)', async (prop, value) => {
    const errors = await validateQuery({ [prop]: value });
    expect(errors.some((e) => e.property === prop)).toBe(true);
  });

  // Các tham số đã liệt kê hoãn/không hỗ trợ ở transport.md §8 (category đã là chính endpoint
  // này; district/capacity_min/capacity_max/provider chưa có dữ liệu/cột thật) — vẫn phải bị từ
  // chối 400, không âm thầm bỏ qua, dù transport_type/ward/pricing_model/booking_required/
  // airport_transfer nay ĐÃ được hỗ trợ (Transport Browse Filters, 2026-07-30).
  it.each(['category', 'district', 'capacity_min', 'capacity_max', 'provider'])(
    'từ chối %s — vẫn hoãn/không hỗ trợ theo transport.md §8, không âm thầm bỏ qua',
    async (param) => {
      const errors = await validateQuery({ [param]: 'true' });
      expect(errors.some((e) => e.property === param)).toBe(true);
    },
  );

  // Transport Browse Filters (2026-07-30) — khớp đúng bảng tham số transport.md §8.
  describe('transport_type', () => {
    it('chấp nhận mã transport_types.code (chuỗi bất kỳ — khớp chính xác ở tầng repository)', async () => {
      expect(await validateQuery({ transport_type: 'taxi' })).toHaveLength(0);
    });
  });

  describe('ward', () => {
    it('chấp nhận text tự do', async () => {
      expect(await validateQuery({ ward: 'Dương Đông' })).toHaveLength(0);
    });
  });

  describe('pricing_model', () => {
    it.each(['fixed', 'starting_from', 'per_km', 'per_hour', 'per_person', 'per_vehicle', 'contact'])(
      'chấp nhận %s',
      async (pricingModel) => {
        expect(await validateQuery({ pricing_model: pricingModel })).toHaveLength(0);
      },
    );

    it('từ chối giá trị ngoài enum pricing_model', async () => {
      const errors = await validateQuery({ pricing_model: 'per_minute' });
      expect(errors.some((e) => e.property === 'pricing_model')).toBe(true);
    });
  });

  describe('booking_required / airport_transfer — tri-state boolean', () => {
    it.each(['booking_required', 'airport_transfer'])('%s=true → hợp lệ, coerce đúng thành boolean true', async (field) => {
      const dto = plainToInstance(ListTransportsQueryDto, { [field]: 'true' });
      expect((dto as unknown as Record<string, unknown>)[field]).toBe(true);
      expect(await validate(dto, PIPE_OPTIONS)).toHaveLength(0);
    });

    it.each(['booking_required', 'airport_transfer'])('%s=false → hợp lệ, coerce đúng thành boolean false (không phải chuỗi "false")', async (field) => {
      const dto = plainToInstance(ListTransportsQueryDto, { [field]: 'false' });
      expect((dto as unknown as Record<string, unknown>)[field]).toBe(false);
      expect(await validate(dto, PIPE_OPTIONS)).toHaveLength(0);
    });

    it.each(['booking_required', 'airport_transfer'])(
      '%s=yes (không phải "true"/"false") → từ chối, KHÔNG coerce sai (tránh lỗi Boolean("false")===true kinh điển)',
      async (field) => {
        const errors = await validateQuery({ [field]: 'yes' });
        expect(errors.some((e) => e.property === field)).toBe(true);
      },
    );
  });

  it('chấp nhận kết hợp đầy đủ cả 5 bộ lọc cùng lúc', async () => {
    const errors = await validateQuery({
      transport_type: 'ferry',
      ward: 'An Thới',
      pricing_model: 'per_person',
      booking_required: 'true',
      airport_transfer: 'false',
    });
    expect(errors).toHaveLength(0);
  });
});
