import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { OwnerDecisionQueueItem, OdqStatus } from './entities/owner-decision-queue.entity';

@Injectable()
export class OwnerDecisionQueueRepository {
  constructor(
    @InjectRepository(OwnerDecisionQueueItem)
    private readonly repo: Repository<OwnerDecisionQueueItem>,
  ) {}

  create(data: Partial<OwnerDecisionQueueItem>): OwnerDecisionQueueItem {
    return this.repo.create(data);
  }

  save(item: OwnerDecisionQueueItem): Promise<OwnerDecisionQueueItem> {
    return this.repo.save(item);
  }

  saveMany(items: OwnerDecisionQueueItem[]): Promise<OwnerDecisionQueueItem[]> {
    return this.repo.save(items);
  }

  findById(id: string): Promise<OwnerDecisionQueueItem | null> {
    return this.repo.findOne({ where: { id } });
  }

  findPendingByPlace(placeId: string): Promise<OwnerDecisionQueueItem[]> {
    return this.repo.find({
      where: { placeId, status: 'pending' },
      order: { createdAt: 'ASC' },
    });
  }

  findPendingByCandidate(candidateKey: string): Promise<OwnerDecisionQueueItem[]> {
    return this.repo.find({
      where: { candidateKey, status: 'pending' },
      order: { createdAt: 'ASC' },
    });
  }

  findByStatus(status: OdqStatus, limit = 50): Promise<OwnerDecisionQueueItem[]> {
    return this.repo.find({
      where: { status },
      order: { createdAt: 'ASC' },
      take: limit,
    });
  }

  async hasResolvedDecision(placeId: string, field: string): Promise<boolean> {
    const count = await this.repo.count({
      where: { placeId, field, status: 'resolved' },
    });
    return count > 0;
  }

  async hasPendingConflict(placeId: string, field: string): Promise<boolean> {
    const count = await this.repo.count({
      where: { placeId, field, status: 'pending' },
    });
    return count > 0;
  }

  findAll(status?: OdqStatus, limit = 50, offset = 0): Promise<OwnerDecisionQueueItem[]> {
    return this.repo.find({
      where: status ? { status } : undefined,
      order: { createdAt: 'DESC' },
      take: limit,
      skip: offset,
    });
  }
}
