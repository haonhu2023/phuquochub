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
});
