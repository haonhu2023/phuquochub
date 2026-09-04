import type { DataSource, EntityManager } from 'typeorm';
import { PlaceTranslationsService } from './place-translations.service';
import { PlaceTranslationsRepository } from './repositories/place-translations.repository';
import { PlaceTranslationRoutesRepository } from './repositories/place-translation-routes.repository';
import { PlaceTranslationSeoRepository } from './repositories/place-translation-seo.repository';
import { LocalesService } from '../locales/locales.service';
import { RevisionsService } from '../revisions/revisions.service';
import { RevisionOrigin } from '../revisions/revision.enums';
import { TranslationMethod } from './place-translations.enums';
import { PlaceTranslation } from './entities/place-translation.entity';

// Mirrors the three fixture rows of `98_I18N_CONTRACT_TEST` (03_Import_Queue.xlsx), each with
// `test_result=PASS` in the contract — i.e. the EXPECTED publish decision matched the ACTUAL one.
// I18N-CONTRACT-002/003 are decisions a future importer's coverage/quality-gate policy makes (out
// of scope for this foundation PR, per ADR-020 "Consequences/Negative" — this ADR does not design
// how quality_gate/human_review_status get evaluated). What THIS foundation guarantees, and what
// these three tests actually verify, is that the schema/service correctly REPRESENTS each outcome
// once a caller has made that decision — a future importer built on top of these primitives can
// implement the gate logic without any schema change.
//
// UPDATED (human-translation-review, 2026-09-04): I18N-CONTRACT-001/002 originally asserted that a
// caller-supplied qualityGate of APPROVED_FOR_PUBLISH made a row immediately isPublic/
// isProductionData=true at publish time — i.e. that publishing WAS approving. That premise is
// exactly the fabricated-approval defect class this workstream closed: qualityGate is a structural/
// data-quality signal (e.g. static validation), never a human-review decision. Both tests below now
// assert the corrected invariant — publish always creates PENDING, not-public content regardless of
// qualityGate; only TranslationReviewService.reviewTranslation() (a real human review, see that
// file) can ever set isPublic/isProductionData=true. qualityGate itself is still faithfully stored
// either way, since it remains a legitimate structural signal, just not an approval one.
const PLACE_ID = 'place-bai-sao';

describe('98_I18N_CONTRACT_TEST fixtures (ADR-020)', () => {
  let translationsRepo: jest.Mocked<PlaceTranslationsRepository>;
  let service: PlaceTranslationsService;
  const store = new Map<string, PlaceTranslation>();

  const fakeManager = { getRepository: () => ({ create: (x: unknown) => x }) } as unknown as EntityManager;

  beforeEach(() => {
    store.clear();
    translationsRepo = {
      findCurrent: jest.fn((placeId: string, fieldKey: string, localeCode: string) => {
        const row = [...store.values()].find(
          (r) => r.placeId === placeId && r.fieldKey === fieldKey && r.localeCode === localeCode && r.isCurrent,
        );
        return Promise.resolve(row ?? null);
      }),
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
      listCurrentByPlace: jest.fn((placeId: string) =>
        Promise.resolve([...store.values()].filter((r) => r.placeId === placeId && r.isCurrent)),
      ),
    } as unknown as jest.Mocked<PlaceTranslationsRepository>;

    const routesRepo = {} as unknown as PlaceTranslationRoutesRepository;
    const seoRepo = {} as unknown as PlaceTranslationSeoRepository;
    const localesService = {
      assertPublishableLocale: jest.fn().mockResolvedValue({ localeCode: 'x', isPublic: true, isProductionData: true }),
      getKnownLocale: jest.fn().mockResolvedValue({ localeCode: 'vi' }),
    } as unknown as jest.Mocked<LocalesService>;
    let revCounter = 0;
    const revisionsService = {
      recordPlaceTranslationRevision: jest.fn(() => Promise.resolve({ id: `rev-${++revCounter}`, revisionNumber: revCounter })),
    } as unknown as jest.Mocked<RevisionsService>;
    const dataSource = {
      transaction: jest.fn((cb: (m: EntityManager) => Promise<unknown>) => cb(fakeManager)),
    } as unknown as jest.Mocked<DataSource>;

    service = new PlaceTranslationsService(translationsRepo, routesRepo, seoRepo, localesService, revisionsService, dataSource);
  });

  it('I18N-CONTRACT-001 — full vi/en coverage, gate APPROVED_FOR_PUBLISH → both locales are current but PENDING, not yet public (approval is a separate human-review step)', async () => {
    const rows = await service.publishTranslationBundle({
      placeId: PLACE_ID,
      origin: RevisionOrigin.IMPORT,
      items: [
        {
          fieldKey: 'short_description',
          localeCode: 'vi',
          sourceLocaleCode: 'vi',
          translatedText: 'Bãi biển đẹp nhất Phú Quốc',
          sourceText: 'Bãi biển đẹp nhất Phú Quốc',
          translationMethod: TranslationMethod.ORIGINAL,
          translationStatus: 'TRANSLATED',
          humanReviewStatus: 'APPROVED',
          qualityGate: 'APPROVED_FOR_PUBLISH',
          isPublic: true,
          isProductionData: true,
          productionEligible: true,
        },
        {
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
        },
      ],
    });

    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.isCurrent)).toBe(true);
    expect(rows.every((r) => !r.isProductionData && !r.isPublic)).toBe(true);
    expect(rows.every((r) => r.humanReviewStatus === 'PENDING' && r.translationStatus === 'PENDING')).toBe(true);
    // qualityGate is still stored faithfully — it is a structural signal, not an approval one.
    expect(rows.every((r) => r.qualityGate === 'APPROVED_FOR_PUBLISH')).toBe(true);
    const currentByPlace = await translationsRepo.listCurrentByPlace(PLACE_ID);
    expect(currentByPlace.map((r) => r.localeCode).sort()).toEqual(['en', 'vi']);
  });

  it('I18N-CONTRACT-002 — one gate FAILs → that locale is written but NOT production data (not published) — same as a passing gate, since neither is ever live at publish time', async () => {
    const [, en] = await service.publishTranslationBundle({
      placeId: PLACE_ID,
      origin: RevisionOrigin.IMPORT,
      items: [
        {
          fieldKey: 'short_description',
          localeCode: 'vi',
          sourceLocaleCode: 'vi',
          translatedText: 'Bãi biển đẹp nhất Phú Quốc',
          sourceText: 'Bãi biển đẹp nhất Phú Quốc',
          translationMethod: TranslationMethod.ORIGINAL,
          translationStatus: 'TRANSLATED',
          humanReviewStatus: 'APPROVED',
          qualityGate: 'APPROVED_FOR_PUBLISH',
          isPublic: true,
          isProductionData: true,
          productionEligible: true,
        },
        {
          fieldKey: 'short_description',
          localeCode: 'en',
          sourceLocaleCode: 'vi',
          translatedText: 'draft — not reviewed yet',
          sourceText: 'Bãi biển đẹp nhất Phú Quốc',
          translationMethod: TranslationMethod.HUMAN,
          translationStatus: 'DRAFT',
          humanReviewStatus: 'PENDING',
          qualityGate: 'NEEDS_REVISION', // one gate FAILs (I18N-CONTRACT-002)
          isPublic: false,
          isProductionData: false, // caller's gate-evaluation decided NO — represented here, not enforced by this foundation
          productionEligible: false,
        },
      ],
    });

    expect(en.isCurrent).toBe(true); // the row exists (queryable for QA) ...
    expect(en.isProductionData).toBe(false); // ... but is not live/published data
    expect(en.qualityGate).toBe('NEEDS_REVISION');
  });

  it('I18N-CONTRACT-003 — missing a required language (only vi present) → en is absent, queryable as "not covered"', async () => {
    await service.publishTranslationBundle({
      placeId: PLACE_ID,
      origin: RevisionOrigin.IMPORT,
      items: [
        {
          fieldKey: 'short_description',
          localeCode: 'vi',
          sourceLocaleCode: 'vi',
          translatedText: 'Bãi biển đẹp nhất Phú Quốc',
          sourceText: 'Bãi biển đẹp nhất Phú Quốc',
          translationMethod: TranslationMethod.ORIGINAL,
          translationStatus: 'TRANSLATED',
          humanReviewStatus: 'APPROVED',
          qualityGate: 'APPROVED_FOR_PUBLISH',
          isPublic: true,
          isProductionData: true,
          productionEligible: true,
        },
      ],
    });

    const current = await translationsRepo.listCurrentByPlace(PLACE_ID);
    expect(current.map((r) => r.localeCode)).toEqual(['vi']);
    expect(current.some((r) => r.localeCode === 'en')).toBe(false);
  });
});
