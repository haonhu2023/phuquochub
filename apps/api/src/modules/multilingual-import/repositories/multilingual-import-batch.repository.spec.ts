import { BadRequestException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { MultilingualImportBatchRepository } from './multilingual-import-batch.repository';
import { MultilingualImportBatch } from '../entities/multilingual-import-batch.entity';

function makeQueryBuilderMock(affected: number) {
  const qb = {
    update: jest.fn().mockReturnThis(),
    set: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    execute: jest.fn().mockResolvedValue({ affected }),
  };
  return qb;
}

describe('MultilingualImportBatchRepository — batch lifecycle governance', () => {
  describe('cancelPending', () => {
    it('cancels a PENDING batch and records the reason', async () => {
      const qb = makeQueryBuilderMock(1);
      const typeormRepo = { createQueryBuilder: jest.fn().mockReturnValue(qb) } as unknown as Repository<MultilingualImportBatch>;
      const repo = new MultilingualImportBatchRepository(typeormRepo);

      await repo.cancelPending('batch-1', 'Superseded by a fresh export before it ever ran.');

      expect(qb.set).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'cancelled', cancellationReason: 'Superseded by a fresh export before it ever ran.' }),
      );
      expect(qb.andWhere).toHaveBeenCalledWith('status = :pending', { pending: 'pending' });
    });

    it('throws when the batch is not PENDING (0 rows affected) instead of silently no-op-ing', async () => {
      const qb = makeQueryBuilderMock(0);
      const typeormRepo = { createQueryBuilder: jest.fn().mockReturnValue(qb) } as unknown as Repository<MultilingualImportBatch>;
      const repo = new MultilingualImportBatchRepository(typeormRepo);

      await expect(repo.cancelPending('batch-already-succeeded', 'x')).rejects.toThrow(BadRequestException);
    });
  });

  describe('supersedePending', () => {
    it('marks a PENDING batch superseded and records the replacement batch id', async () => {
      const qb = makeQueryBuilderMock(1);
      const typeormRepo = { createQueryBuilder: jest.fn().mockReturnValue(qb) } as unknown as Repository<MultilingualImportBatch>;
      const repo = new MultilingualImportBatchRepository(typeormRepo);

      await repo.supersedePending('batch-old', 'batch-new', 'Corrected content re-submitted.');

      expect(qb.set).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'superseded', supersededByBatchId: 'batch-new' }),
      );
    });

    it('throws when the batch is not PENDING', async () => {
      const qb = makeQueryBuilderMock(0);
      const typeormRepo = { createQueryBuilder: jest.fn().mockReturnValue(qb) } as unknown as Repository<MultilingualImportBatch>;
      const repo = new MultilingualImportBatchRepository(typeormRepo);

      await expect(repo.supersedePending('batch-1', 'batch-2', 'x')).rejects.toThrow(BadRequestException);
    });
  });
});
