// Enum cluster Source — khớp source.md §4 + migration 1720001700000-InitSources.

export enum SourceType {
  OFFICIAL_WEBSITE = 'official_website',
  BUSINESS_OWNER = 'business_owner',
  GOVERNMENT = 'government',
  GOOGLE_MAPS = 'google_maps',
  OPENSTREETMAP = 'openstreetmap',
  PRESS = 'press',
  FACEBOOK = 'facebook',
  COMMUNITY = 'community',
  FIELD_SURVEY = 'field_survey',
  MODERATOR = 'moderator',
  AI = 'ai',
  OTHER = 'other',
}

export enum SourceKind {
  URL = 'url',
  DATASET = 'dataset',
  PLATFORM_USER = 'platform_user',
  AI_MODEL = 'ai_model',
  OFFLINE = 'offline',
}

// entity_type của source_attributions — VARCHAR mở (B-3), KHÔNG enum. Danh sách dưới
// đây là tập giá trị đã biết (source.md §5) dùng cho validate DTO (@IsIn), không phải
// một kiểu DB. `review`/`wiki_revision` đã có thể ghi attribution dù `reviews` (Wave 3)
// chưa tồn tại — toàn vẹn ở tầng ứng dụng, giống contacts.owner_type đã làm.
export const SOURCE_ATTRIBUTION_ENTITY_TYPES = [
  'place',
  'place_field',
  'contact',
  'media',
  'price_history',
  'place_faq',
  'review',
  'wiki_revision',
] as const;

export type SourceAttributionEntityType = (typeof SOURCE_ATTRIBUTION_ENTITY_TYPES)[number];

// reliability khởi tạo theo `type` (source.md §4.1) — điểm khởi đầu, moderator có thể
// tinh chỉnh riêng cho một `source` cụ thể qua cột `sources.reliability` (không có UI
// tinh chỉnh riêng ở giai đoạn này — quyết định Module 12).
export const SOURCE_TYPE_DEFAULT_RELIABILITY: Record<SourceType, number> = {
  [SourceType.GOVERNMENT]: 95,
  [SourceType.OFFICIAL_WEBSITE]: 90,
  [SourceType.BUSINESS_OWNER]: 85,
  [SourceType.MODERATOR]: 80,
  [SourceType.OPENSTREETMAP]: 75,
  [SourceType.GOOGLE_MAPS]: 70,
  [SourceType.PRESS]: 65,
  [SourceType.FIELD_SURVEY]: 60,
  [SourceType.FACEBOOK]: 55,
  [SourceType.COMMUNITY]: 50,
  [SourceType.OTHER]: 40,
  [SourceType.AI]: 30,
};
