import { IsIn, IsInt, IsObject, IsString, Min } from 'class-validator';
import { SiteContentKey } from '../site-content.enums';

// PUT /admin/site-content/:key body. `locale` is REQUIRED even for global keys (SOCIAL_LINKS,
// HOME_FEATURED) — the caller states which locale it believes it is writing, and the service
// rejects a mismatch against the key's actual localized/global-ness rather than silently
// substituting the sentinel, so a client bug (e.g. sending `locale: 'en'` for a global key) surfaces
// as a 400 instead of writing to the wrong row.
//
// `value`'s per-key shape (hero: eyebrow/title/lede/heroMediaId; social: facebook/zalo/…) is
// validated in SiteContentService.validateValue() — the same "DTO checks 'is an object', service
// enforces the closed per-key shape" split GuideArticlesService.validateBlocks() already
// established, not re-declared as N nested DTO classes for four small, rarely-changing shapes.
//
// `expectedContentVersion` allows 0 — that is the CAS token for "I believe this key/locale has
// never been written before" (see SiteContentService.upsert()'s upsert SQL comment).
export class UpsertSiteContentDto {
  @IsIn(Object.values(SiteContentKey))
  key!: SiteContentKey;

  @IsString()
  locale!: string;

  @IsObject()
  value!: Record<string, unknown>;

  @IsInt() @Min(0)
  expectedContentVersion!: number;
}
