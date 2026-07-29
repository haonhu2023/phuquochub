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

  it.each(['booking_status', 'payment_status', 'fulfillment_status'])(
    'từ chối client tự đặt %s (trạng thái nội bộ, không có trên DTO này)',
    async (field) => {
      const errors = await validateCreate({ ...VALID, [field]: 'confirmed' });
      expect(errors.some((e) => e.property === field)).toBe(true);
    },
  );

  it('chấp nhận service_end_at sau service_start_at', async () => {
    const errors = await validateCreate({
      ...VALID,
      service_start_at: '2026-08-01T00:00:00Z',
      service_end_at: '2026-08-02T00:00:00Z',
    });
    expect(errors).toHaveLength(0);
  });

  it('từ chối service_end_at trước service_start_at', async () => {
    const errors = await validateCreate({
      ...VALID,
      service_start_at: '2026-08-02T00:00:00Z',
      service_end_at: '2026-08-01T00:00:00Z',
    });
    expect(errors.some((e) => e.property === 'service_end_at')).toBe(true);
  });

  it('từ chối service_end_at bằng service_start_at (phải SAU, không được bằng)', async () => {
    const errors = await validateCreate({
      ...VALID,
      service_start_at: '2026-08-01T00:00:00Z',
      service_end_at: '2026-08-01T00:00:00Z',
    });
    expect(errors.some((e) => e.property === 'service_end_at')).toBe(true);
  });

  it('chấp nhận service_end_at khi không có service_start_at (kiểm tra cross-field bỏ qua khi thiếu vế kia)', async () => {
    const errors = await validateCreate({ ...VALID, service_end_at: '2026-08-02T00:00:00Z' });
    expect(errors).toHaveLength(0);
  });

  it('trim khoảng trắng đầu/cuối guest_note và item.label', async () => {
    const instance = plainToInstance(CreateBookingRequestDto, {
      ...VALID,
      guest_note: '  đến trễ 15 phút  ',
      items: [{ label: '  Vé người lớn  ', quantity: 1, unit_price: 1000 }],
    });
    expect(instance.guest_note).toBe('đến trễ 15 phút');
    expect(instance.items[0].label).toBe('Vé người lớn');
  });
});
