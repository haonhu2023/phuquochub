import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ListRestaurantsQueryDto } from './restaurants.dto';

// Khớp cấu hình ValidationPipe toàn cục ở main.ts.
const PIPE_OPTIONS = { whitelist: true, forbidNonWhitelisted: true } as const;

function validateQuery(raw: Record<string, unknown>) {
  return validate(plainToInstance(ListRestaurantsQueryDto, raw), PIPE_OPTIONS);
}

describe('ListRestaurantsQueryDto', () => {
  it('rỗng → hợp lệ (mọi trường tuỳ chọn)', async () => {
    expect(await validateQuery({})).toHaveLength(0);
  });

  it('price_range hợp lệ (enum PriceRange)', async () => {
    expect(await validateQuery({ price_range: 'mid' })).toHaveLength(0);
  });

  it('từ chối price_range ngoài enum', async () => {
    const errors = await validateQuery({ price_range: 'luxury' });
    expect(errors.some((e) => e.property === 'price_range')).toBe(true);
  });

  it('cuisine: chấp nhận code lạ/mới (KHÔNG hardcode whitelist — dữ liệu tham chiếu mở)', async () => {
    expect(await validateQuery({ cuisine: 'fusion' })).toHaveLength(0);
  });

  it('từ chối cuisine quá dài (>60 ký tự)', async () => {
    const errors = await validateQuery({ cuisine: 'x'.repeat(61) });
    expect(errors.some((e) => e.property === 'cuisine')).toBe(true);
  });

  it('sort=rating_desc | name_asc hợp lệ, giá trị khác bị từ chối', async () => {
    expect(await validateQuery({ sort: 'rating_desc' })).toHaveLength(0);
    expect(await validateQuery({ sort: 'name_asc' })).toHaveLength(0);
    const errors = await validateQuery({ sort: 'price_asc' });
    expect(errors.some((e) => e.property === 'sort')).toBe(true);
  });

  it('từ chối open_now — CHƯA triển khai, không âm thầm bỏ qua', async () => {
    const errors = await validateQuery({ open_now: 'true' });
    expect(errors.some((e) => e.property === 'open_now')).toBe(true);
  });
});
