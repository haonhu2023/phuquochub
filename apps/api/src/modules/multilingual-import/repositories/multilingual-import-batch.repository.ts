import { Injectable } from '@nestjs/common';
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
