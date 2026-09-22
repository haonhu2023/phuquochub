import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { GLOBAL_LOCALE, SiteContentKey, isLocalizedKey } from './site-content.enums';
import { MediaUrlService } from '../../core/media-url/media-url.service';

export interface SiteContentRow {
  key: SiteContentKey;
  locale: string;
  value: Record<string, unknown>;
  contentVersion: number;
  updatedAt: Date;
}

// Public homepage shape — hero/about resolved for ONE requested locale (falls back to the code
// default in `home.copy.ts` when no override row exists; see toHomePublicView()'s own comment for
// why this stays "override on top of default" rather than "CMS is the only source").
export interface HomePublicContent {
  hero: { eyebrow: string; title: string; lede: string; heroImageUrl: string | null } | null;
  about: { title: string; body: string } | null;
  /** Slug, không phải id — `GET /places` không có bộ lọc theo danh sách id; trang chủ resolve từng
   *  slug qua `GET /places/:slug` đã có sẵn, cùng "placeSlugs" guide's place_collection block đã
   *  dùng (GuideArticlesService.validateBlocks()) thay vì mở thêm mặt truy vấn mới ở backend. */
  featuredPlaceSlugs: string[];
  social: SocialLinks;
}

export interface SocialLinks {
  facebook: string | null;
  zalo: string | null;
  instagram: string | null;
  whatsapp: string | null;
  phone: string | null;
}

const EMPTY_SOCIAL: SocialLinks = { facebook: null, zalo: null, instagram: null, whatsapp: null, phone: null };

const VALID_LOCALES = ['vi', 'en'];

@Injectable()
export class SiteContentService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly mediaUrlService: MediaUrlService,
  ) {}

  // ── Public read ──────────────────────────────────────────────────────────────

  // Guest-facing, no auth — the homepage's server render calls this once per locale. Missing rows
  // are NOT an error: `hero`/`about` fall back to null (caller renders the static `home.copy.ts`
  // default), `featuredPlaceIds` falls back to `[]` (caller renders its existing default query),
  // `social` falls back to all-null (caller hides the section). This is what makes S1 additive —
  // a site with zero site_content rows behaves exactly as it did before this feature existed.
  async getHomeContent(locale: string): Promise<HomePublicContent> {
    const rows = await this.dataSource.query(
      `SELECT key, locale, value, content_version, updated_at FROM site_content
       WHERE (key = $1 AND locale = $2) OR (key = $3 AND locale = $2) OR (key = $4 AND locale = $5) OR (key = $6 AND locale = $5)`,
      [SiteContentKey.HOME_HERO, locale, SiteContentKey.HOME_ABOUT, SiteContentKey.HOME_FEATURED, GLOBAL_LOCALE, SiteContentKey.SOCIAL_LINKS],
    );
    const byKey = new Map<string, { value: Record<string, unknown> }>(rows.map((r: { key: string; value: Record<string, unknown> }) => [r.key, r]));

    const heroRow = byKey.get(SiteContentKey.HOME_HERO);
    const aboutRow = byKey.get(SiteContentKey.HOME_ABOUT);
    const featuredRow = byKey.get(SiteContentKey.HOME_FEATURED);
    const socialRow = byKey.get(SiteContentKey.SOCIAL_LINKS);

    return {
      hero: heroRow
        ? {
            eyebrow: String(heroRow.value.eyebrow ?? ''),
            title: String(heroRow.value.title ?? ''),
            lede: String(heroRow.value.lede ?? ''),
            heroImageUrl: heroRow.value.heroMediaId
              ? this.mediaUrlService.fileUrl(String(heroRow.value.heroMediaId))
              : null,
          }
        : null,
      about: aboutRow ? { title: String(aboutRow.value.title ?? ''), body: String(aboutRow.value.body ?? '') } : null,
      featuredPlaceSlugs: Array.isArray(featuredRow?.value.placeSlugs) ? (featuredRow.value.placeSlugs as string[]) : [],
      social: socialRow ? { ...EMPTY_SOCIAL, ...socialRow.value } : EMPTY_SOCIAL,
    };
  }

  // ── Admin ────────────────────────────────────────────────────────────────────

  // All rows across both locales, for the dashboard's single content-editing form (hero VI + hero
  // EN + about VI + about EN + featured + social, one page — S1's plan row calls for exactly this:
  // "Đổi hero VI/EN, ảnh hero, nổi bật, giới thiệu, liên hệ/mạng xã hội → trang chủ đổi").
  async listAll(): Promise<SiteContentRow[]> {
    const rows = await this.dataSource.query(
      `SELECT key, locale, value, content_version, updated_at FROM site_content ORDER BY key, locale`,
    );
    return rows.map(
      (r: { key: string; locale: string; value: Record<string, unknown>; content_version: number; updated_at: Date }) => ({
        key: r.key as SiteContentKey,
        locale: r.locale,
        value: r.value,
        contentVersion: r.content_version,
        updatedAt: r.updated_at,
      }),
    );
  }

  // CAS upsert: a single `INSERT ... ON CONFLICT DO UPDATE ... WHERE content_version = $expected`
  // statement handles both first-ever creation (expectedContentVersion=0 — the INSERT branch runs
  // unconditionally since the WHERE only gates the UPDATE branch) and subsequent protected edits.
  // Zero rows returned means the WHERE excluded an existing row → the caller's expected version was
  // stale → 409, same contract as places.service.ts/guide-articles.service.ts's CAS methods.
  async upsert(
    key: SiteContentKey,
    requestedLocale: string,
    value: Record<string, unknown>,
    expectedContentVersion: number,
    actorId: string,
  ): Promise<SiteContentRow> {
    const locale = this.resolveLocale(key, requestedLocale);
    this.validateValue(key, value);

    const rows = await this.dataSource.query(
      `INSERT INTO site_content (key, locale, value, content_version, updated_by, updated_at)
       VALUES ($1, $2, $3::jsonb, 1, $4, now())
       ON CONFLICT (key, locale) DO UPDATE
         SET value = $3::jsonb, content_version = site_content.content_version + 1, updated_by = $4, updated_at = now()
         WHERE site_content.content_version = $5
       RETURNING key, locale, value, content_version, updated_at`,
      [key, locale, JSON.stringify(value), actorId, expectedContentVersion],
    );

    if (rows.length === 0) {
      throw new ConflictException(
        `Site content "${key}" (${locale}) was edited by someone else since you loaded it (expected content_version=${expectedContentVersion}) — reload and try again`,
      );
    }

    const row = rows[0];
    return {
      key: row.key,
      locale: row.locale,
      value: row.value,
      contentVersion: row.content_version,
      updatedAt: row.updated_at,
    };
  }

  // ── Helpers ─────────────────────────────────────────────────────────────────

  // Rejects a caller-supplied locale that disagrees with the key's actual localized/global-ness —
  // see UpsertSiteContentDto's comment for why this is a 400 rather than a silent substitution.
  private resolveLocale(key: SiteContentKey, requestedLocale: string): string {
    if (isLocalizedKey(key)) {
      if (!VALID_LOCALES.includes(requestedLocale)) {
        throw new BadRequestException(`"${key}" requires locale to be one of ${VALID_LOCALES.join(', ')}, got "${requestedLocale}"`);
      }
      return requestedLocale;
    }
    if (requestedLocale !== GLOBAL_LOCALE) {
      throw new BadRequestException(`"${key}" is not localized — send locale="${GLOBAL_LOCALE}", got "${requestedLocale}"`);
    }
    return GLOBAL_LOCALE;
  }

  // Enforces the closed per-key content shape — same "DTO checks 'is an object', service enforces
  // the real shape" split GuideArticlesService.validateBlocks() established for guide_blocks.content.
  private validateValue(key: SiteContentKey, value: Record<string, unknown>): void {
    switch (key) {
      case SiteContentKey.HOME_HERO:
        requireNonEmptyString(value, 'eyebrow');
        requireNonEmptyString(value, 'title');
        requireNonEmptyString(value, 'lede');
        requireOptionalString(value, 'heroMediaId');
        break;
      case SiteContentKey.HOME_ABOUT:
        requireNonEmptyString(value, 'title');
        requireNonEmptyString(value, 'body');
        break;
      case SiteContentKey.HOME_FEATURED:
        if (!Array.isArray(value.placeSlugs) || !value.placeSlugs.every((v) => typeof v === 'string')) {
          throw new BadRequestException('home_featured: value.placeSlugs must be an array of strings');
        }
        if (value.placeSlugs.length > 12) {
          throw new BadRequestException('home_featured: value.placeSlugs cannot exceed 12 entries');
        }
        break;
      case SiteContentKey.SOCIAL_LINKS:
        for (const field of ['facebook', 'zalo', 'instagram', 'whatsapp', 'phone'] as const) {
          requireOptionalString(value, field);
        }
        break;
    }
  }
}

function requireNonEmptyString(value: Record<string, unknown>, field: string): void {
  if (typeof value[field] !== 'string' || (value[field] as string).trim() === '') {
    throw new BadRequestException(`value.${field} must be a non-empty string`);
  }
}

function requireOptionalString(value: Record<string, unknown>, field: string): void {
  if (value[field] != null && typeof value[field] !== 'string') {
    throw new BadRequestException(`value.${field} must be a string or omitted`);
  }
}
