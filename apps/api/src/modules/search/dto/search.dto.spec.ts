import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { SearchQueryDto, SuggestQueryDto } from './search.dto';
import { PriceRange } from '../../places/place.enums';

// Khớp cấu hình ValidationPipe toàn cục ở main.ts.
const PIPE_OPTIONS = { whitelist: true, forbidNonWhitelisted: true } as const;

function validateSearch(raw: Record<string, unknown>) {
  return validate(plainToInstance(SearchQueryDto, raw), PIPE_OPTIONS);
}

describe('SearchQueryDto — Search Filters (category/ward/price_range)', () => {
  it('chỉ `q` cũng hợp lệ (mọi filter optional — backward-compat)', async () => {
    expect(await validateSearch({ q: 'bai sao' })).toHaveLength(0);
  });

  it('chấp nhận category/ward/price_range hợp lệ, kết hợp với q', async () => {
    const errors = await validateSearch({
      q: 'resort',
      category: 'c1',
      ward: 'An Thới',
      price_range: PriceRange.HIGH,
    });
    expect(errors).toHaveLength(0);
  });

  it('từ chối price_range ngoài enum PriceRange', async () => {
    const errors = await validateSearch({ q: 'resort', price_range: 'ultra-luxury' });
    expect(errors).toHaveLength(1);
    expect(errors[0].property).toBe('price_range');
  });

  it('từ chối q rỗng (MinLength(1))', async () => {
    const errors = await validateSearch({ q: '' });
    expect(errors.some((e) => e.property === 'q')).toBe(true);
  });

  it('page/limit vẫn coerce sang number như trước (không đổi hành vi cũ)', async () => {
    const dto = plainToInstance(SearchQueryDto, { q: 'phu quoc', page: '2', limit: '10' });
    expect(dto.page).toBe(2);
    expect(dto.limit).toBe(10);
    expect(await validate(dto, PIPE_OPTIONS)).toHaveLength(0);
  });
});

describe('SuggestQueryDto', () => {
  it('yêu cầu q không rỗng', async () => {
    const errors = await validate(plainToInstance(SuggestQueryDto, { q: '' }), PIPE_OPTIONS);
    expect(errors.some((e) => e.property === 'q')).toBe(true);
  });
});
