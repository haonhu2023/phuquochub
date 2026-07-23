import { Media } from './entities/media.entity';

// Map entity → response snake_case (khớp openapi Media).
export function toMedia(m: Media) {
  return {
    id: m.id,
    type: m.type,
    url: m.url,
    thumbnail_url: m.thumbnailUrl,
    caption: m.caption,
    alt_text: m.altText,
    status: m.status,
  };
}
