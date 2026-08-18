import { toMedia } from './media.mapper';
import { Media } from './entities/media.entity';
import { MediaLicenseType, MediaType, MediaProvider, MediaStatus } from './media.enums';

describe('toMedia', () => {
  const noResolve = (): string => {
    throw new Error('resolveFileUrl không được gọi trong test này');
  };

  it('map entity → response snake_case (khớp openapi Media); m.url có sẵn (embed) → dùng thẳng, không gọi resolveFileUrl', () => {
    const m = {
      id: 'm1',
      type: MediaType.IMAGE,
      url: 'https://cdn/x.jpg',
      thumbnailUrl: 'https://cdn/x-thumb.jpg',
      caption: 'Bãi Sao',
      altText: 'bai sao',
      status: MediaStatus.PUBLISHED,
      provider: MediaProvider.UPLOAD,
      objectKey: null,
      licenseType: null,
      attribution: null,
      licenseUrl: null,
    } as Media;

    expect(toMedia(m, noResolve)).toEqual({
      id: 'm1',
      type: MediaType.IMAGE,
      url: 'https://cdn/x.jpg',
      thumbnail_url: 'https://cdn/x-thumb.jpg',
      caption: 'Bãi Sao',
      alt_text: 'bai sao',
      status: MediaStatus.PUBLISHED,
      attribution: null,
      license_type: null,
      license_url: null,
    });
  });

  // Secure Private Media (2026-08-10): resolver nhận MEDIA ID, không phải object_key.
  it('media upload published, url cột = null, có object_key → dựng URL API ổn định qua resolveFileUrl(MEDIA ID)', () => {
    const m = {
      id: 'm2',
      type: MediaType.IMAGE,
      url: null,
      thumbnailUrl: null,
      caption: null,
      altText: null,
      status: MediaStatus.PUBLISHED,
      provider: MediaProvider.UPLOAD,
      objectKey: 'media/abc.jpg',
    } as Media;

    const resolveFileUrl = jest.fn().mockReturnValue('https://phuquochub.com/api/media/m2/file');

    expect(toMedia(m, resolveFileUrl)).toEqual(
      expect.objectContaining({ url: 'https://phuquochub.com/api/media/m2/file' }),
    );
    // SECURITY: resolver nhận id, nên object_key KHÔNG BAO GIỜ có đường rời khỏi server qua mapper.
    expect(resolveFileUrl).toHaveBeenCalledWith('m2');
    expect(resolveFileUrl).not.toHaveBeenCalledWith('media/abc.jpg');
  });

  it('media pending (chưa duyệt) → url luôn null, KHÔNG gọi resolveFileUrl dù có object_key', () => {
    const m = {
      id: 'm3',
      type: MediaType.IMAGE,
      url: null,
      thumbnailUrl: null,
      caption: null,
      altText: null,
      status: MediaStatus.PENDING,
      provider: MediaProvider.UPLOAD,
      objectKey: 'media/pending.jpg',
    } as Media;

    expect(toMedia(m, noResolve).url).toBeNull();
  });

  it('media hidden/rejected → url luôn null, KHÔNG gọi resolveFileUrl', () => {
    const base = {
      id: 'm4',
      type: MediaType.IMAGE,
      url: null,
      thumbnailUrl: null,
      caption: null,
      altText: null,
      provider: MediaProvider.UPLOAD,
      objectKey: 'media/hidden.jpg',
    };

    expect(toMedia({ ...base, status: MediaStatus.HIDDEN } as Media, noResolve).url).toBeNull();
    expect(toMedia({ ...base, status: MediaStatus.REJECTED } as Media, noResolve).url).toBeNull();
  });

  // Place Information Foundation (2026-08-18) — MEDIA_LICENSE_METADATA.
  //
  // Với ảnh CC BY/BY-SA, hiển thị credit + link giấy phép LÀ điều kiện được dùng ảnh. Nếu mapper
  // giữ ba trường này lại ở server thì mọi client đều vi phạm giấy phép mà không có cách nào biết
  // — nên chúng thuộc hợp đồng công khai, và test này là chốt chặn cho điều đó.
  it('phát attribution/license_type/license_url ra hợp đồng công khai (điều kiện tuân thủ CC BY-SA)', () => {
    const m = {
      id: 'm5',
      type: MediaType.IMAGE,
      url: 'https://cdn/bai-sao.jpg',
      thumbnailUrl: null,
      caption: null,
      altText: null,
      status: MediaStatus.PUBLISHED,
      provider: MediaProvider.UPLOAD,
      objectKey: null,
      licenseType: MediaLicenseType.OPEN_LICENSE,
      attribution: 'Trantuonglam / Wikimedia Commons',
      licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/',
    } as Media;

    expect(toMedia(m, noResolve)).toEqual(
      expect.objectContaining({
        attribution: 'Trantuonglam / Wikimedia Commons',
        license_type: 'open_license',
        license_url: 'https://creativecommons.org/licenses/by-sa/4.0/',
      }),
    );
  });

  // Negative control: `null` (chưa ai xét quyền) phải đi qua nguyên vẹn, KHÔNG bị mapper biến
  // thành `'unknown'`. Hai giá trị đó nói hai điều khác nhau — `'unknown'` khẳng định đã có người
  // kiểm tra và không truy được nguồn gốc; suy diễn ra nó là bịa một kết luận chưa ai đưa ra.
  it('licence chưa xét → null đi qua nguyên vẹn, không tự thành "unknown"', () => {
    const m = {
      id: 'm6',
      type: MediaType.IMAGE,
      url: 'https://cdn/legacy.jpg',
      thumbnailUrl: null,
      caption: null,
      altText: null,
      status: MediaStatus.PUBLISHED,
      provider: MediaProvider.UPLOAD,
      objectKey: null,
      licenseType: null,
      attribution: null,
      licenseUrl: null,
    } as Media;

    const out = toMedia(m, noResolve);
    expect(out.license_type).toBeNull();
    expect(out.license_type).not.toBe('unknown');
    expect(out.attribution).toBeNull();
  });
});
