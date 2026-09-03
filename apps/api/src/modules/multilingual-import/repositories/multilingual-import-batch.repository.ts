import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { MultilingualImportBatch } from '../entities/multilingual-import-batch.entity';
import { MultilingualImportBatchStatus } from '../multilingual-import.enums';

@Injectable()
export class MultilingualImportBatchRepository {
  constructor(
    @InjectRepository(MultilingualImportBatch)
    private readonly repo: Repository<MultilingualImportBatch>,
  ) {}

  private target(manager?: EntityManager): Repository<MultilingualImportBatch> {
    return manager ? manager.getRepository(MultilingualImportBatch) : this.repo;
  }

  findByBatchId(batchId: string, manager?: EntityManager): Promise<MultilingualImportBatch | null> {
    return this.target(manager).findOne({ where: { batchId } });
  }

  findById(id: string, manager?: EntityManager): Promise<MultilingualImportBatch | null> {
    return this.target(manager).findOne({ where: { id } });
  }

  findByIdempotencyKey(idempotencyKey: string, manager?: EntityManager): Promise<MultilingualImportBatch | null> {
    return this.target(manager).findOne({ where: { idempotencyKey } });
  }

  // Governed cancellation (2026-09-02, Phase 3.6) — only ever moves PENDING → CANCELLED. Guards
  // against cancelling a batch that already ran (RUNNING/SUCCEEDED/FAILED history must never be
  // mutated — see MultilingualImportBatchStatus doc comment); throws instead of silently no-op-ing
  // so a caller cancelling the wrong batch id finds out immediately.
  async cancelPending(id: string, reason: string): Promise<void> {
    const result = await this.repo
      .createQueryBuilder()
      .update(MultilingualImportBatch)
      .set({ status: MultilingualImportBatchStatus.CANCELLED, cancellationReason: reason })
      .where('id = :id', { id })
      .andWhere('status = :pending', { pending: MultilingualImportBatchStatus.PENDING })
      .execute();
    if (!result.affected) {
      throw new BadRequestException(
        `cancelPending: batch ${id} was not found or is not currently PENDING — refusing to alter a batch that already ran or is not pending.`,
      );
    }
  }

  // Same guard as cancelPending, plus records which batch replaces this one.
  async supersedePending(id: string, supersededByBatchId: string, reason: string): Promise<void> {
    const result = await this.repo
      .createQueryBuilder()
      .update(MultilingualImportBatch)
      .set({ status: MultilingualImportBatchStatus.SUPERSEDED, cancellationReason: reason, supersededByBatchId })
      .where('id = :id', { id })
      .andWhere('status = :pending', { pending: MultilingualImportBatchStatus.PENDING })
      .execute();
    if (!result.affected) {
      throw new BadRequestException(
        `supersedePending: batch ${id} was not found or is not currently PENDING — refusing to alter a batch that already ran or is not pending.`,
      );
    }
  }

  // Returns the most recent succeeded batch with a matching sourceChecksum — used to block
  // duplicate imports of the same XLSX content even if batchId differs.
  findSucceededBySourceChecksum(sourceChecksum: string): Promise<MultilingualImportBatch | null> {
    return this.repo.findOne({
      where: { sourceChecksum, status: MultilingualImportBatchStatus.SUCCEEDED },
      order: { createdAt: 'DESC' },
    });
  }

  async insert(batch: MultilingualImportBatch, manager?: EntityManager): Promise<MultilingualImportBatch> {
    return this.target(manager).save(batch);
  }

  async update(
    id: string,
    partial: Partial<Pick<MultilingualImportBatch, 'status' | 'succeededRows' | 'failedRows' | 'heldRows' | 'alreadyCurrentRows' | 'errorSummary' | 'startedAt' | 'completedAt'>>,
    manager?: EntityManager,
  ): Promise<void> {
    await this.target(manager).update({ id }, partial);
  }
}
