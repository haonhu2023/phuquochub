import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ListHotelsQueryDto } from './hotels.dto';

// Khớp cấu hình ValidationPipe toàn cục ở main.ts.
const PIPE_OPTIONS = { whitelist: true, forbidNonWhitelisted: true } as const;

function validateQuery(raw: Record<string, unknown>) {
  return validate(plainToInstance(ListHotelsQueryDto, raw), PIPE_OPTIONS);
}

describe('ListHotelsQueryDto', () => {
  it('rỗng → hợp lệ (mọi trường tuỳ chọn)', async () => {
    expect(await validateQuery({})).toHaveLength(0);
  });

  it('stars 1-5 hợp lệ', async () => {
    expect(await validateQuery({ stars: '4' })).toHaveLength(0);
  });

  it.each([0, 6])('từ chối stars ngoài khoảng 1-5 (%p)', async (stars) => {
    const errors = await validateQuery({ stars: String(stars) });
    expect(errors.some((e) => e.property === 'stars')).toBe(true);
  });

  it('sort=rating_desc | name_asc hợp lệ', async () => {
    expect(await validateQuery({ sort: 'rating_desc' })).toHaveLength(0);
    expect(await validateQuery({ sort: 'name_asc' })).toHaveLength(0);
  });

  it('từ chối giá trị sort ngoài whitelist', async () => {
    const errors = await validateQuery({ sort: 'price_asc' });
    expect(errors.some((e) => e.property === 'sort')).toBe(true);
  });

  it('từ chối price_min/price_max/amenities — CHƯA triển khai, không âm thầm bỏ qua', async () => {
    const errors = await validateQuery({ price_min: '100000' });
    expect(errors.some((e) => e.property === 'price_min')).toBe(true);
  });
});
