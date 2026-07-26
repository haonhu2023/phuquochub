import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateReviewDto } from './reviews.dto';

// Khớp cấu hình ValidationPipe toàn cục ở main.ts.
const PIPE_OPTIONS = { whitelist: true, forbidNonWhitelisted: true } as const;

function validateCreate(raw: Record<string, unknown>) {
  return validate(plainToInstance(CreateReviewDto, raw), PIPE_OPTIONS);
}

describe('CreateReviewDto', () => {
  it('chấp nhận rating hợp lệ, không có content/media_ids', async () => {
    const errors = await validateCreate({ rating: 4 });
    expect(errors).toHaveLength(0);
  });

  it('chấp nhận rating + content + media_ids hợp lệ', async () => {
    const errors = await validateCreate({
      rating: 5,
      content: 'Tuyệt vời',
      media_ids: ['11111111-1111-4111-8111-111111111111'],
    });
    expect(errors).toHaveLength(0);
  });

  it.each([0, 6, 1.5])('từ chối rating ngoài khoảng 1-5 (%p)', async (rating) => {
    const errors = await validateCreate({ rating });
    expect(errors).toHaveLength(1);
    expect(errors[0].property).toBe('rating');
  });

  it('từ chối thiếu rating', async () => {
    const errors = await validateCreate({ content: 'Thiếu rating' });
    expect(errors.some((e) => e.property === 'rating')).toBe(true);
  });

  it('từ chối media_ids không phải UUID', async () => {
    const errors = await validateCreate({ rating: 3, media_ids: ['not-a-uuid'] });
    expect(errors.some((e) => e.property === 'media_ids')).toBe(true);
  });

  it('từ chối trường lạ (whitelist)', async () => {
    const errors = await validateCreate({ rating: 3, status: 'published' });
    expect(errors.some((e) => e.property === 'status')).toBe(true);
  });
});
