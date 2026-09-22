import { BadRequestException, ConflictException } from '@nestjs/common';
import { SiteContentService } from './site-content.service';
import { SiteContentKey } from './site-content.enums';

function buildService(queryImpl: jest.Mock) {
  const dataSource = { query: queryImpl } as unknown as { query: jest.Mock };
  const mediaUrlService = { fileUrl: jest.fn((id: string) => `https://cdn.test/media/${id}/file`) };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const service = new SiteContentService(dataSource as any, mediaUrlService as any);
  return { service, dataSource, mediaUrlService };
}

describe('SiteContentService (S1, 2026-09-22)', () => {
  describe('getHomeContent', () => {
    it('falls back to null/empty when no rows exist — additive, does not require any row', async () => {
      const { service } = buildService(jest.fn().mockResolvedValue([]));
      const result = await service.getHomeContent('vi');
      expect(result).toEqual({ hero: null, about: null, featuredPlaceSlugs: [], social: { facebook: null, zalo: null, instagram: null, whatsapp: null, phone: null } });
    });

    it('resolves heroImageUrl via MediaUrlService when heroMediaId is set', async () => {
      const rows = [
        { key: 'home_hero', locale: 'vi', value: { eyebrow: 'E', title: 'T', lede: 'L', heroMediaId: 'media-1' } },
      ];
      const { service, mediaUrlService } = buildService(jest.fn().mockResolvedValue(rows));
      const result = await service.getHomeContent('vi');
      expect(result.hero).toEqual({ eyebrow: 'E', title: 'T', lede: 'L', heroImageUrl: 'https://cdn.test/media/media-1/file' });
      expect(mediaUrlService.fileUrl).toHaveBeenCalledWith('media-1');
    });

    it('returns featuredPlaceSlugs and social overrides when the global-locale rows exist', async () => {
      const rows = [
        { key: 'home_featured', locale: '*', value: { placeSlugs: ['p1', 'p2'] } },
        { key: 'social_links', locale: '*', value: { facebook: 'https://fb.example/x', zalo: null, instagram: null, whatsapp: null, phone: '090' } },
      ];
      const { service } = buildService(jest.fn().mockResolvedValue(rows));
      const result = await service.getHomeContent('en');
      expect(result.featuredPlaceSlugs).toEqual(['p1', 'p2']);
      expect(result.social).toEqual({ facebook: 'https://fb.example/x', zalo: null, instagram: null, whatsapp: null, phone: '090' });
    });
  });

  describe('listAll', () => {
    it('maps snake_case columns to the camelCase SiteContentRow shape', async () => {
      const now = new Date('2026-09-22T00:00:00Z');
      const rows = [{ key: 'home_hero', locale: 'vi', value: { title: 'T' }, content_version: 3, updated_at: now }];
      const { service } = buildService(jest.fn().mockResolvedValue(rows));
      const result = await service.listAll();
      expect(result).toEqual([{ key: 'home_hero', locale: 'vi', value: { title: 'T' }, contentVersion: 3, updatedAt: now }]);
    });
  });

  describe('upsert', () => {
    it('rejects a locale that disagrees with a localized key (400, no query issued)', async () => {
      const query = jest.fn();
      const { service } = buildService(query);
      await expect(
        service.upsert(SiteContentKey.HOME_HERO, '*', { eyebrow: 'e', title: 't', lede: 'l' }, 0, 'user-1'),
      ).rejects.toThrow(BadRequestException);
      expect(query).not.toHaveBeenCalled();
    });

    it('rejects a real locale for a global key (400, no query issued)', async () => {
      const query = jest.fn();
      const { service } = buildService(query);
      await expect(
        service.upsert(SiteContentKey.SOCIAL_LINKS, 'vi', { facebook: null, zalo: null, instagram: null, whatsapp: null, phone: null }, 0, 'user-1'),
      ).rejects.toThrow(BadRequestException);
      expect(query).not.toHaveBeenCalled();
    });

    it('rejects home_hero missing a required field before ever issuing a query', async () => {
      const query = jest.fn();
      const { service } = buildService(query);
      await expect(
        service.upsert(SiteContentKey.HOME_HERO, 'vi', { eyebrow: '', title: 't', lede: 'l' }, 0, 'user-1'),
      ).rejects.toThrow(BadRequestException);
      expect(query).not.toHaveBeenCalled();
    });

    it('rejects home_featured with more than 12 place ids', async () => {
      const query = jest.fn();
      const { service } = buildService(query);
      const placeSlugs = Array.from({ length: 13 }, (_, i) => `p${i}`);
      await expect(
        service.upsert(SiteContentKey.HOME_FEATURED, '*', { placeSlugs }, 0, 'user-1'),
      ).rejects.toThrow(BadRequestException);
      expect(query).not.toHaveBeenCalled();
    });

    it('issues the CAS upsert with the resolved locale and JSON-stringified value', async () => {
      const returned = [{ key: 'home_hero', locale: 'vi', value: { eyebrow: 'e', title: 't', lede: 'l' }, content_version: 1, updated_at: new Date() }];
      const query = jest.fn().mockResolvedValue(returned);
      const { service } = buildService(query);

      const result = await service.upsert(SiteContentKey.HOME_HERO, 'vi', { eyebrow: 'e', title: 't', lede: 'l' }, 0, 'user-1');

      expect(query.mock.calls[0][0]).toContain('ON CONFLICT (key, locale) DO UPDATE');
      expect(query.mock.calls[0][1]).toEqual([
        SiteContentKey.HOME_HERO,
        'vi',
        JSON.stringify({ eyebrow: 'e', title: 't', lede: 'l' }),
        'user-1',
        0,
      ]);
      expect(result.contentVersion).toBe(1);
    });

    it('throws ConflictException when the CAS WHERE excludes the row (0 rows returned)', async () => {
      const query = jest.fn().mockResolvedValue([]);
      const { service } = buildService(query);
      await expect(
        service.upsert(SiteContentKey.SOCIAL_LINKS, '*', { facebook: null, zalo: null, instagram: null, whatsapp: null, phone: null }, 5, 'user-1'),
      ).rejects.toThrow(ConflictException);
    });

    it('resolves global keys to the sentinel locale regardless of what is passed for GLOBAL_LOCALE itself', async () => {
      const query = jest.fn().mockResolvedValue([{ key: 'home_featured', locale: '*', value: { placeSlugs: [] }, content_version: 1, updated_at: new Date() }]);
      const { service } = buildService(query);
      await service.upsert(SiteContentKey.HOME_FEATURED, '*', { placeSlugs: [] }, 0, 'user-1');
      expect(query.mock.calls[0][1][1]).toBe('*');
    });
  });
});
