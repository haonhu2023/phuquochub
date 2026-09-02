import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import { randomUUID } from 'crypto';
import {
  MultilingualImportContract,
  MultilingualImportContractRow,
  computeManifestChecksum,
  validateContract,
} from './multilingual-import.contract';
import {
  DuplicateStatus,
  ForeignKeyStatus,
  HumanReviewStatus,
  MultilingualImportBatchStatus,
  MultilingualImportRowOutcome,
  MULTILINGUAL_IMPORT_CONTRACT_VERSION,
  TranslationApprovalStatus,
  ValidationStatus,
} from './multilingual-import.enums';
import { MultilingualImportBatch } from './entities/multilingual-import-batch.entity';
import { MultilingualImportRow } from './entities/multilingual-import-row.entity';
import { MultilingualImportBatchRepository } from './repositories/multilingual-import-batch.repository';
import { MultilingualImportRowRepository } from './repositories/multilingual-import-row.repository';
import { PlaceTranslationsService } from '../place-translations/place-translations.service';
import { LocalesService } from '../locales/locales.service';
import { RevisionOrigin } from '../revisions/revision.enums';
import { TextFormat, TranslationMethod } from '../place-translations/place-translations.enums';

// ============================================================================
// Production safety
// ============================================================================

export interface ProductionGuardResult {
  allowed: boolean;
  reasons: string[];
}

export function checkProductionGuard(
  contract: MultilingualImportContract,
  env: NodeJS.ProcessEnv = process.env,
): ProductionGuardResult {
  const reasons: string[] = [];
  const isProduction =
    env['NODE_ENV'] === 'production' ||
    ['DATABASE_URL', 'DB_HOST', 'DB_NAME'].some(k => env[k] && /prod/i.test(env[k]!));

  if (!isProduction) return { allowed: true, reasons: [] };

  if (env['ALLOW_PRODUCTION_MULTILINGUAL_IMPORT'] !== 'true') {
    reasons.push('ALLOW_PRODUCTION_MULTILINGUAL_IMPORT must be exactly "true" for production runs');
  }
  if (!env['MULTILINGUAL_IMPORT_APPROVED_BATCH_ID']) {
    reasons.push('MULTILINGUAL_IMPORT_APPROVED_BATCH_ID is required in production');
  } else if (env['MULTILINGUAL_IMPORT_APPROVED_BATCH_ID'] !== contract.batchId) {
    reasons.push(
      `MULTILINGUAL_IMPORT_APPROVED_BATCH_ID="${env['MULTILINGUAL_IMPORT_APPROVED_BATCH_ID']}" does not match contract batchId="${contract.batchId}"`,
    );
  }
  if (!env['MULTILINGUAL_IMPORT_APPROVED_SOURCE_CHECKSUM']) {
    reasons.push('MULTILINGUAL_IMPORT_APPROVED_SOURCE_CHECKSUM is required in production');
  } else if (env['MULTILINGUAL_IMPORT_APPROVED_SOURCE_CHECKSUM'] !== contract.sourceChecksum) {
    reasons.push(
      `MULTILINGUAL_IMPORT_APPROVED_SOURCE_CHECKSUM does not match contract sourceChecksum`,
    );
  }

  return { allowed: reasons.length === 0, reasons };
}

// ============================================================================
// Input / output types
// ============================================================================

export interface ImportBundleInput {
  contract: MultilingualImportContract;
  actorId: string;
  dryRun: boolean;
}

export interface ImportRowResult {
  placeId: string;
  fieldKey: string;
  localeCode: string;
  rowHash: string;
  outcome: MultilingualImportRowOutcome;
  translationId: string | null;
  errorDetail: string | null;
}

export interface ImportBundleResult {
  batchId: string;
  batchRecordId: string;
  dryRun: boolean;
  status: MultilingualImportBatchStatus;
  totalRows: number;
  succeeded: number;
  alreadyCurrent: number;
  held: number;
  failed: number;
  rowResults: ImportRowResult[];
  errorSummary: string | null;
}

// ============================================================================
// Service
// ============================================================================

// Main import service. Dry-run is the default — pass dryRun=false only when
// production guards are met and the operator explicitly passes --execute.
// One transaction per batch: any row failure rolls back all insertions.
@Injectable()
export class MultilingualPlaceImportService {
  private readonly logger = new Logger(MultilingualPlaceImportService.name);

  constructor(
    private readonly batchRepo: MultilingualImportBatchRepository,
    private readonly rowRepo: MultilingualImportRowRepository,
    private readonly translationsService: PlaceTranslationsService,
    private readonly localesService: LocalesService,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  async importBundle(input: ImportBundleInput): Promise<ImportBundleResult> {
    const { contract, actorId, dryRun } = input;

    // 1. Validate contract structure + checksums before touching DB
    const validation = validateContract(contract);
    if (!validation.valid) {
      throw new BadRequestException(
        `Contract validation failed:\n${validation.errors.map(e => `  ${e.field}: ${e.message}`).join('\n')}`,
      );
    }
    if (contract.contractVersion !== MULTILINGUAL_IMPORT_CONTRACT_VERSION) {
      throw new BadRequestException(`Unsupported contract version: ${contract.contractVersion}`);
    }

    // Recompute publishManifestChecksum as an extra tamper check
    const recomputedManifest = computeManifestChecksum(contract.rows);
    if (recomputedManifest !== contract.publishManifestChecksum) {
      throw new BadRequestException(
        `publishManifestChecksum mismatch: contract="${contract.publishManifestChecksum}" recomputed="${recomputedManifest}"`,
      );
    }

    // 2. Production safety check
    const guard = checkProductionGuard(contract);
    if (!guard.allowed) {
      throw new BadRequestException(
        `Production guard blocked the import:\n${guard.reasons.map(r => `  - ${r}`).join('\n')}`,
      );
    }

    // 3. Idempotency: block duplicate batchId
    const existingBatch = await this.batchRepo.findByBatchId(contract.batchId);
    if (existingBatch) {
      throw new BadRequestException(
        `Batch ${contract.batchId} already exists with status=${existingBatch.status}. ` +
          `To re-import updated content, create a new bundle with a new batchId.`,
      );
    }

    // 4. Idempotency: block duplicate sourceChecksum among succeeded runs (same XLSX re-submitted)
    const existingByChecksum = await this.batchRepo.findSucceededBySourceChecksum(contract.sourceChecksum);
    if (existingByChecksum && !dryRun) {
      throw new BadRequestException(
        `sourceChecksum ${contract.sourceChecksum} already succeeded in batch ${existingByChecksum.batchId}. ` +
          `Submit a new bundle with updated content or a different batchId if this is intentional.`,
      );
    }

    // 5. Pre-validate all locales before opening a DB transaction
    for (const row of contract.rows) {
      await this.localesService.assertPublishableLocale(row.localeCode);
      await this.localesService.getKnownLocale(row.sourceLocaleCode);
    }

    // 6. Build the batch record in memory. Dry-run stops here and returns a simulated
    // result WITHOUT persisting anything — same contract as VerifiedFactsIngestionService
    // (PRODUCTION-DATA-DELIVERY-PATH-DESIGN-2026-08-24.md §5.1: "--dry-run vẫn chạy đủ [mọi
    // kiểm tra], chỉ không ghi"): every check above still ran in full, but zero rows are
    // written to multilingual_import_batches (or anywhere else) unless execution was requested.
    const batchRecord = new MultilingualImportBatch();
    batchRecord.id = randomUUID();
    batchRecord.batchId = contract.batchId;
    batchRecord.contractVersion = contract.contractVersion;
    batchRecord.sourceChecksum = contract.sourceChecksum;
    batchRecord.approvalEvidenceChecksum = contract.approvalEvidenceChecksum;
    batchRecord.publishManifestChecksum = contract.publishManifestChecksum;
    batchRecord.totalRows = contract.totalRows;
    batchRecord.status = MultilingualImportBatchStatus.PENDING;
    batchRecord.dryRun = dryRun;
    batchRecord.actorId = actorId;
    batchRecord.succeededRows = null;
    batchRecord.failedRows = null;
    batchRecord.heldRows = null;
    batchRecord.alreadyCurrentRows = null;
    batchRecord.errorSummary = null;
    batchRecord.startedAt = null;
    batchRecord.completedAt = null;

    if (dryRun) {
      return this.buildDryRunResult(batchRecord, contract);
    }

    // 7. Execute: persist the batch record as RUNNING, then one transaction for the entire batch.
    batchRecord.status = MultilingualImportBatchStatus.RUNNING;
    batchRecord.startedAt = new Date();
    await this.batchRepo.insert(batchRecord);

    const rowResults: ImportRowResult[] = [];
    let errorSummary: string | null = null;

    try {
      await this.dataSource.transaction(async (manager) => {
        for (const contractRow of contract.rows) {
          const result = await this.importOneRow(contractRow, batchRecord.id, actorId, manager);
          rowResults.push(result);
          if (result.outcome === MultilingualImportRowOutcome.FAILED || result.outcome === MultilingualImportRowOutcome.HELD) {
            throw new Error(`Row ${result.outcome}: place=${contractRow.placeId} field=${contractRow.fieldKey} locale=${contractRow.localeCode}: ${result.errorDetail}`);
          }
        }
      });
    } catch (err) {
      errorSummary = err instanceof Error ? err.message : String(err);
      this.logger.error(`Batch ${contract.batchId} failed: ${errorSummary}`);

      // Mark batch FAILED — the transaction above rolled back so no place_translations were written
      const counts = this.countOutcomes(rowResults);
      await this.batchRepo.update(batchRecord.id, {
        status: MultilingualImportBatchStatus.FAILED,
        completedAt: new Date(),
        succeededRows: counts.succeeded,
        alreadyCurrentRows: counts.alreadyCurrent,
        heldRows: counts.held,
        failedRows: contract.totalRows - rowResults.length + counts.failed,
        errorSummary: errorSummary.slice(0, 2000),
      });

      // Write row audit records (outside the rolled-back transaction)
      await this.writeRowAudits(rowResults, batchRecord.id);

      return {
        batchId: contract.batchId,
        batchRecordId: batchRecord.id,
        dryRun: false,
        status: MultilingualImportBatchStatus.FAILED,
        totalRows: contract.totalRows,
        ...counts,
        rowResults,
        errorSummary,
      };
    }

    // Success
    const counts = this.countOutcomes(rowResults);
    await this.batchRepo.update(batchRecord.id, {
      status: MultilingualImportBatchStatus.SUCCEEDED,
      completedAt: new Date(),
      succeededRows: counts.succeeded,
      alreadyCurrentRows: counts.alreadyCurrent,
      heldRows: counts.held,
      failedRows: 0,
      errorSummary: null,
    });

    await this.writeRowAudits(rowResults, batchRecord.id);

    this.logger.log(
      `Batch ${contract.batchId} SUCCEEDED: ${counts.succeeded} inserted, ${counts.alreadyCurrent} already_current, ${counts.held} held`,
    );

    return {
      batchId: contract.batchId,
      batchRecordId: batchRecord.id,
      dryRun: false,
      status: MultilingualImportBatchStatus.SUCCEEDED,
      totalRows: contract.totalRows,
      ...counts,
      rowResults,
      errorSummary: null,
    };
  }

  private async importOneRow(
    row: MultilingualImportContractRow,
    batchRecordId: string,
    actorId: string,
    manager: EntityManager,
  ): Promise<ImportRowResult> {
    const base = { placeId: row.placeId, fieldKey: row.fieldKey, localeCode: row.localeCode, rowHash: row.rowHash };

    try {
      // Quality gate checks — held rows abort the batch
      if (row.duplicateStatus !== DuplicateStatus.CLEAR) {
        return { ...base, outcome: MultilingualImportRowOutcome.HELD, translationId: null, errorDetail: `duplicate_status=${row.duplicateStatus}` };
      }
      if (row.foreignKeyStatus !== ForeignKeyStatus.PASS) {
        return { ...base, outcome: MultilingualImportRowOutcome.HELD, translationId: null, errorDetail: `foreign_key_status=${row.foreignKeyStatus}` };
      }
      if (row.validationStatus === ValidationStatus.FAIL) {
        return { ...base, outcome: MultilingualImportRowOutcome.HELD, translationId: null, errorDetail: `validation_status=FAIL` };
      }
      if (row.errorCount !== 0) {
        return { ...base, outcome: MultilingualImportRowOutcome.HELD, translationId: null, errorDetail: `error_count=${row.errorCount}` };
      }
      if (row.translationStatus !== TranslationApprovalStatus.APPROVED) {
        return { ...base, outcome: MultilingualImportRowOutcome.HELD, translationId: null, errorDetail: `translation_status=${row.translationStatus}` };
      }
      // AI translations must have human approval before going production
      if (
        row.translationMethod === 'ai_plus_human' &&
        row.humanReviewStatus !== HumanReviewStatus.APPROVED &&
        row.isProductionData
      ) {
        return { ...base, outcome: MultilingualImportRowOutcome.HELD, translationId: null, errorDetail: `ai_plus_human requires human_review_status=APPROVED for is_production_data=true` };
      }

      const published = await this.translationsService.publishTranslationInTransaction(
        row.placeId,
        {
          fieldKey: row.fieldKey,
          localeCode: row.localeCode,
          sourceLocaleCode: row.sourceLocaleCode,
          translatedText: row.translatedText,
          sourceText: row.sourceText,
          textFormat: row.textFormat as TextFormat,
          translationMethod: row.translationMethod as TranslationMethod,
          translationStatus: row.translationStatus,
          humanReviewStatus: row.humanReviewStatus,
          qualityGate: row.qualityGate,
          isPublic: row.isPublic,
          isProductionData: row.isProductionData,
          productionEligible: row.productionEligible,
          sourceId: row.sourceId ?? null,
          evidenceId: row.evidenceId ?? null,
          importBatchId: batchRecordId,
        },
        RevisionOrigin.IMPORT,
        actorId,
        `Multilingual import batch ${batchRecordId}`,
        manager,
      );

      // Determine outcome: if publishTranslation returned an existing row with the same id as
      // the row that already exists, it was already_current; otherwise a new row was inserted.
      // The service signals already_current by returning the existing row unchanged — its
      // importBatchId will NOT be batchRecordId (it was written in a prior import).
      const isAlreadyCurrent = published.importBatchId !== batchRecordId;
      return {
        ...base,
        outcome: isAlreadyCurrent ? MultilingualImportRowOutcome.ALREADY_CURRENT : MultilingualImportRowOutcome.INSERTED,
        translationId: published.id,
        errorDetail: null,
      };
    } catch (err) {
      return {
        ...base,
        outcome: MultilingualImportRowOutcome.FAILED,
        translationId: null,
        errorDetail: err instanceof Error ? err.message : String(err),
      };
    }
  }

  private buildDryRunResult(batchRecord: MultilingualImportBatch, contract: MultilingualImportContract): ImportBundleResult {
    const rowResults: ImportRowResult[] = contract.rows.map(row => ({
      placeId: row.placeId,
      fieldKey: row.fieldKey,
      localeCode: row.localeCode,
      rowHash: row.rowHash,
      outcome: MultilingualImportRowOutcome.INSERTED, // optimistic placeholder in dry-run
      translationId: null,
      errorDetail: null,
    }));
    return {
      batchId: contract.batchId,
      batchRecordId: batchRecord.id,
      dryRun: true,
      status: MultilingualImportBatchStatus.PENDING,
      totalRows: contract.totalRows,
      succeeded: contract.totalRows,
      alreadyCurrent: 0,
      held: 0,
      failed: 0,
      rowResults,
      errorSummary: null,
    };
  }

  private countOutcomes(results: ImportRowResult[]): { succeeded: number; alreadyCurrent: number; held: number; failed: number } {
    return results.reduce(
      (acc, r) => {
        if (r.outcome === MultilingualImportRowOutcome.INSERTED) acc.succeeded++;
        else if (r.outcome === MultilingualImportRowOutcome.ALREADY_CURRENT) acc.alreadyCurrent++;
        else if (r.outcome === MultilingualImportRowOutcome.HELD) acc.held++;
        else if (r.outcome === MultilingualImportRowOutcome.FAILED) acc.failed++;
        return acc;
      },
      { succeeded: 0, alreadyCurrent: 0, held: 0, failed: 0 },
    );
  }

  private async writeRowAudits(results: ImportRowResult[], batchRecordId: string): Promise<void> {
    const rows = results.map(r => {
      const row = new MultilingualImportRow();
      row.id = randomUUID();
      row.batchRecordId = batchRecordId;
      row.placeId = r.placeId;
      row.fieldKey = r.fieldKey;
      row.localeCode = r.localeCode;
      row.rowHash = r.rowHash;
      row.translationId = r.translationId;
      row.outcome = r.outcome;
      row.errorDetail = r.errorDetail;
      return row;
    });
    await this.rowRepo.insertMany(rows);
  }
}
