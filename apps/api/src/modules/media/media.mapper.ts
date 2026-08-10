import { Media } from './entities/media.entity';
import { MediaStatus } from './media.enums';

export type MediaResponse = ReturnType<typeof toMedia>;

// Map entity → response snake_case (khớp openapi Media). `resolvePublicUrl` sinh URL đọc công
// khai từ object_key cho media upload (m.url luôn null với các dòng này — Design review §A).
// CHỈ gọi cho media `published`: pending/hidden/rejected không bao giờ được lộ URL đọc được,
// giữ đúng bất biến "no public URL for pending, unmoderated media" (media.service.ts's register()).
export function toMedia(m: Media, resolvePublicUrl: (objectKey: string) => string) {
  const url = m.url ?? (m.status === MediaStatus.PUBLISHED && m.objectKey ? resolvePublicUrl(m.objectKey) : null);
  return {
    id: m.id,
    type: m.type,
    url,
    thumbnail_url: m.thumbnailUrl,
    caption: m.caption,
    alt_text: m.altText,
    status: m.status,
  };
}
