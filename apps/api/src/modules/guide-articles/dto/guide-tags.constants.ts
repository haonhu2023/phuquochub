// Shared between SaveGuideDraftDto and UpdateGuideDraftDto — one source of truth for the DTO
// `@ArrayMaxSize`/`@MaxLength` decorators AND the service's `normalizeTags()` (guide-articles.
// service.ts), so a validation error message and the actual enforced limit can never drift apart.
export const MAX_TAGS = 20;
export const MAX_TAG_LENGTH = 40;
