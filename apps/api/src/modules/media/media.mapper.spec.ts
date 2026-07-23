import { toMedia } from './media.mapper';
import { Media } from './entities/media.entity';
import { MediaType, MediaProvider, MediaStatus } from './media.enums';

describe('toMedia', () => {
  it('map entity → response snake_case (khớp openapi Media)', () => {
    const m = {
      id: 'm1',
      type: MediaType.IMAGE,
      url: 'https://cdn/x.jpg',
      thumbnailUrl: 'https://cdn/x-thumb.jpg',
      caption: 'Bãi Sao',
      altText: 'bai sao',
      status: MediaStatus.PUBLISHED,
      provider: MediaProvider.UPLOAD,
    } as Media;

    expect(toMedia(m)).toEqual({
      id: 'm1',
      type: MediaType.IMAGE,
      url: 'https://cdn/x.jpg',
      thumbnail_url: 'https://cdn/x-thumb.jpg',
      caption: 'Bãi Sao',
      alt_text: 'bai sao',
      status: MediaStatus.PUBLISHED,
    });
  });
});
