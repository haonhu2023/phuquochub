import { NotFoundException } from '@nestjs/common';
import { LocalesService } from './locales.service';
import { LocalesRepository } from './repositories/locales.repository';
import { LocaleDirection, LocaleRole, LocaleStatus } from './locales.enums';
import { SupportedLocale } from './entities/supported-locale.entity';

function locale(overrides: Partial<SupportedLocale> = {}): SupportedLocale {
  return {
    localeCode: 'vi',
    languageNameEn: 'Vietnamese',
    nativeName: 'Tiếng Việt',
    direction: LocaleDirection.LTR,
    role: LocaleRole.SOURCE_DEFAULT,
    status: LocaleStatus.ACTIVE,
    isDefault: true,
    isPublic: true,
    isProductionData: true,
    fallbackLocaleCode: null,
    effectiveFrom: null,
    effectiveTo: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('LocalesService', () => {
  let repo: jest.Mocked<LocalesRepository>;
  let service: LocalesService;

  beforeEach(() => {
    repo = {
      findByCode: jest.fn(),
      findAll: jest.fn(),
      findPublic: jest.fn(),
      findDefault: jest.fn(),
    } as unknown as jest.Mocked<LocalesRepository>;
    service = new LocalesService(repo);
  });

  describe('normalizeLocaleCode (BCP-47 casing)', () => {
    it.each([
      ['VI', 'vi'],
      ['En', 'en'],
      ['zh-hans', 'zh-Hans'],
      ['ZH-HANS', 'zh-Hans'],
      ['en-us', 'en-US'],
      ['EN-us', 'en-US'],
      ['  vi  ', 'vi'],
    ])('%s -> %s', (input, expected) => {
      expect(service.normalizeLocaleCode(input)).toBe(expected);
    });
  });

  describe('getKnownLocale', () => {
    it('normalizes casing before lookup', async () => {
      repo.findByCode.mockResolvedValue(locale());
      await service.getKnownLocale('VI');
      expect(repo.findByCode).toHaveBeenCalledWith('vi');
    });

    it('throws NotFoundException for an unknown locale_code', async () => {
      repo.findByCode.mockResolvedValue(null);
      await expect(service.getKnownLocale('xx')).rejects.toThrow(NotFoundException);
    });
  });

  describe('assertPublishableLocale — MAP-033 (PLANNED locale never public/production)', () => {
    it('accepts an ACTIVE, public, production locale', async () => {
      repo.findByCode.mockResolvedValue(locale({ localeCode: 'en', isDefault: false }));
      await expect(service.assertPublishableLocale('en')).resolves.toMatchObject({ localeCode: 'en' });
    });

    it('rejects a PLANNED locale even if is_public/is_production_data were somehow true', async () => {
      repo.findByCode.mockResolvedValue(
        locale({ localeCode: 'fr', status: LocaleStatus.PLANNED, isPublic: false, isProductionData: false, isDefault: false }),
      );
      await expect(service.assertPublishableLocale('fr')).rejects.toThrow(NotFoundException);
    });

    it('rejects a known locale that is not public', async () => {
      repo.findByCode.mockResolvedValue(locale({ localeCode: 'de', isPublic: false, isDefault: false }));
      await expect(service.assertPublishableLocale('de')).rejects.toThrow(NotFoundException);
    });
  });

  describe('resolveRequestLocale — Public Place i18n Read Path locale source', () => {
    it('valid publishable requested locale → returns it, never touches default', async () => {
      repo.findByCode.mockResolvedValue(locale({ localeCode: 'en', isDefault: false }));
      const result = await service.resolveRequestLocale('en');
      expect(result.localeCode).toBe('en');
      expect(repo.findDefault).not.toHaveBeenCalled();
    });

    it('normalizes casing before falling back (EN -> en)', async () => {
      repo.findByCode.mockResolvedValue(locale({ localeCode: 'en', isDefault: false }));
      await service.resolveRequestLocale('EN');
      expect(repo.findByCode).toHaveBeenCalledWith('en');
    });

    it('unknown locale code → falls back to default, does NOT throw', async () => {
      repo.findByCode.mockResolvedValue(null);
      repo.findDefault.mockResolvedValue(locale());
      const result = await service.resolveRequestLocale('xx-not-real');
      expect(result.localeCode).toBe('vi');
    });

    it('known but non-publishable (PLANNED) locale → falls back to default, does NOT throw', async () => {
      repo.findByCode.mockResolvedValue(
        locale({ localeCode: 'fr', status: LocaleStatus.PLANNED, isPublic: false, isProductionData: false, isDefault: false }),
      );
      repo.findDefault.mockResolvedValue(locale());
      const result = await service.resolveRequestLocale('fr');
      expect(result.localeCode).toBe('vi');
    });

    it('known locale that is not public (but is production data) → falls back to default', async () => {
      repo.findByCode.mockResolvedValue(
        locale({ localeCode: 'de', isPublic: false, isProductionData: true, isDefault: false }),
      );
      repo.findDefault.mockResolvedValue(locale());
      const result = await service.resolveRequestLocale('de');
      expect(result.localeCode).toBe('vi');
    });

    it('known locale that is not production data (but is public) → falls back to default', async () => {
      repo.findByCode.mockResolvedValue(
        locale({ localeCode: 'ja', isPublic: true, isProductionData: false, isDefault: false }),
      );
      repo.findDefault.mockResolvedValue(locale());
      const result = await service.resolveRequestLocale('ja');
      expect(result.localeCode).toBe('vi');
    });

    it('no requested locale (undefined) → default locale', async () => {
      repo.findDefault.mockResolvedValue(locale());
      const result = await service.resolveRequestLocale(undefined);
      expect(result.localeCode).toBe('vi');
      expect(repo.findByCode).not.toHaveBeenCalled();
    });

    it('empty string requested locale → treated as not-requested, default locale', async () => {
      repo.findDefault.mockResolvedValue(locale());
      const result = await service.resolveRequestLocale('');
      expect(result.localeCode).toBe('vi');
      expect(repo.findByCode).not.toHaveBeenCalled();
    });
  });

  describe('resolveRequestLocale — infrastructure failures must propagate, never masquerade as a fallback', () => {
    it('repository failure while resolving the REQUESTED locale rejects with the original error and never queries the default locale', async () => {
      const dbError = new Error('ECONNREFUSED: connection to postgres lost');
      repo.findByCode.mockRejectedValue(dbError);

      await expect(service.resolveRequestLocale('en')).rejects.toBe(dbError);
      expect(repo.findDefault).not.toHaveBeenCalled();
    });

    it('an exception from assertPublishableLocale that is NOT the business NotFoundException propagates untouched, no fallback attempted', async () => {
      class UpstreamTimeoutError extends Error {}
      const timeoutError = new UpstreamTimeoutError('query timeout');
      repo.findByCode.mockRejectedValue(timeoutError);

      await expect(service.resolveRequestLocale('vi')).rejects.toBe(timeoutError);
      expect(repo.findDefault).not.toHaveBeenCalled();
    });

    it('default-locale repository failure propagates when no locale was requested at all', async () => {
      const dbError = new Error('ETIMEDOUT: postgres query timeout');
      repo.findDefault.mockRejectedValue(dbError);

      await expect(service.resolveRequestLocale(undefined)).rejects.toBe(dbError);
    });

    it('default-locale repository failure propagates even after a genuinely invalid requested locale (fallback path itself must not swallow a second failure)', async () => {
      const dbError = new Error('ECONNRESET: postgres connection reset');
      repo.findByCode.mockResolvedValue(null); // requested locale genuinely unknown → business NotFoundException
      repo.findDefault.mockRejectedValue(dbError); // but the fallback query itself hits an infra failure

      await expect(service.resolveRequestLocale('xx-not-real')).rejects.toBe(dbError);
    });
  });

  describe('getDefaultLocale', () => {
    it('returns vi as the default (owner decision #2: Vietnamese is the source/default locale)', async () => {
      repo.findDefault.mockResolvedValue(locale());
      const result = await service.getDefaultLocale();
      expect(result.localeCode).toBe('vi');
      expect(result.role).toBe(LocaleRole.SOURCE_DEFAULT);
    });

    it('throws if no default locale is configured', async () => {
      repo.findDefault.mockResolvedValue(null);
      await expect(service.getDefaultLocale()).rejects.toThrow(NotFoundException);
    });
  });
});
