import { BadRequestException } from '@nestjs/common';
import type { DataSource, EntityManager } from 'typeorm';
import { PlaceTranslationsService } from './place-translations.service';
import { PlaceTranslationsRepository } from './repositories/place-translations.repository';
import { PlaceTranslationRoutesRepository } from './repositories/place-translation-routes.repository';
import { PlaceTranslationSeoRepository } from './repositories/place-translation-seo.repository';
import { LocalesService } from '../locales/locales.service';
import { RevisionsService } from '../revisions/revisions.service';
import { RevisionOrigin } from '../revisions/revision.enums';
import { TextFormat, TranslationMethod } from './place-translations.enums';
import { PlaceTranslation } from './entities/place-translation.entity';
import { PublishTranslationItem } from './dto/place-translation.dto';
import { LocaleDirection, LocaleRole, LocaleStatus } from '../locales/locales.enums';
import { computeSourceTextHash } from './source-text-hash';

const PLACE_ID = '11111111-1111-1111-1111-111111111111';

function baseItem(overrides: Partial<PublishTranslationItem> = {}): PublishTranslationItem {
  return {
    fieldKey: 'short_description',
    localeCode: 'en',
    sourceLocaleCode: 'vi',
    translatedText: 'The most beautiful beach in Phu Quoc',
    sourceText: 'Bãi biển đẹp nhất Phú Quốc',
    translationMethod: TranslationMethod.HUMAN,
    translationStatus: 'TRANSLATED',
    humanReviewStatus: 'APPROVED',
    qualityGate: 'APPROVED_FOR_PUBLISH',
    isPublic: true,
    isProductionData: true,
    productionEligible: true,
    ...overrides,
  };
}

function currentRow(overrides: Partial<PlaceTranslation> = {}): PlaceTranslation {
  return {
    id: 'row-existing',
    placeId: PLACE_ID,
    fieldKey: 'short_description',
    localeCode: 'en',
    sourceLocaleCode: 'vi',
    translatedText: 'The most beautiful beach in Phu Quoc',
    textFormat: TextFormat.PLAIN_TEXT,
    sourceTextHash: 'placeholder',
    translationMethod: TranslationMethod.HUMAN,
    translationStatus: 'TRANSLATED',
    humanReviewStatus: 'APPROVED',
    qualityGate: 'APPROVED_FOR_PUBLISH',
    revisionId: 'rev-existing',
    supersedesTranslationId: null,
    isCurrent: true,
    isPublic: true,
    isProductionData: true,
    productionEligible: true,
    sourceId: null,
    evidenceId: null,
    importBatchId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as PlaceTranslation;
}

describe('PlaceTranslationsService', () => {
  let translationsRepo: jest.Mocked<PlaceTranslationsRepository>;
  let routesRepo: jest.Mocked<PlaceTranslationRoutesRepository>;
  let seoRepo: jest.Mocked<PlaceTranslationSeoRepository>;
  let localesService: jest.Mocked<LocalesService>;
  let revisionsService: jest.Mocked<RevisionsService>;
  let dataSource: jest.Mocked<DataSource>;
  let service: PlaceTranslationsService;
  let revisionCounter: number;

  const fakeManager = {
    getRepository: () => ({ create: (x: unknown) => x }),
  } as unknown as EntityManager;

  beforeEach(() => {
    revisionCounter = 0;
    translationsRepo = {
      findCurrent: jest.fn(),
      findCurrentPublic: jest.fn(),
      findById: jest.fn(),
      insert: jest.fn((row) => Promise.resolve(row)),
      markNotCurrent: jest.fn(),
      listCurrentByPlace: jest.fn(),
    } as unknown as jest.Mocked<PlaceTranslationsRepository>;

    routesRepo = {
      findCurrentByPlace: jest.fn(),
      findCurrentBySlug: jest.fn(),
      insert: jest.fn((row) => Promise.resolve(row)),
      markNotCurrent: jest.fn(),
    } as unknown as jest.Mocked<PlaceTranslationRoutesRepository>;

    seoRepo = {
      findCurrent: jest.fn(),
      listCurrentByHreflangGroup: jest.fn(),
      insert: jest.fn((row) => Promise.resolve(row)),
      markNotCurrent: jest.fn(),
    } as unknown as jest.Mocked<PlaceTranslationSeoRepository>;

    localesService = {
      assertPublishableLocale: jest.fn().mockResolvedValue({
        localeCode: 'en',
        languageNameEn: 'English',
        nativeName: 'English',
        direction: LocaleDirection.LTR,
        role: LocaleRole.TARGET_PRIMARY,
        status: LocaleStatus.ACTIVE,
        isDefault: false,
        isPublic: true,
        isProductionData: true,
        fallbackLocaleCode: 'vi',
        effectiveFrom: null,
        effectiveTo: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
      getKnownLocale: jest.fn().mockResolvedValue({ localeCode: 'vi' }),
    } as unknown as jest.Mocked<LocalesService>;

    revisionsService = {
      recordPlaceTranslationRevision: jest.fn(() => {
        revisionCounter += 1;
        return Promise.resolve({ id: `rev-${revisionCounter}`, revisionNumber: revisionCounter });
      }),
    } as unknown as jest.Mocked<RevisionsService>;

    dataSource = {
      transaction: jest.fn((cb: (manager: EntityManager) => Promise<unknown>) => cb(fakeManager)),
    } as unknown as jest.Mocked<DataSource>;

    service = new PlaceTranslationsService(
      translationsRepo,
      routesRepo,
      seoRepo,
      localesService,
      revisionsService,
      dataSource,
    );
  });

  describe('publishTranslation — first publish (no existing current row)', () => {
    it('creates a new current row and one wiki_revisions entry', async () => {
      translationsRepo.findCurrent.mockResolvedValue(null);
      const result = await service.publishTranslation(PLACE_ID, baseItem(), RevisionOrigin.IMPORT);

      expect(localesService.assertPublishableLocale).toHaveBeenCalledWith('en');
      expect(revisionsService.recordPlaceTranslationRevision).toHaveBeenCalledTimes(1);
      expect(translationsRepo.insert).toHaveBeenCalledTimes(1);
      expect(translationsRepo.markNotCurrent).not.toHaveBeenCalled();
      expect(result.isCurrent).toBe(true);
      expect(result.supersedesTranslationId).toBeNull();
    });
  });

  describe('publishTranslation — republish with changed content', () => {
    it('supersedes the previous current row (new row current, old row flipped, chain linked)', async () => {
      const existing = currentRow({ id: 'row-1' });
      translationsRepo.findCurrent.mockResolvedValue(existing);

      const result = await service.publishTranslation(
        PLACE_ID,
        baseItem({ translatedText: 'The most stunning beach in Phu Quoc' }),
        RevisionOrigin.IMPORT,
      );

      expect(translationsRepo.insert).toHaveBeenCalledTimes(1);
      expect(translationsRepo.markNotCurrent).toHaveBeenCalledWith('row-1', fakeManager);
      expect(result.supersedesTranslationId).toBe('row-1');
      expect(result.isCurrent).toBe(true);
    });
  });

  describe('publishTranslation — idempotency', () => {
    it('republishing byte-identical content is a no-op: no new row, no new revision', async () => {
      const item = baseItem();
      const existing = currentRow({
        id: 'row-1',
        translatedText: item.translatedText,
        sourceTextHash: computeSourceTextHash(item.sourceText),
      });
      translationsRepo.findCurrent.mockResolvedValue(existing);

      const result = await service.publishTranslation(PLACE_ID, item, RevisionOrigin.IMPORT);

      expect(revisionsService.recordPlaceTranslationRevision).not.toHaveBeenCalled();
      expect(translationsRepo.insert).not.toHaveBeenCalled();
      expect(translationsRepo.markNotCurrent).not.toHaveBeenCalled();
      expect(result).toBe(existing);
    });
  });

  describe('AI-without-human-review is blocked (RULE-LANG-003)', () => {
    it('rejects an AI-authored, production-flagged translation that is not human-APPROVED', async () => {
      translationsRepo.findCurrent.mockResolvedValue(null);
      const item = baseItem({
        translationMethod: TranslationMethod.AI_PLUS_HUMAN,
        humanReviewStatus: 'PENDING',
        isProductionData: true,
      });
      await expect(service.publishTranslation(PLACE_ID, item, RevisionOrigin.AI_GENERATION)).rejects.toThrow(
        BadRequestException,
      );
      expect(translationsRepo.insert).not.toHaveBeenCalled();
    });

    it('allows an AI-authored translation that is human-APPROVED', async () => {
      translationsRepo.findCurrent.mockResolvedValue(null);
      const item = baseItem({
        translationMethod: TranslationMethod.AI_PLUS_HUMAN,
        humanReviewStatus: 'APPROVED',
        isProductionData: true,
      });
      await expect(service.publishTranslation(PLACE_ID, item, RevisionOrigin.AI_GENERATION)).resolves.toBeDefined();
    });

    it('allows an AI-authored, NOT-yet-production translation regardless of review status (dry-run/staging row)', async () => {
      translationsRepo.findCurrent.mockResolvedValue(null);
      const item = baseItem({
        translationMethod: TranslationMethod.AI_PLUS_HUMAN,
        humanReviewStatus: 'PENDING',
        isProductionData: false,
      });
      await expect(service.publishTranslation(PLACE_ID, item, RevisionOrigin.AI_GENERATION)).resolves.toBeDefined();
    });
  });

  describe('publishTranslationBundle — no partial vi/en publish', () => {
    it('rejects an empty bundle', async () => {
      await expect(
        service.publishTranslationBundle({ placeId: PLACE_ID, items: [], origin: RevisionOrigin.IMPORT }),
      ).rejects.toThrow(BadRequestException);
    });

    it('publishes every item in the bundle when all succeed', async () => {
      translationsRepo.findCurrent.mockResolvedValue(null);
      const result = await service.publishTranslationBundle({
        placeId: PLACE_ID,
        items: [baseItem({ localeCode: 'en' }), baseItem({ localeCode: 'vi', sourceLocaleCode: 'vi', translationMethod: TranslationMethod.ORIGINAL })],
        origin: RevisionOrigin.IMPORT,
      });
      expect(result).toHaveLength(2);
      expect(translationsRepo.insert).toHaveBeenCalledTimes(2);
    });

    it('rolls the whole bundle back (nothing published) when one locale in the bundle fails validation', async () => {
      translationsRepo.findCurrent.mockResolvedValue(null);
      const items = [
        baseItem({ localeCode: 'en' }),
        baseItem({
          localeCode: 'vi',
          translationMethod: TranslationMethod.AI_PLUS_HUMAN,
          humanReviewStatus: 'PENDING',
          isProductionData: true,
        }),
      ];
      await expect(
        service.publishTranslationBundle({ placeId: PLACE_ID, items, origin: RevisionOrigin.IMPORT }),
      ).rejects.toThrow(BadRequestException);
      // dataSource.transaction was given a callback that rejected — in a real Postgres transaction
      // this is exactly what triggers ROLLBACK; this unit test verifies the orchestration contract
      // (a failing item propagates a rejection out of the transaction callback), not Postgres's own
      // rollback behavior, which requires a real database and is out of scope for this foundation.
      expect(dataSource.transaction).toHaveBeenCalledTimes(1);
    });
  });

  describe('rollbackTranslationTo — revision immutability + rollback-to-prior-revision', () => {
    it('inserts a NEW row carrying the target revision content, never mutates history', async () => {
      const target = currentRow({ id: 'row-old', isCurrent: false, translatedText: 'Old English text' });
      const current = currentRow({ id: 'row-new', isCurrent: true, translatedText: 'New English text' });
      translationsRepo.findById.mockResolvedValue(target);
      translationsRepo.findCurrent.mockResolvedValue(current);

      const result = await service.rollbackTranslationTo('row-old');

      expect(translationsRepo.insert).toHaveBeenCalledTimes(1);
      expect(translationsRepo.markNotCurrent).toHaveBeenCalledWith('row-new', fakeManager);
      expect(result.translatedText).toBe('Old English text');
      expect(result.isCurrent).toBe(true);
      expect(result.supersedesTranslationId).toBe('row-new');
    });

    it('is a no-op when the target is already the current row', async () => {
      const current = currentRow({ id: 'row-current' });
      translationsRepo.findById.mockResolvedValue(current);
      translationsRepo.findCurrent.mockResolvedValue(current);

      const result = await service.rollbackTranslationTo('row-current');

      expect(translationsRepo.insert).not.toHaveBeenCalled();
      expect(revisionsService.recordPlaceTranslationRevision).not.toHaveBeenCalled();
      expect(result).toBe(current);
    });

    it('throws when the target translation id does not exist', async () => {
      translationsRepo.findById.mockResolvedValue(null);
      await expect(service.rollbackTranslationTo('missing-id')).rejects.toThrow(BadRequestException);
    });
  });

  describe('publishSeo — no silent fallback to another locale', () => {
    it('rejects robots_index=true without translationIdTitle', async () => {
      await expect(
        service.publishSeo({
          placeId: PLACE_ID,
          localeCode: 'en',
          canonicalUrl: 'https://phuquochub.com/en/places/bai-sao',
          hreflangGroupId: 'group-1',
          robotsIndex: true,
          isPublic: true,
          isProductionData: true,
          origin: RevisionOrigin.IMPORT,
        }),
      ).rejects.toThrow(BadRequestException);
      expect(seoRepo.insert).not.toHaveBeenCalled();
    });

    it('allows robots_index=true when backed by a real translationIdTitle', async () => {
      seoRepo.findCurrent.mockResolvedValue(null);
      await expect(
        service.publishSeo({
          placeId: PLACE_ID,
          localeCode: 'en',
          canonicalUrl: 'https://phuquochub.com/en/places/bai-sao',
          hreflangGroupId: 'group-1',
          robotsIndex: true,
          translationIdTitle: 'row-1',
          isPublic: true,
          isProductionData: true,
          origin: RevisionOrigin.IMPORT,
        }),
      ).resolves.toBeDefined();
      expect(seoRepo.insert).toHaveBeenCalledTimes(1);
    });
  });

  describe('publishRoute — slug collision (MAP-031, scoped per locale)', () => {
    it('rejects when the slug is already current for a DIFFERENT place in the same locale', async () => {
      routesRepo.findCurrentBySlug.mockResolvedValue({
        id: 'route-1',
        placeId: 'some-other-place',
        localeCode: 'en',
        localizedSlug: 'sao-beach',
      } as never);

      await expect(
        service.publishRoute({
          placeId: PLACE_ID,
          localeCode: 'en',
          localizedSlug: 'sao-beach',
          fullPath: '/en/places/sao-beach',
          canonicalUrl: 'https://phuquochub.com/en/places/sao-beach',
          isPublic: true,
          isProductionData: true,
          origin: RevisionOrigin.IMPORT,
        }),
      ).rejects.toThrow(BadRequestException);
      expect(routesRepo.insert).not.toHaveBeenCalled();
    });

    it('allows the same place to republish/update its own slug', async () => {
      routesRepo.findCurrentBySlug.mockResolvedValue({
        id: 'route-1',
        placeId: PLACE_ID,
        localeCode: 'en',
        localizedSlug: 'sao-beach',
      } as never);
      routesRepo.findCurrentByPlace.mockResolvedValue(null);

      await expect(
        service.publishRoute({
          placeId: PLACE_ID,
          localeCode: 'en',
          localizedSlug: 'sao-beach',
          fullPath: '/en/places/sao-beach',
          canonicalUrl: 'https://phuquochub.com/en/places/sao-beach',
          isPublic: true,
          isProductionData: true,
          origin: RevisionOrigin.IMPORT,
        }),
      ).resolves.toBeDefined();
    });

    it('converts the old row to a redirect (never deletes) when the slug changes for the same place', async () => {
      routesRepo.findCurrentBySlug.mockResolvedValue(null);
      routesRepo.findCurrentByPlace.mockResolvedValue({
        id: 'route-old',
        placeId: PLACE_ID,
        localeCode: 'en',
        localizedSlug: 'old-slug',
      } as never);
      const updateSpy = jest.fn();
      const managerWithUpdate = {
        getRepository: () => ({ create: (x: unknown) => x, update: updateSpy }),
      } as unknown as EntityManager;
      (dataSource.transaction as jest.Mock).mockImplementationOnce((cb: (m: EntityManager) => Promise<unknown>) =>
        cb(managerWithUpdate),
      );

      await service.publishRoute({
        placeId: PLACE_ID,
        localeCode: 'en',
        localizedSlug: 'new-slug',
        fullPath: '/en/places/new-slug',
        canonicalUrl: 'https://phuquochub.com/en/places/new-slug',
        isPublic: true,
        isProductionData: true,
        origin: RevisionOrigin.IMPORT,
      });

      expect(updateSpy).toHaveBeenCalledWith(
        { id: 'route-old' },
        { isCurrent: false, isRedirect: true, redirectFromSlug: 'old-slug' },
      );
    });
  });

  describe('getCurrentPublicTranslatedText — Public Place i18n Read Path', () => {
    it('eligible row found → returns its translatedText', async () => {
      translationsRepo.findCurrentPublic.mockResolvedValue(
        currentRow({ translatedText: 'Explore the largest theme park in Vietnam.' }),
      );

      const result = await service.getCurrentPublicTranslatedText(PLACE_ID, 'short_description', 'en');

      expect(result).toBe('Explore the largest theme park in Vietnam.');
      expect(translationsRepo.findCurrentPublic).toHaveBeenCalledWith(PLACE_ID, 'short_description', 'en');
    });

    it('no eligible row (never published, or is_current/is_public/is_production_data fails) → null, not thrown', async () => {
      translationsRepo.findCurrentPublic.mockResolvedValue(null);

      const result = await service.getCurrentPublicTranslatedText(PLACE_ID, 'short_description', 'vi');

      expect(result).toBeNull();
    });
  });
});
