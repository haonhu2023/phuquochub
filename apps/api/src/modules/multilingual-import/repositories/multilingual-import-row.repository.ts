import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { MultilingualImportRow } from '../entities/multilingual-import-row.entity';

@Injectable()
export class MultilingualImportRowRepository {
  constructor(
    @InjectRepository(MultilingualImportRow)
    private readonly repo: Repository<MultilingualImportRow>,
  ) {}

  private target(manager?: EntityManager): Repository<MultilingualImportRow> {
    return manager ? manager.getRepository(MultilingualImportRow) : this.repo;
  }

  findByBatchRecordId(batchRecordId: string): Promise<MultilingualImportRow[]> {
    return this.repo.find({ where: { batchRecordId }, order: { createdAt: 'ASC' } });
  }

  // Checks if an identical row hash was already successfully imported (INSERTED/ALREADY_CURRENT)
  // in any past batch. Used for per-row idempotency.
  async findPriorSuccessForRowHash(
    placeId: string,
    fieldKey: string,
    localeCode: string,
    rowHash: string,
  ): Promise<MultilingualImportRow | null> {
    return this.repo
      .createQueryBuilder('r')
      .innerJoin('multilingual_import_batches', 'b', 'b.id = r.batch_record_id')
      .where('r.place_id = :placeId', { placeId })
      .andWhere('r.field_key = :fieldKey', { fieldKey })
      .andWhere('r.locale_code = :localeCode', { localeCode })
      .andWhere('r.row_hash = :rowHash', { rowHash })
      .andWhere("r.outcome IN ('inserted', 'already_current')")
      .andWhere("b.status = 'succeeded'")
      .orderBy('r.created_at', 'DESC')
      .getOne();
  }

  async insertMany(rows: MultilingualImportRow[], manager?: EntityManager): Promise<void> {
    if (rows.length === 0) return;
    await this.target(manager).save(rows);
  }
}
