import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { AuditService } from '../../core/audit/audit.service';
import { AuditResult } from '../../core/audit/audit.enums';
import { StorageService } from '../../core/storage/storage.service';
import { MediaRepository, OrphanCleanupCandidate } from './repositories/media.repository';

export interface MediaCleanupOptions {
  dryRun?: boolean;
  batchSize?: number;
  maxBatches?: number;
  maxExecutionMs?: number;
}

export interface MediaCleanupSummary {
  dryRun: boolean;
  // Query already filters to eligible rows only (MediaRepository.findOrphanCleanupCandidates) —
  // `scanned` and `eligible` are therefore always equal by construction; both are reported
  // separately only because the approved execution plan names them as distinct summary fields.
  scanned: number;
  eligible: number;
  deleted: number;
  notFound: number;
  skippedNoObjectKey: number;
  alreadyHandled: number;
  errors: number;
  batchesRun: number;
  timeBudgetExceeded: boolean;
  oldestCandidateCreatedAt: Date | null;
  newestCandidateCreatedAt: Date | null;
  sampleCandidates: Array<{ id: string; objectKey: string | null }>;
  durationMs: number;
}

const DEFAULT_BATCH_SIZE = 100; // matches clampLimit's existing max=100 pagination ceiling
const DEFAULT_MAX_BATCHES = 50; // bounds one invocation to at most 5,000 rows
const DEFAULT_MAX_EXECUTION_MS = 5 * 60 * 1000; // 5 minutes, per Owner instruction
const SAMPLE_SIZE = 10; // "first N candidate ids/object keys" in the dry-run summary

// Media Orphan Cleanup (2026-08-02, Owner-approved execution plan). Both dry-run and real runs
// share this SAME loop/candidate-fetch logic (plan requirement: "reuse the same cleanup logic
// wherever possible to avoid divergence") — dry-run simply skips the storage/DB/audit side
// effects inside processCandidate() and only accumulates observational stats.
@Injectable()
export class MediaCleanupService {
  private readonly logger = new Logger(MediaCleanupService.name);

  constructor(
    private readonly mediaRepo: MediaRepository,
    private readonly storage: StorageService,
    private readonly audit: AuditService,
  ) {}

  async run(options: MediaCleanupOptions = {}): Promise<MediaCleanupSummary> {
    const dryRun = options.dryRun ?? false;
    const batchSize = options.batchSize ?? DEFAULT_BATCH_SIZE;
    const maxBatches = options.maxBatches ?? DEFAULT_MAX_BATCHES;
    const maxExecutionMs = options.maxExecutionMs ?? DEFAULT_MAX_EXECUTION_MS;
    const correlationId = randomUUID();
    const startedAt = Date.now();

    const summary: MediaCleanupSummary = {
      dryRun,
      scanned: 0,
      eligible: 0,
      deleted: 0,
      notFound: 0,
      skippedNoObjectKey: 0,
      alreadyHandled: 0,
      errors: 0,
      batchesRun: 0,
      timeBudgetExceeded: false,
      oldestCandidateCreatedAt: null,
      newestCandidateCreatedAt: null,
      sampleCandidates: [],
      durationMs: 0,
    };

    for (let batch = 0; batch < maxBatches; batch++) {
      if (Date.now() - startedAt >= maxExecutionMs) {
        summary.timeBudgetExceeded = true;
        break;
      }

      const candidates = await this.mediaRepo.findOrphanCleanupCandidates(batchSize);
      if (candidates.length === 0) break;
      summary.batchesRun += 1;

      for (const candidate of candidates) {
        this.trackCandidateStats(summary, candidate);

        if (!dryRun) {
          // Requirement: "finish the current row safely" — once processCandidate() starts, it
          // always runs to full completion (storage delete → conditional soft-delete → audit, or
          // a controlled early-return on a storage error) before the time budget is re-checked
          // below. The budget is only ever consulted BETWEEN rows, never mid-row.
          await this.processCandidate(candidate, summary, correlationId);
        }

        if (Date.now() - startedAt >= maxExecutionMs) {
          summary.timeBudgetExceeded = true;
          break;
        }
      }

      if (summary.timeBudgetExceeded) break;
      if (candidates.length < batchSize) break; // last page — no more candidates exist
    }

    summary.durationMs = Date.now() - startedAt;
    this.logger.log(
      `Media orphan cleanup ${dryRun ? '(dry-run) ' : ''}finished: ${JSON.stringify(summary)}`,
    );
    return summary;
  }

  private trackCandidateStats(summary: MediaCleanupSummary, candidate: OrphanCleanupCandidate): void {
    summary.scanned += 1;
    summary.eligible += 1;
    if (!summary.oldestCandidateCreatedAt || candidate.createdAt < summary.oldestCandidateCreatedAt) {
      summary.oldestCandidateCreatedAt = candidate.createdAt;
    }
    if (!summary.newestCandidateCreatedAt || candidate.createdAt > summary.newestCandidateCreatedAt) {
      summary.newestCandidateCreatedAt = candidate.createdAt;
    }
    if (summary.sampleCandidates.length < SAMPLE_SIZE) {
      summary.sampleCandidates.push({ id: candidate.id, objectKey: candidate.objectKey });
    }
  }

  private async processCandidate(
    candidate: OrphanCleanupCandidate,
    summary: MediaCleanupSummary,
    correlationId: string,
  ): Promise<void> {
    let storageOutcome: 'deleted' | 'not_found' | 'skipped_no_object_key';

    if (!candidate.objectKey) {
      // Defensive only — no real upload-path row should ever reach 'pending'+orphan without an
      // object_key (MediaRepository.createUploaded always sets it), but nothing in the schema
      // forbids it, so this is handled explicitly rather than assumed impossible.
      storageOutcome = 'skipped_no_object_key';
      summary.skippedNoObjectKey += 1;
    } else {
      try {
        const result = await this.storage.deleteObjectForCleanup(candidate.objectKey);
        storageOutcome = result.outcome;
        if (result.outcome === 'deleted') summary.deleted += 1;
        else summary.notFound += 1;
      } catch (err) {
        // Requirement: other storage errors must NOT delete the database row. Left untouched —
        // still eligible, will be retried automatically by the next invocation (job is idempotent).
        summary.errors += 1;
        this.logger.warn(
          `Media orphan cleanup: storage delete failed for media ${candidate.id} ` +
            `(object_key=${candidate.objectKey}) — DB row left untouched, will retry next run: ` +
            `${(err as Error).message}`,
        );
        return;
      }
    }

    const changed = await this.mediaRepo.softDeleteOrphanCandidate(candidate.id);
    if (!changed) {
      // Row no longer matches the full eligibility predicate — already cleaned by a concurrent/
      // earlier run, or was attached to an owner in the meantime. No-op, not an error, no audit
      // record (avoids a duplicate audit entry for one physical cleanup — see execution plan §7).
      summary.alreadyHandled += 1;
      this.logger.debug(`Media orphan cleanup: media ${candidate.id} already handled, skipping`);
      return;
    }

    await this.audit.record({
      event: 'media.orphan_cleaned',
      entityType: 'media',
      entityId: candidate.id,
      actorId: null,
      actorRole: null,
      isServiceAccount: true,
      permission: null,
      scope: null,
      result: AuditResult.SUCCESS,
      before: { status: 'pending', deletedAt: null },
      after: { status: 'pending', deletedAt: new Date().toISOString() },
      context: {
        objectKey: candidate.objectKey,
        bucket: candidate.bucket,
        uploadedBy: candidate.uploadedBy,
        // AuditService.redact() walks plain-object own-properties (Object.entries) — a raw Date
        // has none (its value lives internally), so passing one through unconverted silently
        // becomes "{}" in the persisted audit row. Discovered via live verification against a
        // real audit_logs row, not assumed. Serialize explicitly, same as `after.deletedAt` below.
        createdAt: candidate.createdAt.toISOString(),
        storageOutcome,
      },
      correlationId,
    });
  }
}
