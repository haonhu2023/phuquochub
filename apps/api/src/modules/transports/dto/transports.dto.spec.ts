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

  // Bộ lọc nội dung (transport_type/ward/pricing_model/booking_required/airport_transfer) CỐ Ý
  // chưa khai ở DTO này — thuộc phạm vi nhiệm vụ Transport Browse kế tiếp (transport.md §8).
  // Test này xác nhận việc hoãn được THI HÀNH (400), không chỉ ghi trong comment.
  it.each(['transport_type', 'ward', 'pricing_model', 'booking_required', 'airport_transfer', 'category'])(
    'từ chối %s — bộ lọc Browse đầy đủ hoãn sang nhiệm vụ kế tiếp, không âm thầm bỏ qua',
    async (param) => {
      const errors = await validateQuery({ [param]: 'true' });
      expect(errors.some((e) => e.property === param)).toBe(true);
    },
  );
});
