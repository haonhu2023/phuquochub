import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateBookingRequestDto } from './bookings.dto';

const PIPE_OPTIONS = { whitelist: true, forbidNonWhitelisted: true } as const;

function validateCreate(raw: Record<string, unknown>) {
  return validate(plainToInstance(CreateBookingRequestDto, raw), PIPE_OPTIONS);
}

const VALID: Record<string, unknown> = {
  entity_type: 'tour',
  entity_id: '11111111-1111-4111-8111-111111111111',
  place_id: '22222222-2222-4222-8222-222222222222',
  party_size: 2,
  items: [{ label: 'Vé người lớn', quantity: 2, unit_price: 500000 }],
};

describe('CreateBookingRequestDto', () => {
  it('chấp nhận payload tối thiểu hợp lệ', async () => {
    const errors = await validateCreate(VALID);
    expect(errors).toHaveLength(0);
  });

  it('chấp nhận đầy đủ trường tùy chọn', async () => {
    const errors = await validateCreate({
      ...VALID,
      booking_type: 'standard',
      service_start_at: '2026-08-01T00:00:00Z',
      service_end_at: '2026-08-02T00:00:00Z',
      guest_note: 'Đến trễ 15 phút',
    });
    expect(errors).toHaveLength(0);
  });

  it('từ chối entity_type không thuộc BOOKABLE_ENTITY_TYPES', async () => {
    const errors = await validateCreate({ ...VALID, entity_type: 'business' });
    expect(errors.some((e) => e.property === 'entity_type')).toBe(true);
  });

  it('từ chối place_id không phải UUID', async () => {
    const errors = await validateCreate({ ...VALID, place_id: 'not-a-uuid' });
    expect(errors.some((e) => e.property === 'place_id')).toBe(true);
  });

  it('từ chối items rỗng', async () => {
    const errors = await validateCreate({ ...VALID, items: [] });
    expect(errors.some((e) => e.property === 'items')).toBe(true);
  });

  it('từ chối item thiếu label', async () => {
    const errors = await validateCreate({ ...VALID, items: [{ quantity: 1, unit_price: 1000 }] });
    expect(errors.some((e) => e.property === 'items')).toBe(true);
  });

  it('từ chối unit_price âm', async () => {
    const errors = await validateCreate({
      ...VALID,
      items: [{ label: 'x', quantity: 1, unit_price: -1 }],
    });
    expect(errors.some((e) => e.property === 'items')).toBe(true);
  });

  it('từ chối party_size <= 0', async () => {
    const errors = await validateCreate({ ...VALID, party_size: 0 });
    expect(errors.some((e) => e.property === 'party_size')).toBe(true);
  });

  it('từ chối trường lạ (whitelist)', async () => {
    const errors = await validateCreate({ ...VALID, discount: 1000 });
    expect(errors.some((e) => e.property === 'discount')).toBe(true);
  });
});
