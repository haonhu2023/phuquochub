import type { DataSource, EntityManager } from 'typeorm';
import { PlaceTranslationsService } from './place-translations.service';
import { PlaceTranslationsRepository } from './repositories/place-translations.repository';
import { PlaceTranslationRoutesRepository } from './repositories/place-translation-routes.repository';
import { PlaceTranslationSeoRepository } from './repositories/place-translation-seo.repository';
import { TranslationReviewService } from './translation-review.service';
import { LocalesService } from '../locales/locales.service';
import { RevisionsService } from '../revisions/revisions.service';
import { RevisionOrigin } from '../revisions/revision.enums';
import { TranslationMethod } from './place-translations.enums';
import { PlaceTranslation } from './entities/place-translation.entity';
import { PublishTranslationItem } from './dto/place-translation.dto';
import { UsersRepository } from '../users/repositories/users.repository';
import { AuthorizationService } from '../authz/authorization.service';
import { HumanReviewStatus } from '../multilingual-import/multilingual-import.enums';
import { User } from '../users/entities/user.entity';
import { LocaleDirection, LocaleRole, LocaleStatus } from '../locales/locales.enums';

// END-TO-END proof of the full human-review lifecycle (Phase 20, human-translation-review
// 2026-09-04) — chains PlaceTranslationsService (content writes) and TranslationReviewService
// (review decisions) against a SHARED in-memory fake store, exactly as they run together in
// production via one DataSource/EntityManager. Uses a legitimate TEST reviewer fixture (not a real
// staging identity) — see REVIEWER below.
//
// Proves, in one continuous run: publish -> APPROVE (real reviewer + timestamp + is_public/
// production_eligible flip true) -> EDIT the same field/locale (new row, forced back to PENDING) ->
// the OLD approval does NOT carry over to the new content -> the new row REJECTED/NEEDS_CHANGES
// never becomes public -> a service account is refused at the review step.
const PLACE_ID = 'place-vinwonders';
const REVIEWER: User = {
  id: 'reviewer-1',
  email: 'test-reviewer@local.test',
  displayName: 'Local Test Reviewer',
  isActive: true,
  isServiceAccount: false,
} as User;
const SERVICE_ACTOR: User = {
  id: 'service-actor-1',
  email: 'local-staging-import-actor@local.invalid',
  displayName: 'Import Service Account',
  isActive: true,
  isServiceAccount: true,
} as User;

function baseItem(overrides: Partial<PublishTranslationItem> = {}): PublishTranslationItem {
  return {
    fieldKey: 'short_description',
    localeCode: 'en',
    sourceLocaleCode: 'vi',
    translatedText: 'The most beautiful beach in Phu Quoc',
    sourceText: 'Bãi biển đẹp nhất Phú Quốc',
    translationMethod: TranslationMethod.HUMAN,
    translationStatus: 'PENDING',
    humanReviewStatus: 'PENDING',
    qualityGate: 'PASS',
    isPublic: true, // deliberately claims true — proves the caller's claim is ignored (see §7)
    isProductionData: true,
    productionEligible: true,
    ...overrides,
  };
}

describe('Human review lifecycle — end-to-end (PlaceTranslationsService + TranslationReviewService)', () => {
  let store: Map<string, PlaceTranslation>;
  let revisionCounter: number;
  let translationsService: PlaceTranslationsService;
  let reviewService: TranslationReviewService;
  const fakeManager = { getRepository: () => ({ create: (x: unknown) => x }) } as unknown as EntityManager;

  beforeEach(() => {
    store = new Map();
    revisionCounter = 0;

    const translationsRepo = {
      findCurrent: jest.fn((placeId: string, fieldKey: string, localeCode: string) =>
        Promise.resolve(
          [...store.values()].find(
            (r) => r.placeId === placeId && r.fieldKey === fieldKey && r.localeCode === localeCode && r.isCurrent,
          ) ?? null,
        ),
      ),
      findById: jest.fn((id: string) => Promise.resolve(store.get(id) ?? null)),
      insert: jest.fn((row: PlaceTranslation) => {
        store.set(row.id, row);
        return Promise.resolve(row);
      }),
      markNotCurrent: jest.fn((id: string) => {
        const row = store.get(id);
        if (row) row.isCurrent = false;
        return Promise.resolve();
      }),
      listCurrentByPlace: jest.fn(() => Promise.resolve([])),
      listReviewQueue: jest.fn(() => Promise.resolve([])),
      updateReviewState: jest.fn((id: string, expectedPrior: string, state: Partial<PlaceTranslation>) => {
        const row = store.get(id);
        if (!row || !row.isCurrent || row.humanReviewStatus !== expectedPrior) {
          return Promise.resolve(false);
        }
        Object.assign(row, state);
        return Promise.resolve(true);
      }),
    } as unknown as PlaceTranslationsRepository;

    const routesRepo = {} as PlaceTranslationRoutesRepository;
    const seoRepo = {} as PlaceTranslationSeoRepository;
    const localesService = {
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
    } as unknown as LocalesService;
    const revisionsService = {
      recordPlaceTranslationRevision: jest.fn(() => {
        revisionCounter += 1;
        return Promise.resolve({ id: `rev-${revisionCounter}`, revisionNumber: revisionCounter });
      }),
    } as unknown as RevisionsService;
    const dataSource = {
      transaction: jest.fn((cb: (m: EntityManager) => Promise<unknown>) => cb(fakeManager)),
    } as unknown as DataSource;

    translationsService = new PlaceTranslationsService(
      translationsRepo,
      routesRepo,
      seoRepo,
      localesService,
      revisionsService,
      dataSource,
    );

    const usersRepo = {
      findById: jest.fn((id: string) => {
        if (id === REVIEWER.id) return Promise.resolve(REVIEWER);
        if (id === SERVICE_ACTOR.id) return Promise.resolve(SERVICE_ACTOR);
        return Promise.resolve(null);
      }),
    } as unknown as UsersRepository;
    const authz = { can: jest.fn().mockResolvedValue(true) } as unknown as AuthorizationService;

    reviewService = new TranslationReviewService(translationsRepo, revisionsService, usersRepo, authz, dataSource);
  });

  it('the full lifecycle: publish (claims public=true) -> forced PENDING -> APPROVE -> edit invalidates -> REJECTED/NEEDS_CHANGES never public -> service account refused', async () => {
    // 1) Publish — caller claims isPublic/isProductionData/productionEligible=true; must be ignored.
    const v1 = await translationsService.publishTranslation(PLACE_ID, baseItem(), RevisionOrigin.IMPORT);
    expect(v1.humanReviewStatus).toBe('PENDING');
    expect(v1.isPublic).toBe(false);
    expect(v1.isProductionData).toBe(false);
    expect(v1.productionEligible).toBe(false);

    // 2) A service account (the exact defect this workstream started from) is refused outright.
    await expect(
      reviewService.reviewTranslation(v1.id, SERVICE_ACTOR.id, HumanReviewStatus.APPROVED, null),
    ).rejects.toThrow();
    expect(store.get(v1.id)!.humanReviewStatus).toBe('PENDING'); // untouched by the refused attempt

    // 3) A real, active, authorized human APPROVEs v1.
    const approved = await reviewService.reviewTranslation(v1.id, REVIEWER.id, HumanReviewStatus.APPROVED, 'verified against official source');
    expect(approved.humanReviewStatus).toBe(HumanReviewStatus.APPROVED);
    expect(approved.isPublic).toBe(true);
    expect(approved.isProductionData).toBe(true);
    expect(approved.productionEligible).toBe(true);
    // (The exact audit-revision shape — reviewer + timestamp + content version — is asserted in
    // translation-review.service.spec.ts's own dedicated test; this file focuses on the lifecycle.)

    // 4) EDIT the same field/locale (a genuine content change) — must insert a NEW row, forced PENDING,
    //    and the OLD row's approval must NOT apply to the new text.
    const v2 = await translationsService.publishTranslation(
      PLACE_ID,
      baseItem({ translatedText: 'An updated, more accurate description' }),
      RevisionOrigin.IMPORT,
    );
    expect(v2.id).not.toBe(v1.id);
    expect(v2.humanReviewStatus).toBe('PENDING');
    expect(v2.isPublic).toBe(false); // EDITED_TRANSLATION_RETAINS_APPROVAL=NO
    expect(store.get(v1.id)!.isCurrent).toBe(false); // old row superseded, not deleted
    expect(store.get(v1.id)!.humanReviewStatus).toBe(HumanReviewStatus.APPROVED); // history preserved, untouched

    // 5) NEEDS_CHANGES on v2 — never public.
    const needsChanges = await reviewService.reviewTranslation(v2.id, REVIEWER.id, HumanReviewStatus.NEEDS_CHANGES, 'fix the claim about size');
    expect(needsChanges.isPublic).toBe(false);
    expect(needsChanges.humanReviewStatus).toBe(HumanReviewStatus.NEEDS_CHANGES);

    // 6) Re-review the SAME row (NEEDS_CHANGES -> REJECTED) without a new edit — allowed, and still never public.
    const rejected = await reviewService.reviewTranslation(v2.id, REVIEWER.id, HumanReviewStatus.REJECTED, 'inaccurate, will not be fixed');
    expect(rejected.isPublic).toBe(false);
    expect(rejected.humanReviewStatus).toBe(HumanReviewStatus.REJECTED);

    // 7) A second decision on the already-REJECTED row (stale tab / double click) is refused, not silently applied.
    await expect(
      reviewService.reviewTranslation(v2.id, REVIEWER.id, HumanReviewStatus.APPROVED, null),
    ).rejects.toThrow();
    expect(store.get(v2.id)!.humanReviewStatus).toBe(HumanReviewStatus.REJECTED); // unchanged
  });
});
