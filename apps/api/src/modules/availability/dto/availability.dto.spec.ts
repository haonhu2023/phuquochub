import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateAvailabilitySlotDto, ListAvailabilityQueryDto } from './availability.dto';

const PIPE_OPTIONS = { whitelist: true, forbidNonWhitelisted: true } as const;

function validateCreate(raw: Record<string, unknown>) {
  return validate(plainToInstance(CreateAvailabilitySlotDto, raw), PIPE_OPTIONS);
}

function validateList(raw: Record<string, unknown>) {
  return validate(plainToInstance(ListAvailabilityQueryDto, raw), PIPE_OPTIONS);
}

const VALID_SLOT: Record<string, unknown> = {
  entity_type: 'tour',
  entity_id: '11111111-1111-4111-8111-111111111111',
  place_id: '22222222-2222-4222-8222-222222222222',
  slot_start: '2026-08-01T08:00:00Z',
  total_capacity: 20,
};

describe('CreateAvailabilitySlotDto', () => {
  it('chấp nhận payload tối thiểu hợp lệ (slot_end vắng mặt)', async () => {
    expect(await validateCreate(VALID_SLOT)).toHaveLength(0);
  });

  it('chấp nhận slot_end sau slot_start', async () => {
    const errors = await validateCreate({ ...VALID_SLOT, slot_end: '2026-08-02T08:00:00Z' });
    expect(errors).toHaveLength(0);
  });

  it('từ chối slot_end trước/bằng slot_start', async () => {
    const errors = await validateCreate({ ...VALID_SLOT, slot_end: '2026-08-01T08:00:00Z' });
    expect(errors.some((e) => e.property === 'slot_end')).toBe(true);
  });

  it('từ chối entity_type không thuộc BOOKABLE_ENTITY_TYPES', async () => {
    const errors = await validateCreate({ ...VALID_SLOT, entity_type: 'business' });
    expect(errors.some((e) => e.property === 'entity_type')).toBe(true);
  });

  it('từ chối total_capacity <= 0', async () => {
    const errors = await validateCreate({ ...VALID_SLOT, total_capacity: 0 });
    expect(errors.some((e) => e.property === 'total_capacity')).toBe(true);
  });

  it('từ chối place_id không phải UUID', async () => {
    const errors = await validateCreate({ ...VALID_SLOT, place_id: 'not-a-uuid' });
    expect(errors.some((e) => e.property === 'place_id')).toBe(true);
  });

  it('từ chối trường lạ (whitelist)', async () => {
    const errors = await validateCreate({ ...VALID_SLOT, held_quantity: 5 });
    expect(errors.some((e) => e.property === 'held_quantity')).toBe(true);
  });
});

describe('ListAvailabilityQueryDto', () => {
  it('chấp nhận query rỗng', async () => {
    expect(await validateList({})).toHaveLength(0);
  });

  it('chấp nhận đầy đủ filter hợp lệ', async () => {
    const errors = await validateList({
      entity_type: 'tour',
      entity_id: '11111111-1111-4111-8111-111111111111',
      place_id: '22222222-2222-4222-8222-222222222222',
      date_from: '2026-08-01T00:00:00Z',
      date_to: '2026-08-31T00:00:00Z',
      page: 1,
      limit: 20,
      sort_by: 'slot_start',
      sort_dir: 'asc',
    });
    expect(errors).toHaveLength(0);
  });

  it('từ chối sort_by không thuộc AVAILABILITY_SORT_FIELDS', async () => {
    const errors = await validateList({ sort_by: 'total_capacity' });
    expect(errors.some((e) => e.property === 'sort_by')).toBe(true);
  });

  it('từ chối date_to trước date_from', async () => {
    const errors = await validateList({ date_from: '2026-08-02T00:00:00Z', date_to: '2026-08-01T00:00:00Z' });
    expect(errors.some((e) => e.property === 'date_to')).toBe(true);
  });
});
