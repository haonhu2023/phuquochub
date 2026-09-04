import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ReviewQueueQueryDto } from './review-queue-query.dto';

async function errorsFor(query: Record<string, unknown>) {
  const dto = plainToInstance(ReviewQueueQueryDto, query);
  return { dto, errors: await validate(dto) };
}

describe('ReviewQueueQueryDto', () => {
  it('accepts an empty query (queue defaults apply downstream)', async () => {
    const { errors } = await errorsFor({});
    expect(errors).toHaveLength(0);
  });

  it('splits a comma-joined humanReviewStatus into an array', async () => {
    const { dto, errors } = await errorsFor({ humanReviewStatus: 'PENDING,NEEDS_CHANGES' });
    expect(errors).toHaveLength(0);
    expect(dto.humanReviewStatus).toEqual(['PENDING', 'NEEDS_CHANGES']);
  });

  it('rejects APPROVED in humanReviewStatus — this is a pending-work queue, not a history browser', async () => {
    const { errors } = await errorsFor({ humanReviewStatus: 'APPROVED' });
    expect(errors.some((e) => e.property === 'humanReviewStatus')).toBe(true);
  });

  it('rejects a limit above 200', async () => {
    const { errors } = await errorsFor({ limit: '500' });
    expect(errors.some((e) => e.property === 'limit')).toBe(true);
  });

  it('rejects a non-UUID placeId', async () => {
    const { errors } = await errorsFor({ placeId: 'not-a-uuid' });
    expect(errors.some((e) => e.property === 'placeId')).toBe(true);
  });

  // Phase 40/41 fix (2026-09-04): these three previously had no type/length validation at all — a
  // repeated query key (?placeSlug=a&placeSlug=b) would arrive as an array and pass bare
  // @IsOptional() unrejected, to be pushed as a wrongly-typed bound SQL parameter downstream.
  it.each(['placeSlug', 'localeCode', 'fieldKey'])(
    'rejects a non-string %s (e.g. an array from a repeated query key)',
    async (field) => {
      const { errors } = await errorsFor({ [field]: ['a', 'b'] });
      expect(errors.some((e) => e.property === field)).toBe(true);
    },
  );

  it('rejects a placeSlug longer than 200 characters', async () => {
    const { errors } = await errorsFor({ placeSlug: 'x'.repeat(201) });
    expect(errors.some((e) => e.property === 'placeSlug')).toBe(true);
  });

  it('accepts a well-formed placeSlug/localeCode/fieldKey combination', async () => {
    const { errors } = await errorsFor({
      placeSlug: 'vinwonders-phu-quoc',
      localeCode: 'vi',
      fieldKey: 'short_description',
    });
    expect(errors).toHaveLength(0);
  });
});
