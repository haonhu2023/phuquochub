import { BadRequestException, ConflictException } from '@nestjs/common';
import { SiteContentService } from './site-content.service';
import { SiteContentKey } from './site-content.enums';

const PUBLISHED_MEDIA_ID = 'a1b2c3d4-e5f6-4789-a012-3456789abcde';

// Routes each `dataSource.query()` call to the right canned response based on the SQL text, so
// tests can configure just the branch they care about (media lookup / places lookup / final CAS
// upsert) without hand-rolling a `mockResolvedValueOnce` chain whose order breaks the moment an
// unrelated branch adds/removes a query.
function buildService(opts: {
  mediaRows?: Array<{ id: string }>;
  placeRows?: Array<{ slug: string }>;
  upsertRows?: unknown[];
} = {}) {
  const calls: Array<{ sql: string; params?: unknown[] }> = [];
  const query = jest.fn((sql: string, params?: unknown[]) => {
    calls.push({ sql, params });
    if (sql.includes('FROM media WHERE id')) return Promise.resolve(opts.mediaRows ?? []);
    if (sql.includes('FROM places WHERE slug')) return Promise.resolve(opts.placeRows ?? []);
    return Promise.resolve(opts.upsertRows ?? []);
  });
  const dataSource = { query } as unknown as { query: jest.Mock };
  const mediaUrlService = { fileUrl: jest.fn((id: string) => `https://cdn.test/media/${id}/file`) };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const service = new SiteContentService(dataSource as any, mediaUrlService as any);
  return { service, query, calls, mediaUrlService };
}

function upsertRow(overrides: Record<string, unknown> = {}) {
  return [{ key: 'home_hero', locale: 'vi', value: { title: 't' }, content_version: 1, updated_at: new Date(), ...overrides }];
}

// Extracts the `[key, locale, jsonValue, actorId, expectedContentVersion]` params array from the
// upsert() call's SQL, typed — `query.mock.calls` is otherwise `unknown[]`, which forces every
// call site to repeat the same non-null + cast dance.
function upsertParams(query: jest.Mock): [string, string, string, string, number] {
  const call = query.mock.calls.find((c) => (c[0] as string).includes('ON CONFLICT (key, locale) DO UPDATE'));
  if (!call) throw new Error('upsert() query was never issued');
  return call[1] as [string, string, string, string, number];
}

describe('SiteContentService (S1, 2026-09-22)', () => {
  describe('getHomeContent', () => {
    it('falls back to null/empty when no rows exist — additive, does not require any row', async () => {
      const { service } = buildService();
      const result = await service.getHomeContent('vi');
      expect(result).toEqual({ hero: null, about: null, featuredPlaceSlugs: [], social: { facebook: null, zalo: null, instagram: null, whatsapp: null, phone: null } });
    });

    it('resolves heroImageUrl via MediaUrlService when heroMediaId is set', async () => {
      const rows = [
        { key: 'home_hero', locale: 'vi', value: { eyebrow: 'E', title: 'T', lede: 'L', heroMediaId: 'media-1' } },
      ];
      const { service, mediaUrlService } = buildService({ upsertRows: rows });
      const result = await service.getHomeContent('vi');
      expect(result.hero).toEqual({ eyebrow: 'E', title: 'T', lede: 'L', heroImageUrl: 'https://cdn.test/media/media-1/file' });
      expect(mediaUrlService.fileUrl).toHaveBeenCalledWith('media-1');
    });

    it('returns featuredPlaceSlugs and social overrides when the global-locale rows exist', async () => {
      const rows = [
        { key: 'home_featured', locale: '*', value: { placeSlugs: ['p1', 'p2'] } },
        { key: 'social_links', locale: '*', value: { facebook: 'https://fb.example/x', zalo: null, instagram: null, whatsapp: null, phone: '090' } },
      ];
      const { service } = buildService({ upsertRows: rows });
      const result = await service.getHomeContent('en');
      expect(result.featuredPlaceSlugs).toEqual(['p1', 'p2']);
      expect(result.social).toEqual({ facebook: 'https://fb.example/x', zalo: null, instagram: null, whatsapp: null, phone: '090' });
    });
  });

  describe('listAll', () => {
    it('maps snake_case columns to the camelCase SiteContentRow shape', async () => {
      const now = new Date('2026-09-22T00:00:00Z');
      const rows = [{ key: 'home_hero', locale: 'vi', value: { title: 'T' }, content_version: 3, updated_at: now }];
      const { service } = buildService({ upsertRows: rows });
      const result = await service.listAll();
      expect(result).toEqual([{ key: 'home_hero', locale: 'vi', value: { title: 'T' }, contentVersion: 3, updatedAt: now }]);
    });
  });

  describe('upsert — locale / required-field gating (no query issued)', () => {
    it('rejects a locale that disagrees with a localized key', async () => {
      const { service, query } = buildService();
      await expect(
        service.upsert(SiteContentKey.HOME_HERO, '*', { eyebrow: 'e', title: 't', lede: 'l' }, 0, 'user-1'),
      ).rejects.toThrow(BadRequestException);
      expect(query).not.toHaveBeenCalled();
    });

    it('rejects a real locale for a global key', async () => {
      const { service, query } = buildService();
      await expect(
        service.upsert(SiteContentKey.SOCIAL_LINKS, 'vi', { facebook: null, zalo: null, instagram: null, whatsapp: null, phone: null }, 0, 'user-1'),
      ).rejects.toThrow(BadRequestException);
      expect(query).not.toHaveBeenCalled();
    });

    it('rejects home_hero missing a required field', async () => {
      const { service, query } = buildService();
      await expect(
        service.upsert(SiteContentKey.HOME_HERO, 'vi', { eyebrow: '', title: 't', lede: 'l' }, 0, 'user-1'),
      ).rejects.toThrow(BadRequestException);
      expect(query).not.toHaveBeenCalled();
    });

    it('rejects a field longer than its max length', async () => {
      const { service, query } = buildService();
      await expect(
        service.upsert(SiteContentKey.HOME_HERO, 'vi', { eyebrow: 'x'.repeat(201), title: 't', lede: 'l' }, 0, 'user-1'),
      ).rejects.toThrow(BadRequestException);
      expect(query).not.toHaveBeenCalled();
    });
  });

  describe('upsert — home_hero.heroMediaId', () => {
    it('rejects a non-UUID heroMediaId before any query', async () => {
      const { service, query } = buildService();
      await expect(
        service.upsert(SiteContentKey.HOME_HERO, 'vi', { eyebrow: 'e', title: 't', lede: 'l', heroMediaId: 'not-a-uuid' }, 0, 'user-1'),
      ).rejects.toThrow(BadRequestException);
      expect(query).not.toHaveBeenCalled();
    });

    it('rejects a well-formed UUID that is not a published media row', async () => {
      const { service } = buildService({ mediaRows: [] });
      await expect(
        service.upsert(SiteContentKey.HOME_HERO, 'vi', { eyebrow: 'e', title: 't', lede: 'l', heroMediaId: PUBLISHED_MEDIA_ID }, 0, 'user-1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('accepts a published media id and includes it in the normalized value', async () => {
      const { service, query } = buildService({ mediaRows: [{ id: PUBLISHED_MEDIA_ID }], upsertRows: upsertRow() });
      await service.upsert(SiteContentKey.HOME_HERO, 'vi', { eyebrow: 'e', title: 't', lede: 'l', heroMediaId: PUBLISHED_MEDIA_ID }, 0, 'user-1');
      const params = upsertParams(query);
      expect(JSON.parse(params[2])).toEqual({ eyebrow: 'e', title: 't', lede: 'l', heroMediaId: PUBLISHED_MEDIA_ID });
    });

    it('omitting heroMediaId entirely → normalized value has no heroMediaId key at all', async () => {
      const { service, query } = buildService({ upsertRows: upsertRow() });
      await service.upsert(SiteContentKey.HOME_HERO, 'vi', { eyebrow: 'e', title: 't', lede: 'l' }, 0, 'user-1');
      const params = upsertParams(query);
      expect(JSON.parse(params[2])).toEqual({ eyebrow: 'e', title: 't', lede: 'l' });
    });

    it('trims eyebrow/title/lede', async () => {
      const { service, query } = buildService({ upsertRows: upsertRow() });
      await service.upsert(SiteContentKey.HOME_HERO, 'vi', { eyebrow: '  e  ', title: '  t  ', lede: '  l  ' }, 0, 'user-1');
      const params = upsertParams(query);
      expect(JSON.parse(params[2])).toEqual({ eyebrow: 'e', title: 't', lede: 'l' });
    });
  });

  describe('upsert — home_featured.placeSlugs', () => {
    it('rejects a non-array value', async () => {
      const { service, query } = buildService();
      await expect(service.upsert(SiteContentKey.HOME_FEATURED, '*', { placeSlugs: 'bai-sao' }, 0, 'user-1')).rejects.toThrow(BadRequestException);
      expect(query).not.toHaveBeenCalled();
    });

    it('rejects more than 12 entries AFTER dedupe (so 12 unique + duplicates of them still passes)', async () => {
      const { service, query } = buildService({ placeRows: [] });
      const thirteen = Array.from({ length: 13 }, (_, i) => `p${i}`);
      await expect(service.upsert(SiteContentKey.HOME_FEATURED, '*', { placeSlugs: thirteen }, 0, 'user-1')).rejects.toThrow(BadRequestException);
      expect(query).not.toHaveBeenCalled();
    });

    it('rejects a malformed slug', async () => {
      const { service, query } = buildService();
      await expect(service.upsert(SiteContentKey.HOME_FEATURED, '*', { placeSlugs: ['Bai Sao!'] }, 0, 'user-1')).rejects.toThrow(BadRequestException);
      expect(query).not.toHaveBeenCalled();
    });

    it('rejects a slug that is not a published place, naming it in the error', async () => {
      const { service } = buildService({ placeRows: [{ slug: 'bai-sao' }] });
      await expect(
        service.upsert(SiteContentKey.HOME_FEATURED, '*', { placeSlugs: ['bai-sao', 'gone'] }, 0, 'user-1'),
      ).rejects.toThrow(/gone/);
    });

    it('trims whitespace and dedupes (preserving first-seen order) before checking existence', async () => {
      const { service, query } = buildService({ placeRows: [{ slug: 'bai-sao' }], upsertRows: upsertRow() });
      await service.upsert(SiteContentKey.HOME_FEATURED, '*', { placeSlugs: [' bai-sao ', 'bai-sao', 'bai-sao'] }, 0, 'user-1');
      const params = upsertParams(query);
      expect(JSON.parse(params[2])).toEqual({ placeSlugs: ['bai-sao'] });
    });

    it('empty array is valid (clears the override, no places query issued)', async () => {
      const { service, query } = buildService({ upsertRows: upsertRow() });
      await service.upsert(SiteContentKey.HOME_FEATURED, '*', { placeSlugs: [] }, 0, 'user-1');
      expect(query.mock.calls.some((c) => c[0].includes('FROM places'))).toBe(false);
    });
  });

  describe('upsert — social_links', () => {
    const FULL_NULL = { facebook: null, zalo: null, instagram: null, whatsapp: null, phone: null };

    it('accepts a valid https URL', async () => {
      const { service, query } = buildService({ upsertRows: upsertRow() });
      await service.upsert(SiteContentKey.SOCIAL_LINKS, '*', { ...FULL_NULL, facebook: 'https://facebook.com/x' }, 0, 'user-1');
      const params = upsertParams(query);
      expect(JSON.parse(params[2]).facebook).toBe('https://facebook.com/x');
    });

    it('rejects a javascript: URL (XSS defense at the write boundary)', async () => {
      const { service, query } = buildService();
      await expect(
        service.upsert(SiteContentKey.SOCIAL_LINKS, '*', { ...FULL_NULL, facebook: 'javascript:alert(1)' }, 0, 'user-1'),
      ).rejects.toThrow(BadRequestException);
      expect(query).not.toHaveBeenCalled();
    });

    it('rejects a data: URL', async () => {
      const { service } = buildService();
      await expect(
        service.upsert(SiteContentKey.SOCIAL_LINKS, '*', { ...FULL_NULL, instagram: 'data:text/html,<script>1</script>' }, 0, 'user-1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects a malformed URL', async () => {
      const { service } = buildService();
      await expect(
        service.upsert(SiteContentKey.SOCIAL_LINKS, '*', { ...FULL_NULL, zalo: 'not a url' }, 0, 'user-1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('accepts a valid phone number', async () => {
      const { service, query } = buildService({ upsertRows: upsertRow() });
      await service.upsert(SiteContentKey.SOCIAL_LINKS, '*', { ...FULL_NULL, phone: '+84 909 123 456' }, 0, 'user-1');
      const params = upsertParams(query);
      expect(JSON.parse(params[2]).phone).toBe('+84 909 123 456');
    });

    it('rejects a phone number with letters', async () => {
      const { service } = buildService();
      await expect(
        service.upsert(SiteContentKey.SOCIAL_LINKS, '*', { ...FULL_NULL, phone: 'call-me-maybe' }, 0, 'user-1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('every field null is valid (clears all channels)', async () => {
      const { service, query } = buildService({ upsertRows: upsertRow() });
      await expect(service.upsert(SiteContentKey.SOCIAL_LINKS, '*', FULL_NULL, 0, 'user-1')).resolves.toBeDefined();
      expect(query).toHaveBeenCalled();
    });
  });

  describe('upsert — CAS', () => {
    it('issues the CAS upsert with the resolved locale', async () => {
      const { service, query } = buildService({ upsertRows: upsertRow({ content_version: 1 }) });
      const result = await service.upsert(SiteContentKey.HOME_HERO, 'vi', { eyebrow: 'e', title: 't', lede: 'l' }, 0, 'user-1');
      const params = upsertParams(query);
      expect(params).toEqual([SiteContentKey.HOME_HERO, 'vi', JSON.stringify({ eyebrow: 'e', title: 't', lede: 'l' }), 'user-1', 0]);
      expect(result.contentVersion).toBe(1);
    });

    it('throws ConflictException when the CAS WHERE excludes the row (0 rows returned)', async () => {
      const { service } = buildService({ upsertRows: [] });
      await expect(
        service.upsert(SiteContentKey.SOCIAL_LINKS, '*', { facebook: null, zalo: null, instagram: null, whatsapp: null, phone: null }, 5, 'user-1'),
      ).rejects.toThrow(ConflictException);
    });

    it('resolves global keys to the sentinel locale', async () => {
      const { service, query } = buildService({ upsertRows: upsertRow({ key: 'home_featured', locale: '*' }) });
      await service.upsert(SiteContentKey.HOME_FEATURED, '*', { placeSlugs: [] }, 0, 'user-1');
      const params = upsertParams(query);
      expect(params[1]).toBe('*');
    });
  });
});
