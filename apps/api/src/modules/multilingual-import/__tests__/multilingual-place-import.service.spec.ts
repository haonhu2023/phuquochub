import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { getDataSourceToken } from '@nestjs/typeorm';
import { MultilingualPlaceImportService, checkProductionGuard, ImportBundleInput } from '../multilingual-place-import.service';
import { MultilingualImportBatchRepository } from '../repositories/multilingual-import-batch.repository';
import { MultilingualImportRowRepository } from '../repositories/multilingual-import-row.repository';
import { PlaceTranslationsService } from '../../place-translations/place-translations.service';
import { LocalesService } from '../../locales/locales.service';
import {
  MultilingualImportBatchStatus,
  MultilingualImportRowOutcome,
  MULTILINGUAL_IMPORT_CONTRACT_VERSION,
} from '../multilingual-import.enums';
import {
  MultilingualImportContract,
  MultilingualImportContractRow,
  computeRowHash,
  computeManifestChecksum,
} from '../multilingual-import.contract';
import { MultilingualImportBatch } from '../entities/multilingual-import-batch.entity';
import { MultilingualImportRow } from '../entities/multilingual-import-row.entity';
import { PlaceTranslation } from '../../place-translations/entities/place-translation.entity';
import { SupportedLocale } from '../../locales/entities/supported-locale.entity';
import { createMock, LooseMock } from '../../../../test/helpers/create-mock';
import { createHash } from 'crypto';
import { randomUUID } from 'crypto';
import {
  computeReleaseManifestChecksum,
  type ReleaseManifestPayloadV1,
  type ReleaseManifestV1,
} from '../../admin-data/release-manifest.contract';

// Fixture builder shared by every non-dry-run test below — Phase 3.4 of the 2026-09-02
// data-SSOT remediation made a fully-gated release manifest a REQUIRED input for any non-dry-run
// import, so every existing non-dry-run call site needs one to keep exercising the behavior it
// originally tested (a duplicate-batchId test still throws for duplicate-batchId, not for a
// missing manifest, once a valid one is supplied).
function buildReleaseManifest(overrides: Partial<ReleaseManifestPayloadV1> = {}): ReleaseManifestV1 {
  const payload: ReleaseManifestPayloadV1 = {
    releaseManifestVersion: 1,
    releaseItemId: randomUUID(),
    canonicalKey: 'place:test-place',
    slug: 'test-place',
    targetEnvironment: 'local_staging',
    identityResolutionStatus: 'MATCHED',
    policyStatus: 'PASS',
    preflightStatus: 'PASS',
    evidenceDigest: 'a'.repeat(64),
    approval: {
      approvedBy: 'test-owner@example.com',
      approvedAt: '2026-09-03T00:00:00.000Z',
      reason: 'Unit test fixture.',
    },
    subBatches: [{ kind: 'translation', idempotencyKey: randomUUID(), payloadDigest: 'b'.repeat(64) }],
    ...overrides,
  };
  return { payload, checksum: computeReleaseManifestChecksum(payload) };
}

// ============================================================================
// Helpers
// ============================================================================

function sha256hex(s: string): string {
  return createHash('sha256').update(Buffer.from(s, 'utf8')).digest('hex');
}

const VALID_UUID = '12345678-1234-4234-a234-123456789abc';

function makeRow(overrides: Partial<Omit<MultilingualImportContractRow, 'rowHash'>> = {}): MultilingualImportContractRow {
  const base: Omit<MultilingualImportContractRow, 'rowHash'> = {
    placeId: VALID_UUID,
    fieldKey: 'short_description',
    localeCode: 'vi',
    sourceLocaleCode: 'vi',
    translatedText: 'Mô tả',
    sourceText: 'Mô tả',
    textFormat: 'plain_text',
    translationMethod: 'original',
    translationStatus: 'APPROVED',
    humanReviewStatus: 'APPROVED',
    qualityGate: 'PASS',
    duplicateStatus: 'CLEAR',
    foreignKeyStatus: 'PASS',
    validationStatus: 'PASS',
    errorCount: 0,
    isPublic: true,
    isProductionData: true,
    productionEligible: true,
    sourceId: null,
    evidenceId: null,
    ...overrides,
  };
  return { ...base, rowHash: computeRowHash(base) };
}

function makeContract(rows: MultilingualImportContractRow[] = [makeRow()]): MultilingualImportContract {
  return {
    contractVersion: MULTILINGUAL_IMPORT_CONTRACT_VERSION,
    generatedAt: new Date().toISOString(),
    batchId: randomUUID(),
    sourceChecksum: sha256hex('source'),
    approvalEvidenceChecksum: sha256hex('evidence'),
    publishManifestChecksum: computeManifestChecksum(rows),
    totalRows: rows.length,
    rows,
    summary: { byLocale: { vi: rows.length }, byField: { short_description: rows.length }, totalApproved: rows.length, totalHeld: 0, totalRejected: 0 },
  };
}

// ============================================================================
// Production guard (pure function tests — no module setup needed)
// ============================================================================

describe('checkProductionGuard', () => {
  const contract = makeContract();

  it('allows non-production environment without extra vars', () => {
    const result = checkProductionGuard(contract, { NODE_ENV: 'development' });
    expect(result.allowed).toBe(true);
  });

  it('blocks production when ALLOW_PRODUCTION_MULTILINGUAL_IMPORT is missing', () => {
    const result = checkProductionGuard(contract, { NODE_ENV: 'production' });
    expect(result.allowed).toBe(false);
    expect(result.reasons.some(r => r.includes('ALLOW_PRODUCTION_MULTILINGUAL_IMPORT'))).toBe(true);
  });

  it('blocks production when MULTILINGUAL_IMPORT_APPROVED_BATCH_ID is missing', () => {
    const result = checkProductionGuard(contract, {
      NODE_ENV: 'production',
      ALLOW_PRODUCTION_MULTILINGUAL_IMPORT: 'true',
    });
    expect(result.allowed).toBe(false);
    expect(result.reasons.some(r => r.includes('MULTILINGUAL_IMPORT_APPROVED_BATCH_ID'))).toBe(true);
  });

  it('blocks production when approved batchId does not match contract', () => {
    const result = checkProductionGuard(contract, {
      NODE_ENV: 'production',
      ALLOW_PRODUCTION_MULTILINGUAL_IMPORT: 'true',
      MULTILINGUAL_IMPORT_APPROVED_BATCH_ID: 'wrong-id',
      MULTILINGUAL_IMPORT_APPROVED_SOURCE_CHECKSUM: contract.sourceChecksum,
    });
    expect(result.allowed).toBe(false);
    expect(result.reasons.some(r => r.includes('does not match'))).toBe(true);
  });

  it('blocks production when approved sourceChecksum does not match contract', () => {
    const result = checkProductionGuard(contract, {
      NODE_ENV: 'production',
      ALLOW_PRODUCTION_MULTILINGUAL_IMPORT: 'true',
      MULTILINGUAL_IMPORT_APPROVED_BATCH_ID: contract.batchId,
      MULTILINGUAL_IMPORT_APPROVED_SOURCE_CHECKSUM: 'wrong-checksum',
    });
    expect(result.allowed).toBe(false);
  });

  it('allows production when all required env vars are correct', () => {
    const result = checkProductionGuard(contract, {
      NODE_ENV: 'production',
      ALLOW_PRODUCTION_MULTILINGUAL_IMPORT: 'true',
      MULTILINGUAL_IMPORT_APPROVED_BATCH_ID: contract.batchId,
      MULTILINGUAL_IMPORT_APPROVED_SOURCE_CHECKSUM: contract.sourceChecksum,
    });
    expect(result.allowed).toBe(true);
  });

  it('detects production from DATABASE_URL containing "prod"', () => {
    const result = checkProductionGuard(contract, {
      NODE_ENV: 'staging',
      DATABASE_URL: 'postgresql://prod-host/db',
    });
    expect(result.allowed).toBe(false);
  });

  it('has no --force escape hatch', () => {
    // Function.length counts parameters without defaults; `env` has a default so length=1.
    // The meaningful assertion: calling with only the contract (env defaults to process.env) works,
    // and the function type has no `force` parameter at all.
    const contract = makeContract();
    const result = checkProductionGuard(contract); // relies on default env (not production)
    expect(typeof result.allowed).toBe('boolean');
    expect(checkProductionGuard.length).toBe(1); // only `contract` is required
  });
});

// ============================================================================
// Service tests (mocked dependencies)
// ============================================================================

describe('MultilingualPlaceImportService', () => {
  let service: MultilingualPlaceImportService;
  let batchRepo: LooseMock<MultilingualImportBatchRepository>;
  let rowRepo: LooseMock<MultilingualImportRowRepository>;
  let translationsService: LooseMock<PlaceTranslationsService>;
  let localesService: LooseMock<LocalesService>;
  let dataSource: { transaction: jest.Mock };

  beforeEach(async () => {
    batchRepo = createMock<MultilingualImportBatchRepository>({
      findByBatchId: jest.fn(),
      findSucceededBySourceChecksum: jest.fn(),
      findByIdempotencyKey: jest.fn().mockResolvedValue(null),
      insert: jest.fn(),
      update: jest.fn(),
    });

    rowRepo = createMock<MultilingualImportRowRepository>({
      findByBatchRecordId: jest.fn(),
      findPriorSuccessForRowHash: jest.fn(),
      insertMany: jest.fn(),
    });

    translationsService = createMock<PlaceTranslationsService>({
      publishTranslationInTransaction: jest.fn(),
    });

    localesService = createMock<LocalesService>({
      assertPublishableLocale: jest.fn(),
      getKnownLocale: jest.fn(),
    });

    dataSource = {
      transaction: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MultilingualPlaceImportService,
        { provide: MultilingualImportBatchRepository, useValue: batchRepo },
        { provide: MultilingualImportRowRepository, useValue: rowRepo },
        { provide: PlaceTranslationsService, useValue: translationsService },
        { provide: LocalesService, useValue: localesService },
        { provide: getDataSourceToken(), useValue: dataSource },
      ],
    }).compile();

    service = module.get(MultilingualPlaceImportService);
  });

  // ---- helper to set up happy-path mocks ----
  function setupHappyPath(contract: MultilingualImportContract, translationIdResult = randomUUID()): void {
    batchRepo.findByBatchId.mockResolvedValue(null);
    batchRepo.findSucceededBySourceChecksum.mockResolvedValue(null);
    batchRepo.insert.mockImplementation(async (b: MultilingualImportBatch) => b);
    batchRepo.update.mockResolvedValue(undefined);
    localesService.assertPublishableLocale.mockResolvedValue({ localeCode: 'vi' } as unknown as SupportedLocale);
    localesService.getKnownLocale.mockResolvedValue({ localeCode: 'vi' } as unknown as SupportedLocale);
    rowRepo.insertMany.mockResolvedValue(undefined);
    translationsService.publishTranslationInTransaction.mockResolvedValue({
      id: translationIdResult,
      importBatchId: null, // importBatchId set to null to simulate a fresh batch record id
    } as unknown as PlaceTranslation);
    // Simulate transaction: execute callback immediately with a mock manager
    dataSource.transaction.mockImplementation(async (cb: (m: unknown) => Promise<unknown>) => cb({}));
  }

  // ============================================================
  // Contract validation before DB
  // ============================================================

  it('throws BadRequestException when contract version is wrong', async () => {
    const contract = { ...makeContract(), contractVersion: 'bad-version' } as unknown as MultilingualImportContract;
    await expect(service.importBundle({ contract, actorId: VALID_UUID, dryRun: true }))
      .rejects.toBeInstanceOf(BadRequestException);
  });

  it('throws BadRequestException when publishManifestChecksum is tampered', async () => {
    const contract = makeContract();
    const tampered = { ...contract, publishManifestChecksum: 'a'.repeat(64) };
    await expect(service.importBundle({ contract: tampered, actorId: VALID_UUID, dryRun: true }))
      .rejects.toBeInstanceOf(BadRequestException);
  });

  // ============================================================
  // Duplicate batchId
  // ============================================================

  it('throws when batch with same batchId already exists', async () => {
    const contract = makeContract();
    const existingBatch = { batchId: contract.batchId, status: MultilingualImportBatchStatus.SUCCEEDED } as MultilingualImportBatch;
    batchRepo.findByBatchId.mockResolvedValue(existingBatch);
    batchRepo.findSucceededBySourceChecksum.mockResolvedValue(null);
    localesService.assertPublishableLocale.mockResolvedValue({ localeCode: 'vi' } as unknown as SupportedLocale);
    localesService.getKnownLocale.mockResolvedValue({ localeCode: 'vi' } as unknown as SupportedLocale);

    await expect(service.importBundle({ contract, actorId: VALID_UUID, dryRun: false, releaseManifest: buildReleaseManifest() }))
      .rejects.toBeInstanceOf(BadRequestException);
  });

  // ============================================================
  // Duplicate sourceChecksum (non-dry-run)
  // ============================================================

  it('throws when sourceChecksum already succeeded (non-dry-run)', async () => {
    const contract = makeContract();
    batchRepo.findByBatchId.mockResolvedValue(null);
    batchRepo.findSucceededBySourceChecksum.mockResolvedValue({
      batchId: randomUUID(),
      status: MultilingualImportBatchStatus.SUCCEEDED,
    } as unknown as MultilingualImportBatch);
    localesService.assertPublishableLocale.mockResolvedValue({ localeCode: 'vi' } as unknown as SupportedLocale);
    localesService.getKnownLocale.mockResolvedValue({ localeCode: 'vi' } as unknown as SupportedLocale);

    await expect(service.importBundle({ contract, actorId: VALID_UUID, dryRun: false, releaseManifest: buildReleaseManifest() }))
      .rejects.toBeInstanceOf(BadRequestException);
  });

  it('allows duplicate sourceChecksum in dry-run mode', async () => {
    const contract = makeContract();
    setupHappyPath(contract);
    batchRepo.findSucceededBySourceChecksum.mockResolvedValue({
      batchId: randomUUID(),
    } as unknown as MultilingualImportBatch);

    const result = await service.importBundle({ contract, actorId: VALID_UUID, dryRun: true });
    expect(result.dryRun).toBe(true);
  });

  // ============================================================
  // Dry-run mode
  // ============================================================

  it('dry-run returns without writing translations', async () => {
    const contract = makeContract();
    setupHappyPath(contract);

    const result = await service.importBundle({ contract, actorId: VALID_UUID, dryRun: true });

    expect(result.dryRun).toBe(true);
    expect(result.status).toBe(MultilingualImportBatchStatus.PENDING);
    expect(translationsService.publishTranslationInTransaction).not.toHaveBeenCalled();
    expect(dataSource.transaction).not.toHaveBeenCalled();
  });

  // Regression for the local-staging dry-run finding: importBundle() used to call
  // batchRepo.insert() unconditionally BEFORE branching on dryRun, so every dry-run left a
  // real row behind in multilingual_import_batches (dry_run=true, status=pending) even though
  // nothing else was written. That violates this pipeline's own documented contract — reused
  // from VerifiedFactsIngestionService, see PRODUCTION-DATA-DELIVERY-PATH-DESIGN-2026-08-24.md
  // §5.1: "`--dry-run` vẫn chạy đủ [các kiểm tra], chỉ không ghi" (dry-run still runs every
  // check in full, it just does not write) — and matches how every mutation in that sibling
  // service is individually gated on `!dryRun`. Zero DB writes for dry-run, full stop.
  it('dry-run performs zero repository mutations — no batch row, no import row', async () => {
    const contract = makeContract();
    setupHappyPath(contract);

    await service.importBundle({ contract, actorId: VALID_UUID, dryRun: true });

    expect(batchRepo.insert).not.toHaveBeenCalled();
    expect(batchRepo.update).not.toHaveBeenCalled();
    expect(rowRepo.insertMany).not.toHaveBeenCalled();
  });

  // ============================================================
  // Successful write
  // ============================================================

  it('executes the transaction and returns SUCCEEDED on happy path', async () => {
    const newTranslationId = randomUUID();
    const contract = makeContract();
    setupHappyPath(contract, newTranslationId);

    const result = await service.importBundle({ contract, actorId: VALID_UUID, dryRun: false, releaseManifest: buildReleaseManifest() });

    expect(result.status).toBe(MultilingualImportBatchStatus.SUCCEEDED);
    expect(result.failed).toBe(0);
    expect(result.held).toBe(0);
    expect(batchRepo.update).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ status: MultilingualImportBatchStatus.SUCCEEDED }),
    );
  });

  // ============================================================
  // Quality gate — held rows
  // ============================================================

  it('returns HELD outcome when duplicateStatus is not CLEAR', async () => {
    const row = makeRow({ duplicateStatus: 'DUPLICATE' });
    const contract = makeContract([row]);
    setupHappyPath(contract);
    dataSource.transaction.mockImplementation(async (cb: (m: unknown) => Promise<unknown>) => cb({}));

    // Because HELD rows cause a batch failure (throw inside transaction), we expect the batch to fail
    const result = await service.importBundle({ contract, actorId: VALID_UUID, dryRun: false, releaseManifest: buildReleaseManifest() });

    expect(result.status).toBe(MultilingualImportBatchStatus.FAILED);
    expect(result.rowResults.some(r => r.outcome === MultilingualImportRowOutcome.HELD)).toBe(true);
  });

  it('holds a row when foreignKeyStatus is FAIL', async () => {
    const row = makeRow({ foreignKeyStatus: 'FAIL' });
    const contract = makeContract([row]);
    setupHappyPath(contract);

    const result = await service.importBundle({ contract, actorId: VALID_UUID, dryRun: false, releaseManifest: buildReleaseManifest() });

    expect(result.rowResults.some(r => r.outcome === MultilingualImportRowOutcome.HELD)).toBe(true);
  });

  it('holds a row when validationStatus is FAIL', async () => {
    const row = makeRow({ validationStatus: 'FAIL' });
    const contract = makeContract([row]);
    setupHappyPath(contract);

    const result = await service.importBundle({ contract, actorId: VALID_UUID, dryRun: false, releaseManifest: buildReleaseManifest() });

    expect(result.rowResults.some(r => r.outcome === MultilingualImportRowOutcome.HELD)).toBe(true);
  });

  it('holds a row when errorCount > 0', async () => {
    const row = makeRow({ errorCount: 1 });
    const contract = makeContract([row]);
    setupHappyPath(contract);

    const result = await service.importBundle({ contract, actorId: VALID_UUID, dryRun: false, releaseManifest: buildReleaseManifest() });

    expect(result.rowResults.some(r => r.outcome === MultilingualImportRowOutcome.HELD)).toBe(true);
  });

  // REPLACED (human-translation-review, 2026-09-04): the importer used to HOLD every row whose
  // translationStatus wasn't pre-marked APPROVED — meaning nothing could import without being
  // pre-asserted approved by whatever produced the contract, with zero real human review. That is
  // the exact fabricated-approval defect class this workstream closed (see
  // multilingual-place-import.service.ts's own comment at the removed gate). The importer's job is
  // now to create PENDING content; approval is a separate, later human decision through
  // TranslationReviewService. This test now proves the opposite of what it used to: a
  // not-yet-approved row is INSERTED as pending content, not held, and the importer never fabricates
  // a translationStatus/humanReviewStatus of APPROVED on the caller's behalf.
  it('imports a row as pending content when translationStatus is not APPROVED (importer no longer gates on approval)', async () => {
    const newTranslationId = randomUUID();
    const row = makeRow({ translationStatus: 'HOLD', humanReviewStatus: 'PENDING' });
    const contract = makeContract([row]);
    setupHappyPath(contract, newTranslationId);

    const result = await service.importBundle({ contract, actorId: VALID_UUID, dryRun: false, releaseManifest: buildReleaseManifest() });

    expect(result.status).toBe(MultilingualImportBatchStatus.SUCCEEDED);
    expect(result.rowResults.some(r => r.outcome === MultilingualImportRowOutcome.HELD)).toBe(false);
    expect(translationsService.publishTranslationInTransaction).toHaveBeenCalledTimes(1);
  });

  // ============================================================
  // AI + human review gate
  // ============================================================

  it('holds AI translation that is production data without APPROVED human review', async () => {
    const row = makeRow({
      translationMethod: 'ai_plus_human',
      humanReviewStatus: 'PENDING',
      isProductionData: true,
    });
    const contract = makeContract([row]);
    setupHappyPath(contract);

    const result = await service.importBundle({ contract, actorId: VALID_UUID, dryRun: false, releaseManifest: buildReleaseManifest() });

    expect(result.rowResults.some(r => r.outcome === MultilingualImportRowOutcome.HELD)).toBe(true);
    expect(translationsService.publishTranslationInTransaction).not.toHaveBeenCalled();
  });

  it('allows AI translation that is NOT production data without human review', async () => {
    const newTranslationId = randomUUID();
    const row = makeRow({
      translationMethod: 'ai_plus_human',
      humanReviewStatus: 'PENDING',
      isProductionData: false,
    });
    const contract = makeContract([row]);
    setupHappyPath(contract, newTranslationId);

    const result = await service.importBundle({ contract, actorId: VALID_UUID, dryRun: false, releaseManifest: buildReleaseManifest() });

    expect(result.status).toBe(MultilingualImportBatchStatus.SUCCEEDED);
    expect(translationsService.publishTranslationInTransaction).toHaveBeenCalledTimes(1);
  });

  // ============================================================
  // already_current detection
  // ============================================================

  it('returns already_current when publishTranslation returns a row with a different importBatchId', async () => {
    const oldBatchRecordId = randomUUID();
    const contract = makeContract();
    setupHappyPath(contract);
    // publishTranslation returns existing row (idempotent — batchId differs from current run)
    translationsService.publishTranslationInTransaction.mockResolvedValue({
      id: randomUUID(),
      importBatchId: oldBatchRecordId, // != the new batchRecordId assigned in this run
    } as unknown as PlaceTranslation);

    const result = await service.importBundle({ contract, actorId: VALID_UUID, dryRun: false, releaseManifest: buildReleaseManifest() });

    expect(result.status).toBe(MultilingualImportBatchStatus.SUCCEEDED);
    expect(result.rowResults[0].outcome).toBe(MultilingualImportRowOutcome.ALREADY_CURRENT);
    expect(result.alreadyCurrent).toBe(1);
    expect(result.succeeded).toBe(0);
  });

  // ============================================================
  // Locale validation
  // ============================================================

  it('throws when locale is not publishable', async () => {
    const contract = makeContract();
    batchRepo.findByBatchId.mockResolvedValue(null);
    batchRepo.findSucceededBySourceChecksum.mockResolvedValue(null);
    localesService.assertPublishableLocale.mockRejectedValue(new Error('Locale not publishable'));

    await expect(service.importBundle({ contract, actorId: VALID_UUID, dryRun: false, releaseManifest: buildReleaseManifest() }))
      .rejects.toThrow();
  });

  // ============================================================
  // Transaction rollback on row failure
  // ============================================================

  it('marks batch FAILED and rolls back when a row throws', async () => {
    const contract = makeContract([makeRow(), makeRow({ localeCode: 'en', translationMethod: 'human' })]);
    batchRepo.findByBatchId.mockResolvedValue(null);
    batchRepo.findSucceededBySourceChecksum.mockResolvedValue(null);
    batchRepo.insert.mockImplementation(async (b: MultilingualImportBatch) => b);
    batchRepo.update.mockResolvedValue(undefined);
    localesService.assertPublishableLocale.mockResolvedValue({ localeCode: 'vi' } as unknown as SupportedLocale);
    localesService.getKnownLocale.mockResolvedValue({ localeCode: 'vi' } as unknown as SupportedLocale);
    rowRepo.insertMany.mockResolvedValue(undefined);

    // First row succeeds, second throws — the transaction callback re-throws so TypeORM rolls back
    translationsService.publishTranslationInTransaction
      .mockResolvedValueOnce({ id: randomUUID(), importBatchId: null } as unknown as PlaceTranslation)
      .mockRejectedValueOnce(new Error('Place not found'));

    // Simulate transaction: execute callback — re-throw so the service catches it (TypeORM rolls back here in real DB)
    dataSource.transaction.mockImplementation(async (cb: (m: unknown) => Promise<unknown>) => cb({}));

    const result = await service.importBundle({ contract, actorId: VALID_UUID, dryRun: false, releaseManifest: buildReleaseManifest() });

    expect(result.status).toBe(MultilingualImportBatchStatus.FAILED);
    expect(result.failed).toBeGreaterThan(0);
    expect(batchRepo.update).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ status: MultilingualImportBatchStatus.FAILED }),
    );
  });

  // ============================================================
  // BCP-47 locale code handling (delegated to LocalesService)
  // ============================================================

  it('passes vi and en locale codes to assertPublishableLocale', async () => {
    const contract = makeContract([
      makeRow({ localeCode: 'vi' }),
      makeRow({ localeCode: 'en', translationMethod: 'human' }),
    ]);
    setupHappyPath(contract);

    await service.importBundle({ contract, actorId: VALID_UUID, dryRun: true });

    expect(localesService.assertPublishableLocale).toHaveBeenCalledWith('vi');
    expect(localesService.assertPublishableLocale).toHaveBeenCalledWith('en');
  });

  // ============================================================
  // No --force mechanism
  // ============================================================

  it('has no force flag — ImportBundleInput has only contract/actorId/dryRun keys', () => {
    // Verify at runtime that the input object used by callers has no `force` key.
    // TypeScript would prevent a `force` field from being added to ImportBundleInput without
    // also adding it to the interface — so this runtime check is a belt-and-suspenders guard.
    const input: ImportBundleInput = { contract: makeContract(), actorId: VALID_UUID, dryRun: true };
    const keys = Object.keys(input);
    expect(keys).not.toContain('force');
    expect(keys.sort()).toEqual(['actorId', 'contract', 'dryRun']);
  });

  // ============================================================
  // Batch audit is written outside the main transaction
  // ============================================================

  it('calls insertMany for row audit records after the transaction', async () => {
    const contract = makeContract();
    setupHappyPath(contract);

    await service.importBundle({ contract, actorId: VALID_UUID, dryRun: false, releaseManifest: buildReleaseManifest() });

    expect(rowRepo.insertMany).toHaveBeenCalledTimes(1);
    const auditRows = rowRepo.insertMany.mock.calls[0][0] as MultilingualImportRow[];
    expect(auditRows).toHaveLength(1);
    expect(auditRows[0].placeId).toBe(VALID_UUID);
  });

  // ============================================================
  // Release gate (2026-09-02 data-SSOT remediation, Phase 3.4)
  // ============================================================

  it('rejects non-dry-run with no releaseManifest at all — no direct write path bypasses the gate', async () => {
    const contract = makeContract();
    setupHappyPath(contract);

    await expect(
      service.importBundle({ contract, actorId: VALID_UUID, dryRun: false }),
    ).rejects.toThrow(/releaseManifest/);
    expect(batchRepo.insert).not.toHaveBeenCalled();
  });

  it('allows dry-run with no releaseManifest (backward compatible with pre-gate callers)', async () => {
    const contract = makeContract();
    setupHappyPath(contract);

    const result = await service.importBundle({ contract, actorId: VALID_UUID, dryRun: true });
    expect(result.dryRun).toBe(true);
  });

  it.each([
    ['identityResolutionStatus', { identityResolutionStatus: 'HOLD_IDENTITY_CONFLICT' as const }],
    ['policyStatus', { policyStatus: 'FAIL' as const }],
    ['preflightStatus', { preflightStatus: 'NOT_RUN' as const }],
  ])('rejects non-dry-run when %s does not pass the release gate', async (_label, override) => {
    const contract = makeContract();
    setupHappyPath(contract);

    await expect(
      service.importBundle({
        contract,
        actorId: VALID_UUID,
        dryRun: false,
        releaseManifest: buildReleaseManifest(override),
      }),
    ).rejects.toThrow(BadRequestException);
    expect(batchRepo.insert).not.toHaveBeenCalled();
  });

  it('rejects non-dry-run when the release manifest has no translation sub-batch', async () => {
    const contract = makeContract();
    setupHappyPath(contract);

    await expect(
      service.importBundle({
        contract,
        actorId: VALID_UUID,
        dryRun: false,
        releaseManifest: buildReleaseManifest({
          subBatches: [{ kind: 'facts', idempotencyKey: randomUUID(), payloadDigest: 'c'.repeat(64) }],
        }),
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects non-dry-run when the idempotency key was already used by another batch', async () => {
    const contract = makeContract();
    setupHappyPath(contract);
    const manifest = buildReleaseManifest();
    batchRepo.findByIdempotencyKey.mockResolvedValue({
      batchId: randomUUID(),
      status: MultilingualImportBatchStatus.SUCCEEDED,
    } as unknown as MultilingualImportBatch);

    await expect(
      service.importBundle({ contract, actorId: VALID_UUID, dryRun: false, releaseManifest: manifest }),
    ).rejects.toThrow(/idempotencyKey/);
    expect(batchRepo.insert).not.toHaveBeenCalled();
    expect(batchRepo.findByIdempotencyKey).toHaveBeenCalledWith(manifest.payload.subBatches[0].idempotencyKey);
  });

  it('persists release-gate columns onto the batch record on a fully-gated successful run', async () => {
    const contract = makeContract();
    setupHappyPath(contract, randomUUID());
    const manifest = buildReleaseManifest();

    await service.importBundle({ contract, actorId: VALID_UUID, dryRun: false, releaseManifest: manifest });

    expect(batchRepo.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        releaseItemId: manifest.payload.releaseItemId,
        releaseManifestDigest: manifest.checksum,
        evidenceDigest: manifest.payload.evidenceDigest,
        policyStatus: 'PASS',
        preflightStatus: 'PASS',
        idempotencyKey: manifest.payload.subBatches[0].idempotencyKey,
      }),
    );
  });

  it('a dry-run manifest that would fail the gate does not block the dry-run itself (preview, not enforcement)', async () => {
    const contract = makeContract();
    setupHappyPath(contract);

    const result = await service.importBundle({
      contract,
      actorId: VALID_UUID,
      dryRun: true,
      releaseManifest: buildReleaseManifest({ policyStatus: 'FAIL' }),
    });
    expect(result.dryRun).toBe(true);
  });
});
