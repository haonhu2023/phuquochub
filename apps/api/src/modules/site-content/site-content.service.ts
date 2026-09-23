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
    const normalizedValue = await this.validateAndNormalizeValue(key, value);

    const rows = await this.dataSource.query(
      `INSERT INTO site_content (key, locale, value, content_version, updated_by, updated_at)
       VALUES ($1, $2, $3::jsonb, 1, $4, now())
       ON CONFLICT (key, locale) DO UPDATE
         SET value = $3::jsonb, content_version = site_content.content_version + 1, updated_by = $4, updated_at = now()
         WHERE site_content.content_version = $5
       RETURNING key, locale, value, content_version, updated_at`,
      [key, locale, JSON.stringify(normalizedValue), actorId, expectedContentVersion],
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

  // Enforces the closed per-key content shape AND normalizes it (trim/dedupe) before it is ever
  // written — same "DTO checks 'is an object', service enforces the real shape" split
  // GuideArticlesService.validateBlocks() established for guide_blocks.content. Async because two
  // branches (heroMediaId, placeSlugs) now cross-check against real rows in `media`/`places` —
  // this is the write-time half of "owner picks real content, not fabricated content" (the
  // read-time half already existed: getHomeContent()'s public callers silently skip a slug/media
  // that later gets unpublished, see DiscoverPlaces.tsx/HomeHero.tsx — this only makes typos and
  // stale references surface as a clear error AT SAVE TIME instead of silently degrading later).
  private async validateAndNormalizeValue(
    key: SiteContentKey,
    value: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    switch (key) {
      case SiteContentKey.HOME_HERO: {
        requireNonEmptyString(value, 'eyebrow', 200);
        requireNonEmptyString(value, 'title', 200);
        requireNonEmptyString(value, 'lede', 500);
        const heroMediaId = await this.validateOptionalHeroMediaId(value.heroMediaId);
        return {
          eyebrow: (value.eyebrow as string).trim(),
          title: (value.title as string).trim(),
          lede: (value.lede as string).trim(),
          ...(heroMediaId ? { heroMediaId } : {}),
        };
      }
      case SiteContentKey.HOME_ABOUT:
        requireNonEmptyString(value, 'title', 200);
        requireNonEmptyString(value, 'body', 2000);
        return { title: (value.title as string).trim(), body: (value.body as string).trim() };
      case SiteContentKey.HOME_FEATURED:
        return { placeSlugs: await this.validateAndNormalizePlaceSlugs(value.placeSlugs) };
      case SiteContentKey.SOCIAL_LINKS: {
        const social: Record<string, string | null> = {};
        for (const field of ['facebook', 'zalo', 'instagram', 'whatsapp'] as const) {
          social[field] = validateOptionalUrl(value[field], field);
        }
        social.phone = validateOptionalPhone(value.phone);
        return social;
      }
    }
  }

  // UUID format + must reference a PUBLISHED media row — same eligibility bar
  // GuideArticlesService.assertMediaPublishEligible() enforces for guide hero/block images (a
  // pending/hidden/rejected/nonexistent media id would otherwise silently render as a broken
  // image on the public homepage with no error anywhere until a human notices).
  private async validateOptionalHeroMediaId(raw: unknown): Promise<string | null> {
    if (raw == null || raw === '') return null;
    if (typeof raw !== 'string' || !UUID_RE.test(raw)) {
      throw new BadRequestException('value.heroMediaId must be a valid media id (UUID)');
    }
    const rows = await this.dataSource.query(`SELECT id FROM media WHERE id = $1 AND status = 'published'`, [raw]);
    if (rows.length === 0) {
      throw new BadRequestException('value.heroMediaId does not reference a published media file');
    }
    return raw;
  }

  // Trim + dedupe (preserving first-seen order) + slug-charset check + must reference an existing
  // PUBLISHED place — a typo'd or already-unpublished slug is rejected HERE, at save time, with a
  // clear error naming the bad slug(s), instead of silently vanishing from the homepage later (the
  // read-side already tolerates a slug going stale AFTER being saved — see DiscoverPlaces.tsx — this
  // only closes the gap for the moment of saving itself).
  private async validateAndNormalizePlaceSlugs(raw: unknown): Promise<string[]> {
    if (!Array.isArray(raw) || !raw.every((v) => typeof v === 'string')) {
      throw new BadRequestException('home_featured: value.placeSlugs must be an array of strings');
    }
    const trimmed = raw.map((s) => s.trim()).filter((s) => s.length > 0);
    const deduped = [...new Set(trimmed)];
    if (deduped.length > 12) {
      throw new BadRequestException('home_featured: value.placeSlugs cannot exceed 12 entries');
    }
    for (const slug of deduped) {
      if (!SLUG_RE.test(slug)) {
        throw new BadRequestException(`home_featured: "${slug}" is not a valid slug`);
      }
    }
    if (deduped.length === 0) return [];

    const rows: Array<{ slug: string }> = await this.dataSource.query(
      `SELECT slug FROM places WHERE slug = ANY($1) AND status = 'published'`,
      [deduped],
    );
    const found = new Set(rows.map((r) => r.slug));
    const missing = deduped.filter((s) => !found.has(s));
    if (missing.length > 0) {
      throw new BadRequestException(
        `home_featured: these slugs are not published places: ${missing.join(', ')}`,
      );
    }
    return deduped;
  }
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
// http(s) only — rejects `javascript:`/`data:`/any other scheme. These values are later embedded
// as raw `href` attributes in SiteFooter (see socialHref()) — blocking a non-http(s) scheme HERE,
// at the one write path, is what keeps that render trustworthy without the render layer having to
// re-validate; React already escapes attribute values, so this is a correctness/safety-in-depth
// gate against a stored `javascript:`/`data:` URL, not a gap in React's own escaping.
const ALLOWED_URL_PROTOCOLS = new Set(['http:', 'https:']);
// Digits, spaces, +, -, (), . — matches how the field is later rendered as `tel:${value}`.
const PHONE_RE = /^[0-9+\-\s().]{6,20}$/;

function requireNonEmptyString(value: Record<string, unknown>, field: string, maxLength: number): void {
  if (typeof value[field] !== 'string' || (value[field] as string).trim() === '') {
    throw new BadRequestException(`value.${field} must be a non-empty string`);
  }
  if ((value[field] as string).trim().length > maxLength) {
    throw new BadRequestException(`value.${field} must be at most ${maxLength} characters`);
  }
}

function validateOptionalUrl(raw: unknown, field: string): string | null {
  if (raw == null || raw === '') return null;
  if (typeof raw !== 'string') {
    throw new BadRequestException(`value.${field} must be a string or omitted`);
  }
  const trimmed = raw.trim();
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new BadRequestException(`value.${field} must be a valid URL`);
  }
  if (!ALLOWED_URL_PROTOCOLS.has(parsed.protocol)) {
    throw new BadRequestException(`value.${field} must use http:// or https://`);
  }
  return trimmed;
}

function validateOptionalPhone(raw: unknown): string | null {
  if (raw == null || raw === '') return null;
  if (typeof raw !== 'string' || !PHONE_RE.test(raw.trim())) {
    throw new BadRequestException('value.phone must be a valid phone number');
  }
  return raw.trim();
}
