import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ReviewPlaceTranslationDto } from './review-place-translation.dto';
import { REVIEW_NOTES_MAX_LENGTH } from '../translation-review.service';

async function errorsFor(body: Record<string, unknown>) {
  const dto = plainToInstance(ReviewPlaceTranslationDto, body);
  return validate(dto);
}

describe('ReviewPlaceTranslationDto', () => {
  it('accepts a bare APPROVED decision with no notes', async () => {
    expect(await errorsFor({ decision: 'APPROVED' })).toHaveLength(0);
  });

  it('rejects PENDING as a decision — it is a starting state, not something an actor can decide', async () => {
    const errors = await errorsFor({ decision: 'PENDING' });
    expect(errors.some((e) => e.property === 'decision')).toBe(true);
  });

  it('rejects an unknown decision value', async () => {
    const errors = await errorsFor({ decision: 'MAYBE' });
    expect(errors.some((e) => e.property === 'decision')).toBe(true);
  });

  it(`rejects notes longer than ${REVIEW_NOTES_MAX_LENGTH} characters`, async () => {
    const errors = await errorsFor({ decision: 'REJECTED', notes: 'x'.repeat(REVIEW_NOTES_MAX_LENGTH + 1) });
    expect(errors.some((e) => e.property === 'notes')).toBe(true);
  });

  it('trims notes', () => {
    const dto = plainToInstance(ReviewPlaceTranslationDto, { decision: 'REJECTED', notes: '  bad claim  ' });
    expect(dto.notes).toBe('bad claim');
  });
});
