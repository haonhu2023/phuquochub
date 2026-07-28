import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ListToursQueryDto } from './tours.dto';

// Khớp cấu hình ValidationPipe toàn cục ở main.ts.
const PIPE_OPTIONS = { whitelist: true, forbidNonWhitelisted: true } as const;

function validateQuery(raw: Record<string, unknown>) {
  return validate(plainToInstance(ListToursQueryDto, raw), PIPE_OPTIONS);
}

describe('ListToursQueryDto', () => {
  it('rỗng → hợp lệ (mọi trường tuỳ chọn)', async () => {
    expect(await validateQuery({})).toHaveLength(0);
  });

  it.each(['diving', 'fishing', 'trekking', 'sightseeing', 'cruise', 'other'])(
    'type=%s hợp lệ (đủ 6 giá trị enum tour_type của migration)',
    async (type) => {
      expect(await validateQuery({ type })).toHaveLength(0);
    },
  );

  it('từ chối type ngoài enum', async () => {
    const errors = await validateQuery({ type: 'kayaking' });
    expect(errors.some((e) => e.property === 'type')).toBe(true);
  });

  it.each(['easy', 'moderate', 'hard'])('difficulty=%s hợp lệ', async (difficulty) => {
    expect(await validateQuery({ difficulty })).toHaveLength(0);
  });

  it('từ chối difficulty ngoài enum', async () => {
    const errors = await validateQuery({ difficulty: 'extreme' });
    expect(errors.some((e) => e.property === 'difficulty')).toBe(true);
  });

  it('price_range hợp lệ (enum PriceRange), giá trị ngoài enum bị từ chối', async () => {
    expect(await validateQuery({ price_range: 'mid' })).toHaveLength(0);
    const errors = await validateQuery({ price_range: 'luxury' });
    expect(errors.some((e) => e.property === 'price_range')).toBe(true);
  });

  it('max_duration_minutes: chuỗi số → number (@Type), hợp lệ', async () => {
    const dto = plainToInstance(ListToursQueryDto, { max_duration_minutes: '240' });
    expect(dto.max_duration_minutes).toBe(240);
    expect(await validate(dto, PIPE_OPTIONS)).toHaveLength(0);
  });

  it.each(['0', '-5', '90.5', 'abc'])(
    'từ chối max_duration_minutes không phải số nguyên ≥ 1 (%p)',
    async (raw) => {
      const errors = await validateQuery({ max_duration_minutes: raw });
      expect(errors.some((e) => e.property === 'max_duration_minutes')).toBe(true);
    },
  );

  it('departure_area: chấp nhận ward lạ/mới (KHÔNG hardcode whitelist — dữ liệu tham chiếu mở)', async () => {
    expect(await validateQuery({ departure_area: 'Bãi Thơm' })).toHaveLength(0);
  });

  it('từ chối departure_area quá dài (>120 ký tự — độ dài cột places.ward)', async () => {
    const errors = await validateQuery({ departure_area: 'x'.repeat(121) });
    expect(errors.some((e) => e.property === 'departure_area')).toBe(true);
  });

  it.each(['rating_desc', 'name_asc', 'duration_asc'])('sort=%s hợp lệ', async (sort) => {
    expect(await validateQuery({ sort })).toHaveLength(0);
  });

  it('từ chối giá trị sort ngoài whitelist (không cho client tự chọn cột)', async () => {
    const errors = await validateQuery({ sort: 'price_asc' });
    expect(errors.some((e) => e.property === 'sort')).toBe(true);
  });

  it('page/limit: chuỗi số → number, từ chối < 1', async () => {
    const dto = plainToInstance(ListToursQueryDto, { page: '3', limit: '50' });
    expect(dto.page).toBe(3);
    expect(dto.limit).toBe(50);
    expect(await validate(dto, PIPE_OPTIONS)).toHaveLength(0);

    const errors = await validateQuery({ page: '0' });
    expect(errors.some((e) => e.property === 'page')).toBe(true);
  });

  it.each(['duration', 'price_max'])(
    'từ chối %s — CHƯA triển khai (openapi cũ), không âm thầm bỏ qua',
    async (param) => {
      const errors = await validateQuery({ [param]: '240' });
      expect(errors.some((e) => e.property === param)).toBe(true);
    },
  );
});
