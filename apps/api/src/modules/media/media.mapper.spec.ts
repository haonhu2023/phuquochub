import { toMedia } from './media.mapper';
import { Media } from './entities/media.entity';
import { MediaType, MediaProvider, MediaStatus } from './media.enums';

describe('toMedia', () => {
  const noResolve = (): string => {
    throw new Error('resolvePublicUrl không được gọi trong test này');
  };

  it('map entity → response snake_case (khớp openapi Media); m.url có sẵn (embed) → dùng thẳng, không gọi resolvePublicUrl', () => {
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
    } as Media;

    expect(toMedia(m, noResolve)).toEqual({
      id: 'm1',
      type: MediaType.IMAGE,
      url: 'https://cdn/x.jpg',
      thumbnail_url: 'https://cdn/x-thumb.jpg',
      caption: 'Bãi Sao',
      alt_text: 'bai sao',
      status: MediaStatus.PUBLISHED,
    });
  });

  it('media upload published, url cột = null, có object_key → dựng URL công khai qua resolvePublicUrl', () => {
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

    const resolvePublicUrl = jest.fn().mockReturnValue('https://media.phuquochub.com/phuquochub-prod/media/abc.jpg');

    expect(toMedia(m, resolvePublicUrl)).toEqual(
      expect.objectContaining({ url: 'https://media.phuquochub.com/phuquochub-prod/media/abc.jpg' }),
    );
    expect(resolvePublicUrl).toHaveBeenCalledWith('media/abc.jpg');
  });

  it('media pending (chưa duyệt) → url luôn null, KHÔNG gọi resolvePublicUrl dù có object_key', () => {
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

  it('media hidden/rejected → url luôn null, KHÔNG gọi resolvePublicUrl', () => {
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
});
