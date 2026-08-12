import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  CreateMediaDto,
  MAX_ALT_TEXT_LENGTH,
  MAX_CAPTION_LENGTH,
  MAX_REORDER_MEDIA_IDS,
  MAX_UPLOAD_SIZE_BYTES,
  PresignMediaDto,
  ReorderPlaceMediaDto,
  SetPlaceCoverDto,
  UpdatePlaceMediaMetadataDto,
} from './media.dto';

const PIPE_OPTIONS = { whitelist: true, forbidNonWhitelisted: true } as const;
const VALID_CHECKSUM = 'a'.repeat(64);
const VALID_KEY = 'media/11111111-1111-4111-8111-111111111111.jpg';
const UUID_A = '11111111-1111-4111-8111-111111111111';
const UUID_B = '22222222-2222-4222-8222-222222222222';

function validatePresign(raw: Record<string, unknown>) {
  return validate(plainToInstance(PresignMediaDto, raw), PIPE_OPTIONS);
}

function validateCreate(raw: Record<string, unknown>) {
  return validate(plainToInstance(CreateMediaDto, raw), PIPE_OPTIONS);
}

describe('PresignMediaDto', () => {
  it('chấp nhận payload hợp lệ tối thiểu (không place_id)', async () => {
    const errors = await validatePresign({ content_type: 'image/jpeg', size: 1000, checksum_sha256: VALID_CHECKSUM });
    expect(errors).toHaveLength(0);
  });

  // Owner Place Photos (2026-08-11): `place_id` ĐÃ BỊ GỠ khỏi DTO này. Nó từng được chấp nhận
  // nhưng CHỈ được kiểm tra "place có tồn tại không" — không hề kiểm tra người gọi có quyền quản
  // lý cơ sở đó, trong khi permission của route (`Media.Upload.Own`) gắn với chính người gọi. Gắn
  // ảnh vào cơ sở giờ BẮT BUỘC đi qua `POST /places/{id}/media/presign`, nơi place id là route
  // param nên `@AuthorizationContext` cưỡng chế được quyền trên đúng cơ sở đó.
  it('TỪ CHỐI place_id trong body (không còn đường gắn ảnh vào cơ sở mà không qua kiểm tra quyền)', async () => {
    const errors = await validatePresign({
      content_type: 'image/png',
      size: 1000,
      checksum_sha256: VALID_CHECKSUM,
      place_id: '11111111-1111-4111-8111-111111111111',
    });
    expect(errors).toHaveLength(1);
    expect(errors[0].property).toBe('place_id');
  });

  it.each(['image/gif', 'application/pdf', 'video/mp4', ''])(
    'từ chối content_type ngoài whitelist: %s',
    async (contentType) => {
      const errors = await validatePresign({ content_type: contentType, size: 1000, checksum_sha256: VALID_CHECKSUM });
      expect(errors.some((e) => e.property === 'content_type')).toBe(true);
    },
  );

  it('từ chối size = 0', async () => {
    const errors = await validatePresign({ content_type: 'image/jpeg', size: 0, checksum_sha256: VALID_CHECKSUM });
    expect(errors.some((e) => e.property === 'size')).toBe(true);
  });

  it('từ chối size vượt 10 MiB (10,485,760 bytes)', async () => {
    const errors = await validatePresign({
      content_type: 'image/jpeg',
      size: MAX_UPLOAD_SIZE_BYTES + 1,
      checksum_sha256: VALID_CHECKSUM,
    });
    expect(errors.some((e) => e.property === 'size')).toBe(true);
  });

  it('chấp nhận size = đúng 10,485,760 bytes (biên trên hợp lệ)', async () => {
    const errors = await validatePresign({
      content_type: 'image/jpeg',
      size: MAX_UPLOAD_SIZE_BYTES,
      checksum_sha256: VALID_CHECKSUM,
    });
    expect(errors).toHaveLength(0);
  });

  it.each([
    'A'.repeat(64), // uppercase hex — phải viết thường
    'g'.repeat(64), // ký tự ngoài hex
    'a'.repeat(63), // ngắn hơn 64
    'a'.repeat(65), // dài hơn 64
    '',
  ])('từ chối checksum_sha256 sai định dạng: %s', async (checksum) => {
    const errors = await validatePresign({ content_type: 'image/jpeg', size: 1000, checksum_sha256: checksum });
    expect(errors.some((e) => e.property === 'checksum_sha256')).toBe(true);
  });

  it('từ chối place_id không phải UUID v4', async () => {
    const errors = await validatePresign({
      content_type: 'image/jpeg',
      size: 1000,
      checksum_sha256: VALID_CHECKSUM,
      place_id: 'not-a-uuid',
    });
    expect(errors.some((e) => e.property === 'place_id')).toBe(true);
  });

  it.each(['business_id', 'post_id', 'event_id', 'review_id'])(
    'từ chối 400 field %s (whitelist+forbidNonWhitelisted — không lộ endpoint chấp nhận owner khác place_id)',
    async (field) => {
      const errors = await validatePresign({
        content_type: 'image/jpeg',
        size: 1000,
        checksum_sha256: VALID_CHECKSUM,
        [field]: '11111111-1111-4111-8111-111111111111',
      });
      expect(errors.length).toBeGreaterThan(0);
    },
  );
});

describe('CreateMediaDto', () => {
  it('chấp nhận key hợp lệ, không caption/alt', async () => {
    const errors = await validateCreate({ key: VALID_KEY });
    expect(errors).toHaveLength(0);
  });

  it('chấp nhận kèm caption/alt trong giới hạn độ dài', async () => {
    const errors = await validateCreate({ key: VALID_KEY, caption: 'a'.repeat(300), alt: 'b'.repeat(200) });
    expect(errors).toHaveLength(0);
  });

  it('từ chối caption vượt 300 ký tự', async () => {
    const errors = await validateCreate({ key: VALID_KEY, caption: 'a'.repeat(301) });
    expect(errors.some((e) => e.property === 'caption')).toBe(true);
  });

  it('từ chối alt vượt 200 ký tự', async () => {
    const errors = await validateCreate({ key: VALID_KEY, alt: 'a'.repeat(201) });
    expect(errors.some((e) => e.property === 'alt')).toBe(true);
  });

  it.each([
    'not-a-key',
    'media/not-a-uuid.jpg',
    'media/11111111-1111-4111-8111-111111111111.gif', // extension ngoài whitelist
    '../../etc/passwd',
    'media/11111111-1111-4111-8111-111111111111', // thiếu extension
  ])('từ chối key sai định dạng: %s', async (key) => {
    const errors = await validateCreate({ key });
    expect(errors.some((e) => e.property === 'key')).toBe(true);
  });
});

// Owner Cover & Photo Ordering (2026-08-12).
describe('ReorderPlaceMediaDto', () => {
  const run = (raw: Record<string, unknown>) =>
    validate(plainToInstance(ReorderPlaceMediaDto, raw), PIPE_OPTIONS);

  it('chấp nhận danh sách UUID hợp lệ', async () => {
    await expect(run({ media_ids: [UUID_A, UUID_B] })).resolves.toHaveLength(0);
  });

  it('từ chối mảng rỗng (không có gì để sắp)', async () => {
    const errors = await run({ media_ids: [] });
    expect(errors.some((e) => e.property === 'media_ids')).toBe(true);
  });

  it.each([['not-a-uuid'], [123], [null]])('từ chối phần tử không phải UUID v4: %s', async (bad) => {
    const errors = await run({ media_ids: [UUID_A, bad] });
    expect(errors.some((e) => e.property === 'media_ids')).toBe(true);
  });

  it('từ chối media_ids không phải mảng', async () => {
    const errors = await run({ media_ids: UUID_A });
    expect(errors.some((e) => e.property === 'media_ids')).toBe(true);
  });

  it('từ chối mảng vượt trần payload', async () => {
    const errors = await run({ media_ids: Array.from({ length: MAX_REORDER_MEDIA_IDS + 1 }, () => UUID_A) });
    expect(errors.some((e) => e.property === 'media_ids')).toBe(true);
  });

  // Cơ sở đích LUÔN là route param đã qua guard — không có đường nào khai nó trong body.
  it('từ chối place_id trong body (whitelist + forbidNonWhitelisted)', async () => {
    const errors = await run({ media_ids: [UUID_A], place_id: UUID_B });
    expect(errors.some((e) => e.property === 'place_id')).toBe(true);
  });
});

describe('SetPlaceCoverDto', () => {
  const run = (raw: Record<string, unknown>) => validate(plainToInstance(SetPlaceCoverDto, raw), PIPE_OPTIONS);

  it('chấp nhận media_id là UUID v4', async () => {
    await expect(run({ media_id: UUID_A })).resolves.toHaveLength(0);
  });

  it.each(['not-a-uuid', '', '../../etc/passwd'])('từ chối media_id sai định dạng: %s', async (bad) => {
    const errors = await run({ media_id: bad });
    expect(errors.some((e) => e.property === 'media_id')).toBe(true);
  });

  // Chốt chặn "không nhận URL tuỳ ý làm ảnh bìa": hợp đồng CHỈ có media id.
  it.each(['cover_image_url', 'url', 'place_id'])('từ chối trường lạ %s trong body', async (field) => {
    const errors = await run({ media_id: UUID_A, [field]: 'https://evil.example/x.jpg' });
    expect(errors.some((e) => e.property === field)).toBe(true);
  });
});

// Owner Photo Metadata (2026-08-12).
describe('UpdatePlaceMediaMetadataDto', () => {
  const run = (raw: Record<string, unknown>) =>
    validate(plainToInstance(UpdatePlaceMediaMetadataDto, raw), PIPE_OPTIONS);

  it('chấp nhận caption và alt_text hợp lệ cùng nhau', async () => {
    await expect(run({ caption: 'Hoàng hôn ở Dinh Cậu', alt_text: 'Tháp đèn biển màu trắng' })).resolves.toHaveLength(
      0,
    );
  });

  it('chấp nhận chỉ caption (alt_text vắng mặt)', async () => {
    await expect(run({ caption: 'Chỉ có mô tả' })).resolves.toHaveLength(0);
  });

  it('chấp nhận chỉ alt_text (caption vắng mặt)', async () => {
    await expect(run({ alt_text: 'Chỉ có alt' })).resolves.toHaveLength(0);
  });

  it('chấp nhận body rỗng ở tầng DTO (service tự chặn "cả hai đều vắng mặt")', async () => {
    await expect(run({})).resolves.toHaveLength(0);
  });

  it('chấp nhận chuỗi rỗng (ý định xoá — chuẩn hoá ở service, không phải DTO)', async () => {
    await expect(run({ caption: '', alt_text: '' })).resolves.toHaveLength(0);
  });

  // `@IsOptional()` cho phép null bỏ qua @IsString() — cùng hành vi UpdateContactDto.label. Không
  // phải lỗ hổng mới; service phải xử lý an toàn (xem media.service.spec.ts).
  it('chấp nhận null ở tầng DTO (class-validator: IsOptional bỏ qua kiểm tra IsString cho null)', async () => {
    await expect(run({ caption: null, alt_text: null })).resolves.toHaveLength(0);
  });

  it('từ chối caption vượt quá MAX_CAPTION_LENGTH ký tự', async () => {
    const errors = await run({ caption: 'a'.repeat(MAX_CAPTION_LENGTH + 1) });
    expect(errors.some((e) => e.property === 'caption')).toBe(true);
  });

  it('chấp nhận caption dài đúng MAX_CAPTION_LENGTH (biên trên hợp lệ)', async () => {
    await expect(run({ caption: 'a'.repeat(MAX_CAPTION_LENGTH) })).resolves.toHaveLength(0);
  });

  it('từ chối alt_text vượt quá MAX_ALT_TEXT_LENGTH ký tự', async () => {
    const errors = await run({ alt_text: 'a'.repeat(MAX_ALT_TEXT_LENGTH + 1) });
    expect(errors.some((e) => e.property === 'alt_text')).toBe(true);
  });

  it('chấp nhận alt_text dài đúng MAX_ALT_TEXT_LENGTH (biên trên hợp lệ)', async () => {
    await expect(run({ alt_text: 'a'.repeat(MAX_ALT_TEXT_LENGTH) })).resolves.toHaveLength(0);
  });

  it('từ chối caption không phải chuỗi (số)', async () => {
    const errors = await run({ caption: 12345 });
    expect(errors.some((e) => e.property === 'caption')).toBe(true);
  });

  // Cơ sở đích LUÔN là route param — không có đường nào khai nó trong body.
  it.each(['place_id', 'status', 'sort_order', 'cover_image_id', 'object_key', 'bucket', 'checksum_sha256', 'review_id'])(
    'từ chối trường lạ %s trong body (mass-assignment guard)',
    async (field) => {
      const errors = await run({ caption: 'x', [field]: 'evil' });
      expect(errors.some((e) => e.property === field)).toBe(true);
    },
  );
});
