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
