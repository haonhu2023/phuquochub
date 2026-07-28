import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ListBeachesQueryDto } from './beaches.dto';

// Khớp cấu hình ValidationPipe toàn cục ở main.ts.
const PIPE_OPTIONS = { whitelist: true, forbidNonWhitelisted: true } as const;

function validateQuery(raw: Record<string, unknown>) {
  return validate(plainToInstance(ListBeachesQueryDto, raw), PIPE_OPTIONS);
}

describe('ListBeachesQueryDto', () => {
  it('rỗng → hợp lệ (mọi trường tuỳ chọn)', async () => {
    expect(await validateQuery({})).toHaveLength(0);
  });

  it('ward: chấp nhận giá trị lạ/mới (KHÔNG hardcode whitelist — dữ liệu tham chiếu mở)', async () => {
    expect(await validateQuery({ ward: 'Bãi Thơm' })).toHaveLength(0);
  });

  it('từ chối ward quá dài (>120 ký tự — độ dài cột places.ward)', async () => {
    const errors = await validateQuery({ ward: 'x'.repeat(121) });
    expect(errors.some((e) => e.property === 'ward')).toBe(true);
  });

  it.each(['free', 'low', 'mid', 'high'])('price_range=%s hợp lệ', async (price_range) => {
    expect(await validateQuery({ price_range })).toHaveLength(0);
  });

  it('từ chối price_range ngoài enum', async () => {
    const errors = await validateQuery({ price_range: 'luxury' });
    expect(errors.some((e) => e.property === 'price_range')).toBe(true);
  });

  it.each(['rating_desc', 'name_asc', 'newest'])('sort=%s hợp lệ', async (sort) => {
    expect(await validateQuery({ sort })).toHaveLength(0);
  });

  it.each(['price_asc', 'name_desc', 'p.name ASC'])(
    'từ chối sort ngoài whitelist (%p) — client không tự chọn cột/hướng',
    async (sort) => {
      const errors = await validateQuery({ sort });
      expect(errors.some((e) => e.property === 'sort')).toBe(true);
    },
  );

  it('page/limit: chuỗi số → number (@Type)', async () => {
    const dto = plainToInstance(ListBeachesQueryDto, { page: '2', limit: '10' });
    expect(dto.page).toBe(2);
    expect(dto.limit).toBe(10);
    expect(await validate(dto, PIPE_OPTIONS)).toHaveLength(0);
  });

  it.each([
    ['page', '0'],
    ['page', '-1'],
    ['page', '1.5'],
    ['page', 'abc'],
    ['limit', '0'],
    ['limit', 'abc'],
  ])('từ chối %s=%p (không phải số nguyên ≥ 1)', async (prop, value) => {
    const errors = await validateQuery({ [prop]: value });
    expect(errors.some((e) => e.property === prop)).toBe(true);
  });

  it('limit > 100 hợp lệ ở DTO — bị CẮT xuống 100 ở clampLimit, không phải 400 (quy ước /places)', async () => {
    expect(await validateQuery({ limit: '500' })).toHaveLength(0);
  });

  it('kết hợp nhiều tham số hợp lệ cùng lúc', async () => {
    expect(
      await validateQuery({ ward: 'Gành Dầu', price_range: 'free', sort: 'name_asc', page: '2', limit: '5' }),
    ).toHaveLength(0);
  });

  it.each(['category', 'district', 'free_entry', 'swimming', 'lifeguard', 'facilities', 'open_now'])(
    'từ chối %s — KHÔNG được triển khai, không âm thầm bỏ qua',
    async (param) => {
      const errors = await validateQuery({ [param]: 'true' });
      expect(errors.some((e) => e.property === param)).toBe(true);
    },
  );
});
